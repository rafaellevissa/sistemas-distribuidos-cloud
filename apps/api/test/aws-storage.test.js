const test = require('node:test');
const assert = require('node:assert/strict');
const { createAwsStorage, awsClientOptions } = require('../src/storage/aws-storage');

test('AWS uses the default credential chain, aliases and optional local endpoint', () => {
  assert.deepEqual(awsClientOptions({ AWS_REGION: 'us-east-1' }), { region: 'us-east-1' });
  assert.deepEqual(awsClientOptions({ AWS_S3_REGION: 'eu-west-1', AWS_REGION: 'us-east-1', S3_ENDPOINT: 'http://minio:9000' }), {
    region: 'eu-west-1', endpoint: 'http://minio:9000', forcePathStyle: true,
  });
  assert.equal(awsClientOptions({ S3_FORCE_PATH_STYLE: 'false' }).forcePathStyle, false);
});

test('AWS uploads and signs the configured bucket/key without network access', async () => {
  class Command { constructor(input) { this.input = input; } }
  const sent = [];
  const client = { async send(command) { sent.push(command.input); } };
  const storage = createAwsStorage({ bucket: 'uploads' }, {
    sdk: { PutObjectCommand: Command, GetObjectCommand: Command }, client,
    async signUrl(actualClient, command, options) {
      assert.equal(actualClient, client);
      assert.deepEqual(command.input, { Bucket: 'uploads', Key: 'photo.png' });
      assert.deepEqual(options, { expiresIn: 3600 });
      return 'https://signed.example/photo.png';
    },
  });
  const body = Buffer.from('image');
  await storage.upload({ key: 'photo.png', body, contentType: 'image/png' });
  assert.deepEqual(sent, [{ Bucket: 'uploads', Key: 'photo.png', Body: body, ContentType: 'image/png' }]);
  assert.equal(await storage.getReadUrl({ key: 'photo.png', expiresIn: 3600 }), 'https://signed.example/photo.png');
});

test('AWS propagates SDK and signing failures', async () => {
  class Command { constructor(input) { this.input = input; } }
  const failure = new Error('IAM denied');
  const storage = createAwsStorage({ bucket: 'uploads' }, {
    sdk: { PutObjectCommand: Command, GetObjectCommand: Command },
    client: { async send() { throw failure; } },
    async signUrl() { throw failure; },
  });
  await assert.rejects(storage.upload({ key: 'photo.png', body: Buffer.alloc(0), contentType: 'image/png' }), failure);
  await assert.rejects(storage.getReadUrl({ key: 'photo.png', expiresIn: 3600 }), failure);
});
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGcpStorage } = require('../src/storage/gcp-storage');
const { createStorage } = require('../src/storage');

test('GCP saves MIME metadata and signs a V4 read URL for the requested TTL', async () => {
  const body = Buffer.from('image');
  const file = {
    async save(actualBody, options) {
      assert.equal(actualBody, body);
      assert.deepEqual(options, { resumable: false, contentType: 'image/png' });
    },
    async getSignedUrl(options) {
      assert.deepEqual(options, { version: 'v4', action: 'read', expires: 3601000 });
      return ['https://storage.googleapis.com/signed'];
    },
  };
  const client = { bucket(bucket) {
    assert.equal(bucket, 'uploads');
    return { file(key) { assert.equal(key, 'photo.png'); return file; } };
  } };
  const storage = createGcpStorage({ bucket: 'uploads' }, { client, now: () => 1000 });
  await storage.upload({ key: 'photo.png', body, contentType: 'image/png' });
  assert.equal(await storage.getReadUrl({ key: 'photo.png', expiresIn: 3600 }), 'https://storage.googleapis.com/signed');
});

test('factory uses existing provider/bucket validation before loading SDKs', () => {
  assert.throws(() => createStorage({ STORAGE_PROVIDER: 'invalid', STORAGE_BUCKET: 'uploads' }), /Unsupported storage provider/);
  assert.throws(() => createStorage({ CLOUD_PROVIDER: 'gcp' }), /STORAGE_BUCKET is required/);
  let selectedBucket;
  const storage = createStorage({ CLOUD_PROVIDER: 'gcp', STORAGE_BUCKET: 'gcp-uploads' }, {
    client: { bucket(name) { selectedBucket = name; return {}; } },
  });
  assert.equal(selectedBucket, 'gcp-uploads');
  assert.equal(typeof storage.upload, 'function');
});

test('GCP propagates upload and signing failures', async () => {
  const failure = new Error('IAM denied');
  const storage = createGcpStorage({ bucket: 'uploads' }, {
    client: { bucket: () => ({ file: () => ({
      save: async () => { throw failure; },
      getSignedUrl: async () => { throw failure; },
    }) }) },
  });
  await assert.rejects(storage.upload({ key: 'photo.png', body: Buffer.alloc(0), contentType: 'image/png' }), failure);
  await assert.rejects(storage.getReadUrl({ key: 'photo.png', expiresIn: 3600 }), failure);
});
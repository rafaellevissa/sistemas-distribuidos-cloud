const assert = require('node:assert/strict');
const { test } = require('node:test');
const { storageConfig } = require('../src/storage/config');

test('storage provider is explicit and invalid providers fail before SDK creation', () => {
  assert.deepEqual(storageConfig({ CLOUD_PROVIDER: 'gcp', STORAGE_BUCKET: 'images' }), {
    provider: 'gcp', bucket: 'images',
  });
  assert.throws(() => storageConfig({ STORAGE_PROVIDER: 'unknown' }), /Unsupported/);
  assert.throws(() => storageConfig({ STORAGE_PROVIDER: 'gcp' }), /STORAGE_BUCKET/);
});

test('existing AWS configuration remains compatible and explicit values win', () => {
  assert.deepEqual(storageConfig({ AWS_S3_BUCKET_NAME: 'legacy' }), {
    provider: 'aws', bucket: 'legacy',
  });
  assert.deepEqual(storageConfig({ CLOUD_PROVIDER: 'gcp', STORAGE_PROVIDER: 'aws', STORAGE_BUCKET: 'new', AWS_S3_BUCKET_NAME: 'old' }), {
    provider: 'aws', bucket: 'new',
  });
});
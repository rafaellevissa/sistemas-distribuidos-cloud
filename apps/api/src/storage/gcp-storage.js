function createGcpStorage({ bucket }, dependencies = {}) {
  const client = dependencies.client || new (require('@google-cloud/storage').Storage)();
  const target = client.bucket(bucket);
  const now = dependencies.now || Date.now;
  return {
    async upload({ key, body, contentType }) {
      await target.file(key).save(body, { resumable: false, contentType });
    },
    async getReadUrl({ key, expiresIn }) {
      const [url] = await target.file(key).getSignedUrl({
        version: 'v4', action: 'read', expires: now() + expiresIn * 1000,
      });
      return url;
    },
  };
}

module.exports = { createGcpStorage };
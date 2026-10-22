function storageConfig(environment = process.env) {
  const provider = environment.STORAGE_PROVIDER || environment.CLOUD_PROVIDER || 'aws';
  if (!['aws', 'gcp'].includes(provider)) {
    throw new Error(`Unsupported storage provider: ${provider}`);
  }
  const bucket = environment.STORAGE_BUCKET || environment.AWS_S3_BUCKET_NAME;
  if (!bucket) throw new Error('STORAGE_BUCKET is required');
  return { provider, bucket };
}

module.exports = { storageConfig };
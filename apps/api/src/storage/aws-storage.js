function awsClientOptions(environment = process.env) {
  const options = { region: environment.AWS_S3_REGION || environment.AWS_REGION };
  if (environment.S3_ENDPOINT) options.endpoint = environment.S3_ENDPOINT;
  if (environment.S3_FORCE_PATH_STYLE !== undefined) {
    options.forcePathStyle = environment.S3_FORCE_PATH_STYLE === 'true';
  } else if (environment.S3_ENDPOINT) {
    options.forcePathStyle = true;
  }
  return options;
}

function createAwsStorage({ bucket, environment = process.env }, dependencies = {}) {
  const sdk = dependencies.sdk || require('@aws-sdk/client-s3');
  const client = dependencies.client || new sdk.S3Client(awsClientOptions(environment));
  const signUrl = dependencies.signUrl || require('@aws-sdk/s3-request-presigner').getSignedUrl;
  return {
    async upload({ key, body, contentType }) {
      await client.send(new sdk.PutObjectCommand({
        Bucket: bucket, Key: key, Body: body, ContentType: contentType,
      }));
    },
    getReadUrl({ key, expiresIn }) {
      return signUrl(client, new sdk.GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
    },
  };
}

module.exports = { createAwsStorage, awsClientOptions };
const { storageConfig } = require('./config');
const { createAwsStorage } = require('./aws-storage');
const { createGcpStorage } = require('./gcp-storage');

function createStorage(environment = process.env, dependencies = {}) {
  const config = storageConfig(environment);
  const factories = { aws: createAwsStorage, gcp: createGcpStorage };
  return factories[config.provider]({ ...config, environment }, dependencies);
}

module.exports = { createStorage };
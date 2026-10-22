'use strict';

const fs = require('node:fs');
const YAML = require('yaml');
const Ajv = require('ajv');
const schema = require('../../config/schema.json');
const { context } = require('./paths');

const checkSchema = new Ajv({ allErrors: true, strict: true }).compile(schema);

function validateConfig(config, { target = 'gcp', environment = 'dev', example = false } = {}) {
  context(target, environment);
  if (!checkSchema(config)) {
    throw new Error(`Invalid configuration: ${JSON.stringify(checkSchema.errors)}`);
  }
  if (config.target !== target || config.environment !== environment) {
    throw new Error('Configuration target/environment does not match requested context');
  }
  const { minReplicas, maxReplicas } = config.sizing;
  if (maxReplicas < minReplicas) throw new Error('maxReplicas must be >= minReplicas');
  if (config.profile === 'ha' && minReplicas < 2) throw new Error('ha requires at least two replicas');
  if (environment === 'prod' && config.profile !== 'ha') throw new Error('prod requires the ha profile');
  if (!example && /replace|example\.(com|net|org)|changeme|placeholder/i.test(JSON.stringify(config))) {
    throw new Error('Replace all template placeholders before using cloud commands');
  }
  if (!example && environment === 'prod' && config.productionEnabled !== true) {
    throw new Error('Production is disabled; explicitly set productionEnabled: true in prod.yaml');
  }
  return config;
}

function loadConfig(options) {
  let filename = context(options.target, options.environment).configPath;
  if (options.example && options.environment === 'prod') filename = filename.replace(/prod\.yaml$/, 'prod.example.yaml');
  const document = YAML.parseDocument(fs.readFileSync(filename, 'utf8'), { uniqueKeys: true });
  if (document.errors.length) throw new Error(`Invalid YAML: ${document.errors[0].message}`);
  return validateConfig(document.toJS({ maxAliasCount: 20 }), options);
}

module.exports = { loadConfig, validateConfig };
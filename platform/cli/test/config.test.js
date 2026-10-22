'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig, validateConfig } = require('../src/config');

const config = {
  schemaVersion: 1, target: 'gcp', environment: 'dev', profile: 'economy', projectId: 'demo-project',
  region: 'us-central1', hostname: 'demo.acme.test', stateBucket: 'demo-state',
  storageBucket: 'demo-project-uploads', buildServiceAccount: 'build@demo-project.iam.gserviceaccount.com',
  sizing: { minReplicas: 1, maxReplicas: 2, dbTier: 'db-f1-micro' },
};

test('real YAML examples validate structurally but are not cloud-ready', () => {
  assert.equal(loadConfig({ target: 'gcp', environment: 'dev', example: true }).schemaVersion, 1);
  assert.equal(loadConfig({ target: 'gcp', environment: 'prod', example: true }).productionEnabled, false);
  assert.throws(() => loadConfig({ target: 'gcp', environment: 'dev' }), /placeholder/);
});

test('schema refuses secrets, unsupported providers, unknown fields and invalid sizing', () => {
  assert.equal(validateConfig(config), config);
  for (const changed of [
    { ...config, password: 'not-allowed' }, { ...config, schemaVersion: 2 }, { ...config, target: 'aws' },
    { ...config, region: '../region' }, { ...config, sizing: { ...config.sizing, minReplicas: 3 } },
    { ...config, profile: 'ha' }, { ...config, hostname: 'REPLACE_HOSTNAME' },
    { ...config, sizing: { ...config.sizing, maxReplicas: 11 } },
  ]) assert.throws(() => validateConfig(changed));
  assert.throws(() => validateConfig(config, { environment: 'prod' }), /context/);
});

test('production requires both explicit activation and HA configuration', () => {
  const production = { ...config, environment: 'prod', profile: 'ha', sizing: { ...config.sizing, minReplicas: 2 } };
  assert.throws(() => validateConfig(production, { environment: 'prod' }), /disabled/);
  assert.equal(validateConfig({ ...production, productionEnabled: true }, { environment: 'prod' }).productionEnabled, true);
});

test('foundation storage and build identity are required strings and placeholders are example-only', () => {
  for (const field of ['storageBucket', 'buildServiceAccount']) {
    const missing = { ...config };
    delete missing[field];
    assert.throws(() => validateConfig(missing), /Invalid configuration/);
    for (const value of [null, {}, '', 'invalid/value']) {
      assert.throws(() => validateConfig({ ...config, [field]: value }), /Invalid configuration/);
    }
    const template = { ...config, [field]: 'REPLACE_PROJECT_VALUE' };
    assert.equal(validateConfig(template, { example: true }), template);
    assert.throws(() => validateConfig(template), /placeholder/);
  }
  assert.throws(() => validateConfig({ ...config, storageBucket: 'bucket.with.dots' }), /Invalid configuration/);
  assert.throws(() => validateConfig({ ...config, buildServiceAccount: 'build@example.com' }), /Invalid configuration/);
  assert.throws(() => validateConfig({ ...config, buildServiceAccount: 'build@replace-project.iam.gserviceaccount.com' }), /placeholder/);
});
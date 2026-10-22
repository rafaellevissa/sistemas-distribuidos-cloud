'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ROOT, context } = require('../src/paths');

test('paths are repository-relative, never caller-relative', () => {
  assert.equal(ROOT, path.resolve(__dirname, '../../..'));
  assert.equal(context('gcp', 'dev', 'runtime').cwd, path.join(ROOT, 'infra/stacks/gcp/runtime'));
  assert.equal(context('gcp', 'dev').directory, path.join(ROOT, '.platform/gcp/dev/foundation'));
});

test('provider, environment and stack reject unsupported and traversal input', () => {
  for (const target of ['aws', '../gcp', '', 'toString']) {
    assert.throws(() => context(target, 'dev'), /target/);
  }
  for (const environment of ['staging', '../dev', '']) {
    assert.throws(() => context('gcp', environment), /Environment/);
  }
  for (const stack of ['bootstrap', '../runtime', 'constructor', 'toString']) {
    assert.throws(() => context('gcp', 'dev', stack), /Stack/);
  }
});
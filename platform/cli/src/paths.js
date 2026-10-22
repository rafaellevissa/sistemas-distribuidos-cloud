'use strict';

const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const ROOTS = Object.freeze({
  foundation: 'infra/stacks/gcp/foundation',
  runtime: 'infra/stacks/gcp/runtime',
});

function context(target, environment, stack = 'foundation') {
  if (target !== 'gcp') throw new Error('Unsupported target: only gcp is enabled');
  if (!['dev', 'prod'].includes(environment)) throw new Error('Environment must be dev or prod');
  if (!Object.hasOwn(ROOTS, stack)) throw new Error('Stack must be foundation or runtime');
  return {
    root: ROOT,
    cwd: path.join(ROOT, ROOTS[stack]),
    directory: path.join(ROOT, '.platform', target, environment, stack),
    configPath: path.join(ROOT, 'platform/environments', target, `${environment}.yaml`),
    prefix: `gcp/${environment}/${stack}`,
  };
}

module.exports = { ROOT, ROOTS, context };
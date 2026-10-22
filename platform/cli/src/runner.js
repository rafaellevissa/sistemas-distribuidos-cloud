'use strict';

const { spawnSync } = require('node:child_process');

function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env, TF_IN_AUTOMATION: '1' },
    shell: false,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30 * 60 * 1000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${binary} ${args[0]} failed (${result.error?.code || result.status}); check credentials, tool installation and Terraform diagnostics locally. No automatic retry was attempted.`);
  }
  if (options.display && result.stdout) process.stderr.write(result.stdout);
  return result.stdout;
}

function objectOutput(text, description) {
  let value;
  try { value = JSON.parse(text); } catch { throw new Error(`${description} is not valid JSON`); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) {
    throw new Error(`${description} must be a nonempty JSON object`);
  }
  return value;
}

module.exports = { run, objectOutput };
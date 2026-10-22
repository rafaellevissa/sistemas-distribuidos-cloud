#!/usr/bin/env node
'use strict';

const { parseArgs } = require('node:util');
const { createPlatform } = require('./platform');
const { context } = require('./paths');

const HELP = `distributed-cloud <command> [flags]
Commands: validate, doctor, plan, apply, outputs, status, deploy, destroy, bootstrap
Common: --target gcp --environment dev|prod
validate: --example (structural template validation only)
plan/apply/outputs/status: --stack foundation|runtime
runtime plan/apply/deploy/destroy: --image REGION-docker.pkg.dev/PROJECT/REPO/IMAGE@sha256:DIGEST --secret-version INTEGER
apply: --confirm gcp/ENVIRONMENT/STACK (saved reviewed plan required)
destroy: --stack runtime --confirm gcp/dev/runtime --allow-data-loss (dev destroy PLAN only)
apply destroy plan: repeat --allow-data-loss and confirmation
deploy: runtime PLAN only; no schema runner or automatic rollout is implemented
bootstrap: owner instructions only; see docs/onboarding/gcp.md
Examples are not deployable. Production requires explicit prod.yaml activation.
`;

const FLAGS = {
  validate: ['example'], doctor: [], plan: ['stack', 'image', 'secret-version'],
  apply: ['stack', 'image', 'secret-version', 'confirm', 'allow-data-loss'],
  outputs: ['stack'], status: ['stack'], deploy: ['image', 'secret-version'],
  destroy: ['stack', 'image', 'secret-version', 'confirm', 'allow-data-loss'], bootstrap: [],
};

function parse(argv) {
  const [command, ...args] = argv;
  if (!command || command === '--help' || command === 'help') return { help: true };
  if (!Object.hasOwn(FLAGS, command)) throw new Error(`Unknown command: ${command}`);
  const options = Object.fromEntries(['target', 'environment', 'help', ...FLAGS[command]].map(name => [name, { type: ['help', 'example', 'allow-data-loss'].includes(name) ? 'boolean' : 'string' }]));
  const { values } = parseArgs({ args, options, strict: true, allowPositionals: false });
  for (const name of Object.keys(options)) {
    if (args.filter(argument => argument === `--${name}` || argument.startsWith(`--${name}=`)).length > 1) throw new Error(`Duplicate --${name}`);
  }
  return { command, options: { target: 'gcp', environment: 'dev', ...values }, help: values.help };
}

function main(argv = process.argv.slice(2)) {
  const parsed = parse(argv);
  if (parsed.options) context(parsed.options.target, parsed.options.environment, parsed.options.stack || 'foundation');
  if (parsed.help || parsed.command === 'bootstrap') {
    process.stdout.write(HELP);
    return;
  }
  const result = createPlatform().execute(parsed.command, parsed.options);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`platform: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { parse, main };
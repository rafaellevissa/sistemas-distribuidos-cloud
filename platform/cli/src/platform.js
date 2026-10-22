'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ROOT, context } = require('./paths');
const { run: defaultRun, objectOutput } = require('./runner');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function hash(value) {
  return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : JSON.stringify(canonical(value))).digest('hex');
}

function createPlatform({ run = defaultRun, root = ROOT, loadConfig = options => require('./config').loadConfig(options) } = {}) {
  function locations(options, stack = options.stack) {
    const selected = context(options.target, options.environment, stack);
    return {
      cwd: path.join(root, path.relative(ROOT, selected.cwd)),
      directory: path.join(root, path.relative(ROOT, selected.directory)),
    };
  }

  function prepare(options, config, stack = options.stack) {
    const location = locations(options, stack);
    if (!fs.existsSync(location.cwd)) throw new Error(`Missing Terraform root: ${location.cwd}`);
    fs.mkdirSync(location.directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(location.directory, 0o700);
    for (const filename of ['reviewed.tfplan', 'plan.txt', 'plan.json', 'inputs.auto.tfvars.json']) {
      const generated = path.join(location.directory, filename);
      if (fs.existsSync(generated)) fs.chmodSync(generated, 0o600);
    }
    const backend = { bucket: config.stateBucket, prefix: `gcp/${config.projectId}/${options.environment}/${stack}` };
    const exec = (args, display = false) => run('terraform', args, {
      cwd: location.cwd,
      env: { TF_DATA_DIR: path.join(location.directory, 'terraform') },
      display,
    });
    exec(['init', '-input=false', '-reconfigure', `-backend-config=bucket=${backend.bucket}`, `-backend-config=prefix=${backend.prefix}`]);
    return { ...location, backend, exec };
  }

  function variables(options, config) {
    const common = { project_id: config.projectId, region: config.region, environment: config.environment, name: 'distributed-cloud' };
    if (options.stack === 'foundation') return { ...common, profile: config.profile, db_tier: config.sizing.dbTier, bucket_name: config.storageBucket, build_service_account: config.buildServiceAccount };
    if (!new RegExp(`^${config.region}-docker\\.pkg\\.dev/${config.projectId}/[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$`).test(options.image || '')) {
      throw new Error('Runtime requires a full Artifact Registry image in this project/region pinned with @sha256:<64 lowercase hex>');
    }
    if (!/^[1-9][0-9]*$/.test(options['secret-version'] || '') || !Number.isSafeInteger(Number(options['secret-version']))) {
      throw new Error('Runtime requires --secret-version as a positive safe integer');
    }
    const foundation = prepare(options, config, 'foundation');
    const platform = objectOutput(foundation.exec(['output', '-json', 'platform']), 'Foundation platform output');
    return { ...common, platform, image: options.image, runtime_secret_version: Number(options['secret-version']), hostname: config.hostname, min_replicas: config.sizing.minReplicas, max_replicas: config.sizing.maxReplicas };
  }

  function revision() {
    const head = run('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root }).trim();
    if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('Repository HEAD must be a full commit SHA');
    const changes = run('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root });
    if (changes.trim()) throw new Error('Commit or remove working-tree changes before planning/applying; config and Terraform must be reviewed');
    return head;
  }

  function writePrivate(filename, value) {
    fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    fs.chmodSync(filename, 0o600);
  }

  function binding(options, config, vars, prepared) {
    return { schemaVersion: 1, target: options.target, environment: options.environment, stack: options.stack, backend: prepared.backend, commit: revision(), configHash: hash(config), varsHash: hash(vars) };
  }

  function confirmation(options) {
    const expected = `${options.target}/${options.environment}/${options.stack}`;
    if (options.confirm !== expected) throw new Error(`Explicit --confirm ${expected} is required`);
  }

  function execute(command, options) {
    context(options.target, options.environment, options.stack || 'foundation');
    const config = loadConfig(options);
    if (command === 'validate') return { valid: true, exampleOnly: Boolean(options.example), target: options.target, environment: options.environment };
    if (options.example) throw new Error('--example is only allowed for validate');
    if (command === 'doctor') {
      const terraform = run('terraform', ['version', '-json'], { cwd: root });
      objectOutput(terraform, 'Terraform version');
      revision();
      return { configuration: 'valid', terraform: 'available', credentials: 'not probed', roots: Object.fromEntries(['foundation', 'runtime'].map(stack => [stack, fs.existsSync(locations(options, stack).cwd)])) };
    }
    if (command === 'deploy') {
      if (options.stack && options.stack !== 'runtime') throw new Error('deploy only creates a runtime plan');
      options = { ...options, stack: 'runtime' };
      command = 'plan';
    }
    if (!options.stack) throw new Error('--stack foundation or runtime is required');
    if (command === 'apply' || command === 'destroy') confirmation(options);
    if (command === 'destroy' && (options.environment !== 'dev' || options.stack !== 'runtime' || !options['allow-data-loss'])) {
      throw new Error('Destroy is restricted to dev runtime and requires --allow-data-loss; foundation/bootstrap are owner-managed');
    }
    const location = locations(options);
    const planPath = path.join(location.directory, 'reviewed.tfplan');
    const metadataPath = path.join(location.directory, 'plan.json');
    if (command === 'apply' && (!fs.existsSync(planPath) || !fs.existsSync(metadataPath))) {
      throw new Error('No saved reviewed plan; run plan first');
    }
    if (command === 'outputs' || command === 'status') {
      const prepared = prepare(options, config);
      if (options.stack === 'foundation') return objectOutput(prepared.exec(['output', '-json', 'platform']), 'Foundation platform output');
      const outputs = objectOutput(prepared.exec(['output', '-json']), 'Runtime outputs');
      return Object.fromEntries(Object.entries(outputs).map(([key, entry]) => {
        if (!entry || typeof entry !== 'object' || typeof entry.sensitive !== 'boolean' || !Object.hasOwn(entry, 'value') || !Object.hasOwn(entry, 'type')) {
          throw new Error('Malformed Terraform output envelope');
        }
        return [key, entry.sensitive ? '[REDACTED]' : entry.value];
      }));
    }
    if (!['plan', 'apply', 'destroy'].includes(command)) throw new Error('Unsupported command');
    const vars = variables(options, config);
    const prepared = prepare(options, config);
    const expected = binding(options, config, vars, prepared);
    const varsPath = path.join(prepared.directory, 'inputs.auto.tfvars.json');
    if (command === 'apply') {
      const metadata = objectOutput(fs.readFileSync(metadataPath, 'utf8'), 'Saved plan metadata');
      const actual = { ...expected, planHash: hash(fs.readFileSync(planPath)), operation: metadata.operation };
      if (!['plan', 'destroy'].includes(metadata.operation) || hash(metadata) !== hash(actual)) throw new Error('Saved plan context/commit/config/variables/hash mismatch; create and review a new plan');
      if (metadata.operation === 'destroy' && (options.environment !== 'dev' || options.stack !== 'runtime' || !options['allow-data-loss'])) {
        throw new Error('Applying a destroy plan requires dev runtime and --allow-data-loss');
      }
      fs.unlinkSync(metadataPath);
      prepared.exec(['apply', '-input=false', '-lock-timeout=5m', planPath], true);
      return { applied: true, stack: options.stack };
    }
    fs.rmSync(metadataPath, { force: true });
    fs.rmSync(planPath, { force: true });
    const reviewPath = path.join(prepared.directory, 'plan.txt');
    fs.rmSync(reviewPath, { force: true });
    writePrivate(varsPath, vars);
    prepared.exec(['plan', '-input=false', '-lock-timeout=5m', ...(command === 'destroy' ? ['-destroy'] : []), `-var-file=${varsPath}`, `-out=${planPath}`], true);
    fs.chmodSync(planPath, 0o600);
    const review = prepared.exec(['show', '-no-color', planPath]);
    if (!review.trim()) throw new Error('Terraform returned an empty readable plan; do not approve or apply');
    fs.writeFileSync(reviewPath, review, { mode: 0o600 });
    fs.chmodSync(reviewPath, 0o600);
    const metadata = { ...expected, operation: command, planHash: hash(fs.readFileSync(planPath)) };
    writePrivate(metadataPath, metadata);
    return { planned: true, operation: command, planPath, reviewPath, metadataPath, applied: false };
  }

  return { execute };
}

module.exports = { createPlatform, hash };
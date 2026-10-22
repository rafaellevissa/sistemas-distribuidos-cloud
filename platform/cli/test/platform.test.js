'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPlatform } = require('../src/platform');
const { parse } = require('../src/index');
const { objectOutput } = require('../src/runner');
const { validateConfig } = require('../src/config');

const config = {
  schemaVersion: 1, target: 'gcp', environment: 'dev', profile: 'economy',
  projectId: 'demo-project', region: 'us-central1', hostname: 'demo.acme.test',
  storageBucket: 'demo-project-uploads', buildServiceAccount: 'build@demo-project.iam.gserviceaccount.com',
  stateBucket: 'demo-state-bucket', sizing: { minReplicas: 1, maxReplicas: 2, dbTier: 'db-f1-micro' },
};
const options = { target: 'gcp', environment: 'dev', stack: 'foundation' };
const runtime = { ...options, stack: 'runtime', image: `us-central1-docker.pkg.dev/demo-project/api/service@sha256:${'a'.repeat(64)}`, 'secret-version': '3' };

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const stack of ['foundation', 'runtime']) fs.mkdirSync(path.join(root, 'infra/stacks/gcp', stack), { recursive: true });
  const calls = [];
  let head = 'b'.repeat(40);
  let dirty = '';
  let review = 'Plan: 1 to add, 0 to change, 0 to destroy.\n';
  const run = (binary, args, execution) => {
    calls.push({ binary, args, ...execution });
    if (binary === 'git') return args[0] === 'status' ? dirty : head;
    if (args[0] === 'plan') fs.writeFileSync(args.find(argument => argument.startsWith('-out=')).slice(5), 'saved-plan');
    if (args[0] === 'show') return review;
    if (args[0] === 'output') return JSON.stringify({ project_id: 'demo-project', network: 'private-network' });
    return '';
  };
  let currentConfig = structuredClone(config);
  const platform = createPlatform({ root, run, loadConfig: () => currentConfig });
  return { root, calls, platform, setHead: value => { head = value; }, setDirty: value => { dirty = value; }, setConfig: value => { currentConfig = value; }, setReview: value => { review = value; } };
}

test('foundation plan uses exact backend, root, private JSON var-file and saved-plan arguments', t => {
  const { root, platform, calls } = fixture(t);
  const result = platform.execute('plan', options);
  const directory = path.join(root, '.platform/gcp/dev/foundation');
  const init = calls.find(call => call.args[0] === 'init');
  assert.deepEqual(init.args, ['init', '-input=false', '-reconfigure', '-backend-config=bucket=demo-state-bucket', '-backend-config=prefix=gcp/demo-project/dev/foundation']);
  assert.equal(init.cwd, path.join(root, 'infra/stacks/gcp/foundation'));
  assert.equal(init.env.TF_DATA_DIR, path.join(directory, 'terraform'));
  assert.deepEqual(calls.find(call => call.args[0] === 'plan').args, ['plan', '-input=false', '-lock-timeout=5m', `-var-file=${directory}/inputs.auto.tfvars.json`, `-out=${directory}/reviewed.tfplan`]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'inputs.auto.tfvars.json'))), {
    project_id: 'demo-project', region: 'us-central1', environment: 'dev', name: 'distributed-cloud', profile: 'economy', db_tier: 'db-f1-micro',
    bucket_name: 'demo-project-uploads', build_service_account: 'build@demo-project.iam.gserviceaccount.com',
  });
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  for (const filename of ['inputs.auto.tfvars.json', 'plan.json', 'reviewed.tfplan', 'plan.txt']) assert.equal(fs.statSync(path.join(directory, filename)).mode & 0o777, 0o600);
  assert.deepEqual(calls.find(call => call.args[0] === 'show').args, ['show', '-no-color', result.planPath]);
  assert.match(fs.readFileSync(result.reviewPath, 'utf8'), /Plan: 1 to add/);
  assert.equal(result.applied, false);
});

test('runtime plan reads foundation platform output after init and passes digest/secret sizing', t => {
  const { platform, calls } = fixture(t);
  const result = platform.execute('deploy', { ...runtime, stack: undefined });
  const outputIndex = calls.findIndex(call => call.args[0] === 'output');
  assert.deepEqual(calls[outputIndex].args, ['output', '-json', 'platform']);
  assert.ok(calls[outputIndex].cwd.endsWith('/foundation'));
  assert.equal(calls[outputIndex - 1].args[0], 'init');
  const vars = JSON.parse(fs.readFileSync(path.join(path.dirname(result.planPath), 'inputs.auto.tfvars.json')));
  assert.equal(vars.runtime_secret_version, 3);
  assert.equal(vars.image, runtime.image);
  assert.equal(vars.platform.network, 'private-network');
  assert.equal(vars.min_replicas, 1);
  assert.ok(!calls.some(call => call.args[0] === 'apply'));
});

test('apply uses only the saved reviewed plan, consumes metadata and refuses repeat', t => {
  const { platform, calls } = fixture(t);
  const planned = platform.execute('plan', options);
  assert.throws(() => platform.execute('apply', options), /confirm/);
  platform.execute('apply', { ...options, confirm: 'gcp/dev/foundation' });
  assert.deepEqual(calls.find(call => call.args[0] === 'apply').args, ['apply', '-input=false', '-lock-timeout=5m', planned.planPath]);
  assert.throws(() => platform.execute('apply', { ...options, confirm: 'gcp/dev/foundation' }), /No saved/);
});

test('changed config, commit, plan bytes and dirty source are refused', t => {
  for (const change of ['config', 'storageBucket', 'buildServiceAccount', 'head', 'bytes', 'dirty']) {
    const setup = fixture(t);
    const planned = setup.platform.execute('plan', options);
    if (change === 'config') setup.setConfig({ ...config, hostname: 'changed.acme.test' });
    if (change === 'storageBucket') setup.setConfig({ ...config, storageBucket: 'other-project-uploads' });
    if (change === 'buildServiceAccount') setup.setConfig({ ...config, buildServiceAccount: 'other@demo-project.iam.gserviceaccount.com' });
    if (change === 'head') setup.setHead('c'.repeat(40));
    if (change === 'bytes') fs.appendFileSync(planned.planPath, 'tamper');
    if (change === 'dirty') setup.setDirty(' M infra/main.tf');
    assert.throws(() => setup.platform.execute('apply', { ...options, confirm: 'gcp/dev/foundation' }), /mismatch|working-tree/);
    assert.ok(!setup.calls.some(call => call.args[0] === 'apply'));
  }
});

test('new foundation placeholders fail before any subprocess for mutation commands', () => {
  for (const field of ['storageBucket', 'buildServiceAccount']) {
    for (const command of ['plan', 'apply', 'destroy', 'deploy']) {
      const calls = [];
      const platform = createPlatform({
        run: (...args) => { calls.push(args); },
        loadConfig: selected => validateConfig({ ...config, [field]: 'REPLACE_PROJECT_VALUE' }, selected),
      });
      assert.throws(() => platform.execute(command, options), /placeholder/);
      assert.equal(calls.length, 0);
    }
  }
});

test('empty readable plan fails closed without approval metadata', t => {
  const setup = fixture(t);
  setup.setReview('');
  assert.throws(() => setup.platform.execute('plan', options), /empty readable plan/);
  assert.equal(fs.existsSync(path.join(setup.root, '.platform/gcp/dev/foundation/plan.json')), false);
  assert.ok(!setup.calls.some(call => call.args[0] === 'apply'));
});

test('missing plan and unsafe destroy are refused without Terraform execution', t => {
  const { platform, calls } = fixture(t);
  assert.throws(() => platform.execute('apply', { ...options, confirm: 'gcp/dev/foundation' }), /No saved/);
  for (const input of [options, { ...runtime, environment: 'prod', confirm: 'gcp/prod/runtime', 'allow-data-loss': true }, { ...runtime, confirm: 'gcp/dev/runtime' }]) {
    assert.throws(() => platform.execute('destroy', input), /confirm|restricted/);
  }
  assert.equal(calls.length, 0);
});

test('destroy creates a plan only and requires data-loss consent again on apply', t => {
  const { platform, calls } = fixture(t);
  const consent = { ...runtime, confirm: 'gcp/dev/runtime', 'allow-data-loss': true };
  platform.execute('destroy', consent);
  assert.ok(calls.find(call => call.args[0] === 'plan').args.includes('-destroy'));
  assert.ok(!calls.some(call => call.args[0] === 'apply'));
  assert.throws(() => platform.execute('apply', { ...consent, 'allow-data-loss': false }), /allow-data-loss/);
  platform.execute('apply', consent);
  assert.equal(calls.filter(call => call.args[0] === 'apply').length, 1);
});

test('runtime rejects mutable tags, wrong registry context, injected input and invalid secret version', t => {
  for (const image of ['api:latest', `${runtime.image};id`, runtime.image.replace('demo-project', 'other-project'), runtime.image.replace('us-central1', 'europe-west1')]) {
    const { platform, calls } = fixture(t);
    assert.throws(() => platform.execute('plan', { ...runtime, image }), /Artifact Registry/);
    assert.equal(calls.length, 0);
  }
  for (const version of ['0', '-1', '1;id', '1.5', '9007199254740992']) {
    const { platform, calls } = fixture(t);
    assert.throws(() => platform.execute('plan', { ...runtime, 'secret-version': version }), /positive/);
    assert.equal(calls.length, 0);
  }
});

test('flags and output JSON parsing are strict', () => {
  for (const args of [['plan', '--shell', 'id'], ['validate', '--stack', 'runtime'], ['deploy', '--confirm', 'yes'], ['plan', '--target', 'gcp', '--target', 'aws'], ['plan', 'runtime']]) assert.throws(() => parse(args));
  for (const output of ['null', '[]', 'true', '{}', 'not-json']) assert.throws(() => objectOutput(output, 'platform'));
  assert.equal(parse(['validate', '--example']).options.example, true);
});
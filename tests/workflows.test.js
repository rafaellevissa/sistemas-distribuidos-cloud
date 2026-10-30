const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const YAML = require('yaml');

const root = path.resolve(__dirname, '..');
function workflow(name) {
  return YAML.parse(fs.readFileSync(path.join(root, '.github/workflows', `${name}.yml`), 'utf8'));
}

test('release supports the first image from provisioned base infrastructure', () => {
  const release = workflow('release');
  assert.ok(Object.hasOwn(release.on, 'workflow_dispatch'));
  const steps = release.jobs.release.steps;
  const deployment = steps.find((step) => step.id === 'deployment');
  assert.doesNotMatch(deployment.run, /\.enable_runtime == true/);
  const guard = deployment.run.split('\n').find((line) => line.trim().startsWith('jq -e '));
  const result = spawnSync('bash', ['-eu', '-o', 'pipefail', '-c', guard], {
    env: { ...process.env, deployment: JSON.stringify({
      enable_runtime: false,
      image_repository: 'us-central1-docker.pkg.dev/demo-project/demo/api',
      registry_host: 'us-central1-docker.pkg.dev',
      schema_service_account: 'schema@demo-project.iam.gserviceaccount.com',
    }) },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const invalid = spawnSync('bash', ['-eu', '-o', 'pipefail', '-c', guard], {
    env: { ...process.env, deployment: '{}' }, encoding: 'utf8',
  });
  assert.notEqual(invalid.status, 0);
  const schemaIndex = steps.findIndex((step) => step.run?.includes('bash scripts/apply-schema-gcp.sh'));
  const planIndex = steps.findIndex((step) => step.run?.includes('terraform -chdir=infra plan'));
  assert.ok(schemaIndex >= 0 && planIndex > schemaIndex);
  assert.match(steps[planIndex].run, /enable_runtime = true/);
  assert.match(steps[planIndex].run, /image =/);
});

test('cloud workflows preserve OIDC, serialized state and manual saved-plan apply', () => {
  const release = workflow('release');
  const infrastructure = workflow('infrastructure');
  for (const config of [release, infrastructure]) {
    assert.equal(config.concurrency.group, 'application-gcp-state');
    assert.equal(config.concurrency['cancel-in-progress'], false);
    const job = Object.values(config.jobs)[0];
    assert.equal(job.permissions['id-token'], 'write');
    assert.ok(job.steps.some((step) => step.name === 'Require restricted plan storage'));
    const artifact = job.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
    assert.equal(artifact.with['retention-days'], 1);
    for (const step of job.steps.filter((step) => step.uses?.startsWith('google-github-actions/auth@'))) {
      assert.ok(step.with.workload_identity_provider);
      assert.equal(step.with.credentials_json, undefined);
    }
  }
  const apply = infrastructure.jobs.deployment.steps.find((step) => step.name === 'Apply the exact saved plan, never replan');
  assert.equal(apply.if, "inputs.operation == 'apply'");
  assert.match(apply.run, /sha256sum -c checksums.txt/);
  assert.match(apply.run, /terraform apply .*reviewed.tfplan/);
  assert.doesNotMatch(apply.run, /terraform plan/);
});
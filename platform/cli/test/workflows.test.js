'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { ROOT } = require('../src/paths');

function workflow(name) {
  return YAML.parse(fs.readFileSync(path.join(ROOT, '.github/workflows', `${name}.yml`), 'utf8'));
}

test('cloud workflows use bootstrap-compatible environment subjects and main-only OIDC', () => {
  for (const name of ['infrastructure', 'release', 'destroy']) {
    const document = workflow(name);
    assert.equal(document.concurrency.group, 'platform-gcp-${{ inputs.environment }}');
    assert.equal(document.concurrency['cancel-in-progress'], false);
    for (const job of Object.values(document.jobs)) {
      assert.match(job.if, /github\.ref == 'refs\/heads\/main'/);
      const environment = typeof job.environment === 'string' ? job.environment : job.environment.name;
      assert.ok(['dev', '${{ inputs.environment }}'].includes(environment));
      assert.equal(job.permissions['id-token'], 'write');
      for (const step of job.steps.filter(step => step.uses)) assert.match(step.uses, /@[a-f0-9]{40}$/);
    }
  }
  assert.equal(workflow('ci').permissions['id-token'], undefined);
  assert.ok(!JSON.stringify(workflow('ci')).includes('google-github-actions/auth'));
});

test('foundation approval links an immutable same-run artifact with a readable plan', () => {
  const { plan, apply } = workflow('infrastructure').jobs;
  const upload = plan.steps.find(step => step.id === 'plan-artifact');
  assert.match(upload.with.path, /foundation\/plan\.txt/);
  assert.equal(upload.with['retention-days'], 1);
  assert.doesNotMatch(upload.with.path, /credentials|tfvars|terraform\//);
  assert.equal(plan.outputs['artifact-id'], '${{ steps.plan-artifact.outputs.artifact-id }}');
  assert.equal(apply.needs, 'plan');
  assert.equal(apply.environment.url, '${{ needs.plan.outputs.artifact-url }}');
  const download = apply.steps.find(step => step.uses?.startsWith('actions/download-artifact@'));
  assert.equal(download.with['artifact-ids'], '${{ needs.plan.outputs.artifact-id }}');
  assert.equal(download.with.name, undefined);
  assert.equal(download.with['run-id'], undefined);
  assert.equal(download.with['github-token'], undefined);
  assert.equal(download.with['merge-multiple'], true);
});

test('release and destroy publish readable plans without runtime apply or a fictitious schema gate', () => {
  for (const name of ['release', 'destroy']) {
    const document = workflow(name);
    assert.match(document.name, /Plan Only/);
    for (const job of Object.values(document.jobs)) {
      const commands = job.steps.map(step => step.run || '').join('\n');
      assert.doesNotMatch(commands, /(?:terraform|index\.js|platform --) apply\b/);
      const upload = job.steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
      assert.match(upload.with.path, /runtime\/plan\.txt/);
    }
  }
});

test('release validates the publisher and foundation registry before requesting credentials', () => {
  const { steps } = workflow('release').jobs['build-plan'];
  const checkIndex = steps.findIndex(step => step.name === 'Check foundation publisher and registry contract before authentication');
  const authIndex = steps.findIndex(step => step.uses?.startsWith('google-github-actions/auth@'));
  assert.ok(checkIndex >= 0 && checkIndex < authIndex);
  assert.match(steps[checkIndex].run, /config\.buildServiceAccount !== process\.env\.BUILD_SERVICE_ACCOUNT/);
  assert.match(steps[checkIndex].run, /distributed-cloud-\$\{config.environment\}/);
});

test('release Docker context includes the workspace lockfile and both package manifests', () => {
  const { steps } = workflow('release').jobs['build-plan'];
  const build = steps.find(step => step.name === 'Push commit-tagged image with SBOM and provenance');
  assert.match(build.run, /--file apps\/api\/Dockerfile \.\s*$/);
  const dockerfile = fs.readFileSync(path.join(ROOT, 'apps/api/Dockerfile'), 'utf8');
  assert.match(dockerfile, /COPY package.json package-lock.json/);
  assert.match(dockerfile, /COPY platform\/cli\/package.json/);
  const ignored = fs.readFileSync(path.join(ROOT, '.dockerignore'), 'utf8').split(/\r?\n/);
  assert.ok(ignored.includes('.platform'), 'private plans and OIDC artifacts must not enter the Docker context');
});
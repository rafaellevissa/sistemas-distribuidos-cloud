'use strict';

const fs = require('node:fs');

function diagnose(log) {
  const categories = [
    ['permission-denied', /permission.?denied|forbidden|not authorized|does not have.*permission|Error 403/i],
    ['authentication', /invalid_grant|invalid credentials|unauthenticated|Error 401/i],
    ['deletion-protection', /deletion.protection|deletion_protection/i],
    ['bucket-not-empty', /bucket.*not empty|force_destroy/i],
    ['resource-in-use', /resourceInUse|resource.*(?:being used|in use)|dependent resources/i],
    ['retention-policy', /retention policy|retentionPolicyNotMet|object hold/i],
    ['timeout', /timeout|timed out|deadline exceeded/i],
    ['state-persistence', /Failed to save state|Failed to persist state|Error saving state/i],
    ['state-lock', /Error acquiring the state lock|Error releasing the state lock/i],
    ['quota-or-rate-limit', /quota exceeded|rate limit|Error 429/i],
    ['conflict', /Error 409/i],
  ].filter(([, pattern]) => pattern.test(log)).map(([category]) => category);
  const families = [
    ['cloud-sql', /\bgoogle_sql_database(?:_instance|_user)?\b|\bgoogle_sql_user\b/],
    ['storage', /\bgoogle_storage_bucket(?:_iam_member)?\b/],
    ['compute', /\bgoogle_compute_[a-z_]+\b/],
    ['iam', /\bgoogle_(?:service_account|project_iam)[a-z_]*\b/],
    ['artifact-registry', /\bgoogle_artifact_registry_[a-z_]+\b/],
    ['dns', /\bgoogle_dns_[a-z_]+\b/],
    ['secret-manager', /\bgoogle_secret_manager_[a-z_]+\b/],
  ].filter(([, pattern]) => pattern.test(log)).map(([family]) => family);
  return `Terraform destroy failure categories: ${categories.join(', ') || 'unclassified'}.\n` +
    `Resource families mentioned in failure diagnostics: ${families.join(', ') || 'unclassified'}.\n` +
    'Raw Terraform logs remain private. Inspect surviving resources and application state before retrying; do not remove resources from state to bypass this failure.\n';
}

if (require.main === module) {
  try {
    process.stderr.write(diagnose(fs.readFileSync(process.argv[2], 'utf8')));
  } catch {
    process.stderr.write('Terraform destroy diagnostics unavailable. Inspect resource state before retrying.\n');
    process.exitCode = 1;
  }
}

module.exports = { diagnose };
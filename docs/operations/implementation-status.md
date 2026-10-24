# Implementation status

Last verified: 2026-10-20. This file records the first implementation milestone, not a claim of successful cloud deployment.

## Completed locally

- JavaScript API copied from the AWS reference without changing that repository. CRUD contracts and SQL are preserved.
- Native S3 and Cloud Storage adapters selected through environment configuration. HTTP and SDK contract tests cover uploads, errors and signed URL TTL.
- npm workspaces and lockfile, nonroot Node 24 image definition, local MySQL/MinIO Compose, integration and HTTPS smoke checks.
- JSON Schema validated nonsecret manifests; strict CLI input handling, saved Terraform plans tied to commit/config/backend/content, explicit confirmations and constrained destruction.
- GCP Terraform roots for owner bootstrap/WIF/state, private foundation and digest-pinned COS MIG/HTTPS runtime. Provider lockfiles are included.
- Credential-free PR CI and manually triggered, protected OIDC workflow definitions. Foundation apply consumes the saved same-run plan. Runtime release and destruction workflows publish plans only.
- English onboarding and operations documentation; the original educational brief remains in the README as historical context.

## Executed checks

- `npm test`: 41 passing tests, including API, storage, CLI, workflows, COS credential bootstrap and smoke-test logic.
- `npm run lint`: JavaScript syntax validation passed; this is not semantic linting.
- `npm audit`: zero reported vulnerabilities after dependency updates.
- Dev and prod example manifests: structural validation passed. Placeholders are intentionally rejected for cloud operations.
- `docker compose config --quiet`: passed.
- `terraform fmt -check -recursive infra`: passed.
- `terraform init -backend=false -input=false -lockfile=readonly` and `terraform validate`: passed in all three roots against Google provider 7.46.1.
- `terraform test`: 12 mocked plan tests passed across the three roots. No real resources were created.
- Editor diagnostics: no errors at verification time.

Local Node was 22.23.0; CI and Docker select Node 24. Container build and runtime checks remain outstanding because the local Docker daemon was unavailable. The real MySQL integration test was explicitly skipped without `INTEGRATION_DB_HOST`. CI is configured to run it using a disposable MySQL service, but the workflow has not been executed in GitHub.

## Next implementation gates

1. Start Docker and verify the workspace image, local CRUD and upload/download against MinIO, then execute the real MySQL integration suite.
2. Supply reviewed project/billing/region/domain/repository identifiers, bootstrap with an authorized owner and migrate state. Complete plan/build identity permissions and GitHub environment protections before enabling cloud workflows.
3. Add a reproducible private SQL-user/secret provisioning flow and one-off schema job. Integrate schema success as a mandatory runtime release gate; do not bypass this prerequisite through manual apply.
4. Add image vulnerability/attestation verification, bounded rollout and HTTPS smoke gates, and tested rollback automation. Runtime release must remain plan-only until those controls exist.
5. Prove native GCP credentials and signed URL downloads, private networking, TLS/certificate readiness, denied unauthorized access, rollout convergence and a no-change follow-up plan in a real disposable project.
6. Add SQL transport encryption, monitoring/budget alerts, connection-capacity limits, backup restoration and controlled HA/chaos exercises. Review the broad trusted infrastructure IAM boundary before production activation.

The first milestone does not implement full AWS Terraform, cross-cloud data replication/failover, real-user authorization or production certification. Public deployments must use disposable demo data only. Cost alerts and a spending cap are not implemented.
# Verification Status

The repository defines a single-root GCP demonstration, not a certified or already accepted live deployment. This document distinguishes available code from evidence still needed; historical CLI test counts and multi-stack milestones no longer describe the current design.

## Available Interfaces

- Direct Terraform application root with five modules, two explicit API zones, minimum two replicas, public HTTP IP, private zonal SQL and private GCS.
- Terraform-generated SQL password/user and Secret Manager version, with the accepted password-in-state/plan trade-off.
- One-off private schema VM script and thin Make targets for Terraform, build/push, schema and smoke.
- Manual existing-WIF workflows: build/schema/saved plan, then separately dispatched reviewed artifact apply and health/smoke. First deployment remains local; cloud plan artifacts require a private repository.
- Local Compose API/MySQL/MinIO development and credential-free CI including integration tests and Docker build.

## Verification Boundaries

Make dry runs, YAML parsing, embedded Bash syntax and reference/contract checks validate automation structure without creating cloud resources. Terraform validation/mock tests and script unit tests can establish local invariants, not actual IAM, quota, network reachability, SQL connectivity, image pulls, rollout availability or signing behavior. Consult actual test output for the current counts; do not infer a live deployment from a green unit test.

Local verification passed: 39 JavaScript tests cover the API, startup credentials, temporary schema task lifecycle and smoke contracts; 16 Terraform mock tests cover the root and modules. JavaScript syntax lint, Terraform validation/formatting and whitespace checks passed. The bootstrap has no changes. The MySQL integration test was skipped because no disposable database was configured; the Docker executable points to an unavailable installation, so the image build was not run.

The smoke runner verifies both default HTTPS and explicitly opted-in HTTP CRUD/upload flows using simulated requests. Make and workflows pass `SMOKE_ALLOW_HTTP=true` for the HTTP demo; signed GCS reads still require HTTPS. These local contracts do not establish live GCP acceptance.

Cloud apply, image build/publish and GitHub workflow execution are not performed as part of documentation/automation editing. Container/integration checks require a running Docker/MySQL environment. Do not report them as passed when only syntax or mocked checks ran.

## Live Acceptance Still Required

1. Owner confirms existing bootstrap state location, exact WIF environment subject and unchanged identities; configures protected GitHub access and approves costs/quotas.
2. Run the [local first-deployment sequence](../onboarding/gcp.md): base plan/apply, image push/digest, successful private schema/cleanup, runtime-enabled reviewed plan/apply.
3. Prove healthy API instances in both zones, LB health, CRUD, upload and HTTPS signed-object read, denied anonymous bucket access and no public SQL/VM addresses. Check a no-change follow-up plan with persisted inputs.
4. Exercise a compatible rolling release and deliberate rollback, schema failure blocking a plan, orphan cleanup and backup restore under explicit owner authorization.
5. Before any sensitive use, separately design authentication/authorization, frontend and SQL TLS, database HA, narrow IAM/SQL grants, monitoring, budget alerts, image verification and tested recovery. None is implied by two API zones.

This setup has no domain/HTTPS frontend, database HA, multi-region disaster recovery, automatic rollback or spending cap. Use disposable nonsensitive data only; ongoing infrastructure charges are expected.
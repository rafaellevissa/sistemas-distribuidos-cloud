# GCP Operator Onboarding

This is a public, unauthenticated teaching demo, not a production product. Anyone who reaches the API can change or delete demo records and upload files. Use synthetic data only. WAF is not authorization. Do not deploy until the project, billing, configuration, identities and domain are real and reviewed.

## Prerequisites

The root workspace lockfile includes `@distributed-cloud/platform`, `yaml` and `ajv`. Use the installed root dependencies for local checks; a fresh checkout uses `npm ci`. Run `npm run lint` and `npm test`. Syntax lint only checks JavaScript parsing; it is not semantic analysis. Do not regenerate the lockfile as part of environment configuration. The owner-only cloud commands below are instructions, not actions performed automatically.

Use Node meeting the root engine requirement and Terraform 1.11.4 to match CI. Install the Google Cloud CLI separately for owner authentication. Create a dedicated GCP project, attach billing, select a region after residency/cost/quota review, and control a DNS hostname. The example `us-central1` is not a cost or residency recommendation. Production needs a separate project and explicit opt-in.

## Nonsecret Manifest

Edit the tracked dev manifest locally and commit reviewed configuration. For production, create `platform/environments/gcp/prod.yaml` from `prod.example.yaml`; keep `productionEnabled: false` until the production protection checklist is met, then explicitly set it true. Every `REPLACE_...` value must be supplied by the owner. Never ask an assistant for credentials or paste credentials into chat, manifests, issue comments or logs.

| Key | Meaning |
| --- | --- |
| `schemaVersion` | Exactly `1` |
| `target` | Exactly `gcp` |
| `environment` | `dev` or `prod`, matching the CLI flag |
| `profile` | `economy` or `ha`; prod requires `ha` |
| `projectId` | Existing billed project ID |
| `region` | Existing supported GCP region |
| `hostname` | Controlled public DNS hostname, without scheme or path |
| `stateBucket` | Existing protected Terraform backend bucket |
| `storageBucket` | Globally unique uploads bucket name, 3-63 lowercase letters/digits/hyphens; mapped to foundation `bucket_name`, not the state bucket |
| `buildServiceAccount` | String service-account email from bootstrap `build_service_account`; mapped to foundation `build_service_account`, never an object or JSON key |
| `githubRepository` | Optional exact `owner/repository`; bootstrap must bind this identity independently |
| `productionEnabled` | Must explicitly be `true` for any non-example prod operation |
| `sizing.minReplicas` | Integer 1-10; HA requires at least 2 |
| `sizing.maxReplicas` | Integer 1-10, at least minReplicas |
| `sizing.dbTier` | GCP Cloud SQL tier ID; validate regional availability and profile compatibility |

Unknown properties, including secret fields, are rejected. These limits do not establish a safe database connection budget: check pool connections times max replicas plus schema/operations reserve against the chosen SQL tier.

```sh
npm run platform -- validate --target gcp --environment dev --example
npm run platform -- validate --target gcp --environment prod --example
npm run platform -- validate --target gcp --environment dev
npm run platform -- doctor --target gcp --environment dev
```

`--example` only structurally validates templates. It never enables planning/applying placeholders and is rejected by other commands. Normal validation rejects placeholder values and disabled production. `doctor` is not a credential or quota probe.

## Owner Bootstrap

`npm run platform -- bootstrap` deliberately prints help; it is **not** an automated bootstrap. The owner must review `infra/bootstrap/gcp` inputs and current outputs with the infrastructure owner. Authenticate interactively in your own terminal using an approved ADC/impersonation flow, never service-account JSON keys or credentials transmitted through the assistant. Do not use broad GitHub owner tokens.

Bootstrap accepts exactly these owner inputs; the ordinary environment CLI does not supply them:

| Terraform input | Required owner value |
| --- | --- |
| `project_id` | Existing billed project ID, not its numeric project number |
| `region` | Reviewed region, also used for the state bucket |
| `environment` | `dev` or `prod` |
| `name` | Keep the default `distributed-cloud` to match the CLI resource prefix |
| `github_repository` | Exact `OWNER/REPOSITORY` |
| `github_repository_id` | Immutable numeric repository ID as a string, not owner ID or repository name |
| `state_bucket_name` | Globally unique dedicated state bucket name; not the uploads bucket |

From the repository root, obtain the numeric ID with an already authenticated GitHub CLI. Replace identifiers below before running any Terraform command; no secret belongs in these inputs:

```sh
export TF_VAR_project_id='REPLACE_PROJECT_ID'
export TF_VAR_region='us-central1'
export TF_VAR_environment='dev'
export TF_VAR_name='distributed-cloud'
export TF_VAR_github_repository='REPLACE_OWNER/REPLACE_REPOSITORY'
export TF_VAR_github_repository_id="$(gh api "repos/$TF_VAR_github_repository" --jq '.id | tostring')"
export TF_VAR_state_bucket_name='REPLACE_GLOBALLY_UNIQUE_STATE_BUCKET'
umask 077
mkdir -p .platform/bootstrap/gcp
export TF_DATA_DIR="$PWD/.platform/bootstrap/gcp/terraform"
terraform -chdir=infra/bootstrap/gcp init -input=false
terraform -chdir=infra/bootstrap/gcp plan -input=false -out="$PWD/.platform/bootstrap/gcp/reviewed.tfplan"
terraform -chdir=infra/bootstrap/gcp show -no-color "$PWD/.platform/bootstrap/gcp/reviewed.tfplan"
```

Only after private review and explicit owner authorization:

```sh
terraform -chdir=infra/bootstrap/gcp apply -input=false "$PWD/.platform/bootstrap/gcp/reviewed.tfplan"
cp infra/bootstrap/gcp/backend.gcs.tf.example infra/bootstrap/gcp/backend.tf
terraform -chdir=infra/bootstrap/gcp init -migrate-state \
	-backend-config="bucket=$TF_VAR_state_bucket_name" \
	-backend-config="prefix=gcp/$TF_VAR_project_id/$TF_VAR_environment/bootstrap"
terraform -chdir=infra/bootstrap/gcp plan -input=false
terraform -chdir=infra/bootstrap/gcp output -raw state_bucket
terraform -chdir=infra/bootstrap/gcp output -raw build_service_account
terraform -chdir=infra/bootstrap/gcp output -raw deployer_service_account
terraform -chdir=infra/bootstrap/gcp output -raw workload_identity_provider
unset TF_DATA_DIR
```

The backend example contains only `backend "gcs" {}`; bucket/prefix come from `init`. The migration command is interactive: verify the destination before accepting state copy. This assumes the initial bootstrap has not already been migrated. On later checkouts, initialize the existing backend with the same bucket/prefix instead of repeating bootstrap creation or migration. Review and commit the nonsecret backend declaration and provider lockfile through the infrastructure owner. Verify state in GCS and a clean follow-up plan before securely removing local state backups. Never commit state. Ordinary CLI `init -reconfigure` is not migration.

Update the tracked environment YAML with actual `projectId`, `hostname`, `stateBucket` from `state_bucket`, a distinct globally unique `storageBucket`, and `buildServiceAccount` from `build_service_account`. Update `githubRepository`, region and sizing too. These are Git-tracked deployment inputs, not GitHub secrets or workflow overrides. Validate without `--example`, review and commit all configuration changes through your normal process before plan/apply; the CLI rejects dirty or untracked changes. No commit is performed automatically.

The current bootstrap creates a broad infrastructure deployer and an Artifact Registry build identity, not a complete least-privilege plan/apply system. The build identity has no Terraform planning/backend access by default. Before enabling workflows, the infrastructure owner must provision a separate read/plan identity with state locking access and exact-subject WIF impersonation, and explicitly grant the build identity the read/plan/backend permissions needed for the combined build-plan job. Do not silently substitute the broad deployer for plan/build. Backend state access is highly privileged. Foundation later grants the configured build email repository-scoped writer access; runtime/schema accounts are created by foundation, not bootstrap.

Provision foundation before building the application. Establish SQL users/permissions and numeric Secret Manager versions through an auditable owner flow; Terraform secret containers alone do not provision safe passwords or DML users. Never put secret payloads in tfvars, VM metadata or outputs. Inspect provider behavior for password-in-state risks.

## GitHub Environments

Configure exactly `dev` and, when authorized, `prod`, both restricted to branch `main`, with required reviewers and prevention of self-review where available. Planning/building and apply use the same protected environment name but separate service accounts. Both foundation jobs may require approval; approve the apply job only after reviewing its linked artifact. Workflow YAML cannot create environment protections. Do not enable cloud workflows before configuring them and identity permissions.

Bootstrap requires the conjunction of exact `assertion.repository`, immutable `assertion.repository_id`, `assertion.ref == 'refs/heads/main'`, and `assertion.sub == 'repo:OWNER/REPOSITORY:environment:dev'` (or `prod`). Its service-account binding uses that exact subject, not a repository-wide principal set. Names such as `dev-plan` or `dev-release-plan` are deliberately not trusted. Test rejection of forks, PR subjects, non-main refs, renamed/transferred repositories with the wrong ID, and other environments before enabling mutation. GitHub environment protection is an additional boundary, not a replacement for these GCP conditions.

Environment variables (nonsecret identifiers):

- `GCP_WORKLOAD_IDENTITY_PROVIDER`: full reviewed WIF provider resource name.
- `GCP_PLAN_SERVICE_ACCOUNT`: owner-provisioned narrow foundation/runtime plan identity; bootstrap does not create it.
- `GCP_APPLY_SERVICE_ACCOUNT`: foundation mutation identity; bootstrap output `deployer_service_account` is broad and requires explicit IAM review, not runtime apply authorization.
- `GCP_RELEASE_PLAN_SERVICE_ACCOUNT`: must equal manifest `buildServiceAccount` / bootstrap `build_service_account`, with owner-reviewed additional foundation/runtime planning and backend access; not runtime apply.
- `GCP_ARTIFACT_REPOSITORY`: foundation repository ID `distributed-cloud-dev` or `distributed-cloud-prod`. It must already exist; enable immutable tags through the infrastructure owner (the current foundation does not enforce that setting).

OIDC credentials are generated per job, moved into private ignored `.platform/`, and never uploaded. Ephemeral GitHub-hosted runners are required by these workflows. If porting to persistent self-hosted runners, add secure credential cleanup and isolation first. PR CI has no `id-token: write`, no cloud authentication step and no cloud secrets.

Protect private plan artifacts and successful Terraform logs as sensitive. Artifacts expire after one day and include `reviewed.tfplan`, `plan.json` and readable `plan.txt`, not credentials, tfvars or the Terraform data directory. Foundation apply downloads the immutable artifact ID emitted by its own prerequisite plan job in the same run, never a user-supplied run, external repository or mutable artifact name. The approval environment links that artifact; inspect `plan.txt`, operation and commit/context in `plan.json` before approving. Apply checks the same commit/config/backend/vars/plan hash. Cloud workflow actions are commit-pinned; review pin updates rather than replacing them with floating tags.

## First Runtime Boundary

Review the foundation `platform` object contract with the infrastructure owner, verify private SQL and runtime secret setup, build the image, and obtain an immutable digest. The release workflow creates a plan and descriptor only. SBOM/provenance are generated, but scan and attestation verification gates are still integration work.

Before any manual runtime apply, an independently reviewed private schema runner must execute the existing `apps/api/src/db/apply-schema.js` once and report success. The schema currently expects `aula_pratica_db`. Runtime replicas must start the server directly, not run DDL at every startup. This CLI does not implement or enforce that schema gate. Until the schema workflow exists, keep runtime apply identities disabled in CI and follow an explicitly authorized owner process.

Prove HTTPS/DNS/certificate readiness, CRUD, upload, anonymous signed-URL download, denied anonymous bucket access, no public VM/DB access, and health convergence before calling the demo ready. None of these properties is implied by a successful Terraform plan.
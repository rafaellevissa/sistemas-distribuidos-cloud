# Platform Operations

All commands below use the tracked, nonsecret environment manifest and repository-root resolution, regardless of the caller's current directory. Commit reviewed code/config changes before creating plans. Examples containing `REPLACE` are deliberately not executable cloud input. Keep cloud credentials outside source control and chat.

## Foundation Plan And Apply

```sh
npm run platform -- plan --target gcp --environment dev --stack foundation
terraform -chdir=infra/stacks/gcp/foundation show "$PWD/.platform/gcp/dev/foundation/reviewed.tfplan"
npm run platform -- apply --target gcp --environment dev --stack foundation --confirm gcp/dev/foundation
npm run platform -- outputs --target gcp --environment dev --stack foundation
```

The CLI also writes private `.platform/gcp/dev/foundation/plan.txt` from `terraform show -no-color` against the exact saved binary plan. Inspect it before apply. For a separate `terraform show`, use the same stack `TF_DATA_DIR` as the CLI if provider schemas are required: set it to the absolute repository path plus `.platform/gcp/dev/foundation/terraform`. Prefer an absolute saved-plan path to avoid confusion with `-chdir`. Do not post plan text, JSON or logs to public reviews.

The infrastructure workflow uploads the saved binary, metadata and readable text, then optionally waits at protected `dev`/`prod` for apply. Open the artifact link on that apply approval and the plan job summary; inspect `plan.txt` and verify the intended operation, commit, target/environment/stack and backend in `plan.json`. Apply retrieves only the immutable artifact ID emitted by the plan job in that same run. It never accepts an arbitrary run ID or external artifact. Approving the initial plan job is not approval of its eventual output. If the artifact is expired, unavailable or differs from the intended operation, reject apply and create a fresh run. Artifact access is limited by repository permissions, not environment reviewers alone; private/sensitive infrastructure must not use publicly readable artifacts or logs.

An apply requires an existing plan and matching target/environment/stack confirmation. Changed config, commit, dirty worktree, variables, foundation output or plan bytes require a new reviewed plan. A failed/attempted apply consumes metadata; do not retry the old plan by reconstructing metadata. Never bypass a refusal by switching to unreviewed direct `terraform apply`.

## Runtime Planning

```sh
npm run platform -- deploy --target gcp --environment dev --image us-central1-docker.pkg.dev/REPLACE_PROJECT/REPLACE_REPOSITORY/api@sha256:REPLACE_DIGEST --secret-version 1
npm run platform -- status --target gcp --environment dev --stack runtime
```

`deploy` is an alias for runtime **plan**, not application deployment. The equivalent is `plan --stack runtime`. It initializes foundation and reads `terraform output -json platform`, passes that nonsecret object into runtime, and binds it into plan metadata. Images must match the manifest project and region. Numeric secret versions must already exist.

After an owner-reviewed schema execution succeeds, the explicitly authorized owner may apply the saved runtime plan with the **same** `--image`, `--secret-version`, and `--confirm gcp/dev/runtime`. The CLI cannot prove schema execution. There is no automated runtime apply workflow until a real schema runner, result checking and cleanup gate are integrated. Do not treat the release artifact's `schemaGate: "not-implemented"` as success.

The build workflow pushes the commit SHA tag, never `latest`, and resolves a digest from BuildKit metadata. Configure immutable tags in Artifact Registry; re-running a build for the same commit may fail instead of replacing a tag. Promote the recorded digest instead of rebuilding when an approved promotion process is added. SBOM/provenance attestations are attached to the registry image index, not standalone reviewed scan evidence. Add policy verification and vulnerability scanning before runtime deployment automation.

`status`/`outputs` read Terraform outputs, not the live API or health checker. For incidents, separately check HTTPS, MIG rollout status, SQL availability, application logs and object signing. The application root probe establishes HTTP liveness only, not DB-aware readiness.

## Rollback And Secret Rotation

Record prior image digest, numeric secret version, config hash and commit in the release history. Rollback means a fresh Terraform runtime plan using a known compatible previous digest and secret version, review, then authorized saved-plan apply after schema compatibility review. Never automatically reverse a schema change or use ad-hoc SSH/gcloud instance changes to fight Terraform ownership. Credential rotation requires a deliberate SQL/Secret Manager synchronization procedure; changing a pinned version does not create the secret or SQL user.

No automated rollback, secret rotation, database restore or schema runner is implemented here. Before production activation, the operations owner must write and exercise those provider-specific procedures and prove backup restore, signed URL access without exported keys, and restricted runtime DML permissions.

## Destruction

```sh
npm run platform -- destroy --target gcp --environment dev --stack runtime --image us-central1-docker.pkg.dev/REPLACE_PROJECT/REPLACE_REPOSITORY/api@sha256:REPLACE_DIGEST --secret-version 1 --confirm gcp/dev/runtime --allow-data-loss
```

This writes a destroy **plan only**. Review it, then apply the saved plan with the same image/secret inputs, `--stack runtime --confirm gcp/dev/runtime --allow-data-loss`. The data-loss flag must be repeated for apply. Production destroy and foundation/bootstrap destroy are rejected even with confirmation. Runtime destruction can remove serving infrastructure and does not promise zero data loss from provider behavior or in-flight requests.

The manual destroy workflow only produces an artifact; no remote destroy apply job exists. An authorized local operator can retrieve that same-run artifact into the correct private stack directory at its exact clean commit, review it and apply through the CLI with dev consent. Preserve artifact confidentiality and file permissions. Do not reconstruct a missing plan from metadata.

For owner retrieval, first verify the exact run, workflow, `main` branch, full commit SHA, environment and successful plan job in GitHub. Use the exact numeric artifact ID linked from that verified run, not a name-only lookup or an artifact from a PR/fork. Download through the authenticated GitHub artifact API/UI into a private temporary directory, check archive entries before extraction, and copy only `reviewed.tfplan`, `plan.json`, `plan.txt` (plus `release.json` for runtime planning records) into the expected ignored paths. Never extract arbitrary paths over the checkout. Set stack directories to 0700 and files to 0600. Check out the recorded commit with a clean worktree and use its committed manifest; do not edit configuration to force hash agreement. Independently review the binary with Terraform when provenance is uncertain. The CLI's hashes detect mismatch, not malicious replacement of both plan and metadata. Runtime apply still requires independently verified schema success; retrieving a release artifact does not satisfy that gate.

Foundation resources continue costing money after runtime teardown. The owner must separately inventory dependencies, export/verify backups, review SQL/storage deletion protection, remove runtime references, and plan foundation teardown under a deliberate data-retention decision. Never disable protection or purge a bucket as an automatic cleanup step. Keep state, federation and bootstrap until all dependent resources and recovery records are accounted for; owner-only bootstrap dismantling is last. This workspace intentionally does not implement that destructive procedure.

## Costs And Security

Cloud SQL, load balancers, Cloud NAT, storage, registry, logging and backup retention may have baseline charges with no traffic. `economy` is not free or scale-to-zero; one replica and single-zone SQL do not provide HA. HA costs more and is not region-level disaster recovery. Get region-specific estimates before apply and review quota/connection limits. Billing alerts are notifications, not spending caps. Runtime destroy does not stop foundation charges.

Use short-lived ADC/WIF credentials and separate identities. Terraform plans/state can contain sensitive values even when terminal output is masked. Restrict bucket and artifact readers, enable backend versioning/audit policy, and never commit state, `.platform/`, tfvars, credentials or secret payloads. GitHub mutation workflows share `platform-gcp-ENVIRONMENT`; coordinate local runs explicitly as well. Backend locks are per stack, not a global release transaction.

Production additionally requires a dedicated project, approved `prod.yaml` activation, HA sizing/SQL review, protected GitHub environments, restrictive WIF bindings, deletion protections, recovery drills, cost approval, and identity/authorization work if the application will handle anything beyond public disposable demo data.
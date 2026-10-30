# Deployment Operations

Use the [onboarding sequence](../onboarding/gcp.md) for the first deployment. All commands here start at repository root and use the same application backend and ordinary local tfvars. Protect state/plans and operate only on nonsensitive public demo data.

## Repeat Releases

Keep `enable_runtime = true` throughout an existing deployment. Never restore the initial false/empty example on later plans.

1. Choose a unique release tag. Run `make build TAG=release-001`, then `make push TAG=release-001`; record the full printed digest.
2. Run `make db-init IMAGE=REGISTRY/api@sha256:DIGEST`. Stop if schema or cleanup fails. New schema must remain compatible with the currently running image until rollout completes.
3. Edit `infra/terraform.tfvars`: persist the new `image` and retain `enable_runtime = true`. Do not leave a competing release auto-tfvars file or environment override active.
4. Run `make plan`, inspect `terraform -chdir=infra show -no-color reviewed.tfplan` privately, then explicitly run `make apply` on that saved plan.
5. Check rollout/backend health, run the smoke test and record the accepted digest. Keep prior compatible image references for deliberate rollback.

Schema changes happen before review/apply and are not reversed if a later deployment is rejected. The current schema is idempotent; arbitrary future migrations are not guaranteed safe. A rollback is a fresh reviewed plan with a previous compatible digest, not a schema reversal. Secret rotation and restore exercises need separate owner-approved procedures.

`make apply` never plans and never passes `-auto-approve`. Terraform considers an explicit saved-plan apply approved without a second prompt. If the state changed, the backend differs, the plan expired or an apply failed/was interrupted, investigate and create a fresh reviewed plan rather than disabling locks or forcing an old artifact. Local plan files contain secrets even when `terraform show` redacts them.

## Health And Smoke

Terraform completion does not mean the rolling update, LB health or database is ready. For the current deployment:

```sh
deployment=$(terraform -chdir=infra output -json deployment)
project=$(printf '%s' "$deployment" | jq -r '.project_id')
region=$(printf '%s' "$deployment" | jq -r '.region')
mig=$(printf '%s' "$deployment" | jq -er '.mig')
gcloud compute instance-groups managed wait-until "$mig" --stable --project="$project" --region="$region" --timeout=900
gcloud compute instance-groups managed list-instances "$mig" --project="$project" --region="$region"
gcloud compute backend-services list --project="$project" --global
```

Confirm healthy API instances in both configured zones. Inspect `gcloud compute backend-services get-health BACKEND_NAME --global --project="$project"` using this application's backend from the list; do not assume unrelated project backends belong to this root.

```sh
url=$(terraform -chdir=infra output -raw api_url)
curl --fail --retry 30 --retry-all-errors --retry-delay 10 --max-time 10 "$url"
make smoke SMOKE_ALLOW_HTTP=true
```

HTTP requires the explicit smoke opt-in and is only for this demo. Signed GCS reads remain HTTPS. Root liveness alone does not establish SQL readiness: smoke performs CRUD, upload and signed read. It removes its demo user but leaves the uploaded object; account for object/version retention and clean up through an authorized data-retention process. Smoke failure after apply reports a failed release; it does not automatically roll back.

## Schema Failures

The schema script defaults to a 900-second timeout and 10-second polling; `SCHEMA_TIMEOUT_SECONDS` and `SCHEMA_POLL_SECONDS` can be set within its validated bounds. It reports guest-attribute success only after the container exits successfully and attempts VM deletion on all normal exits. It does not print secret-bearing serial logs.

If the process/runner is forcibly terminated, a `schema-*` VM can remain. Use `gcloud compute instances list --project=PROJECT --filter='name~^schema-'` to identify it, verify ownership/zone and confirm it is not an active task. Delete only the confirmed orphan with `gcloud compute instances delete VM --project=PROJECT --zone=ZONE`. Never delete every similarly named VM blindly. Check IAM, registry access, NAT, private SQL, Secret Manager access and schema compatibility before retrying. Do not enable a public SQL IP as a workaround.

## GitHub Actions

Credential-free CI keeps npm checks, unit tests, disposable MySQL integration, Docker build and Terraform validation/mock tests. It does not obtain OIDC credentials or deploy. Bootstrap checks only initialize with `-backend=false`; they never apply or migrate bootstrap.

Cloud workflows are manual and **require a private repository** because plans now contain SQL passwords. Repository readers with Actions access may download artifacts; environment reviewers are not the only readers. Restrict collaborator/artifact/log access accordingly. Public repositories must use the protected local sequence rather than publishing plans. One-day retention reduces exposure but is not encryption or per-environment access control.

Set these reviewed, nonsecret GitHub repository/environment variables. Never store secret payloads or service-account JSON keys in them:

| Variable | Value |
| --- | --- |
| `GCP_GITHUB_ENVIRONMENT` | **Repository-level** variable: exact existing WIF-trusted GitHub Environment name; fallback is `dev`. If existing trust uses `prod`, set `prod`; this is identity compatibility, not a second application environment |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Existing full WIF provider identifier |
| `GCP_APPLY_SERVICE_ACCOUNT` | Existing bootstrap deployer email, used explicitly for state, schema and Terraform plan/apply |
| `GCP_RELEASE_PLAN_SERVICE_ACCOUNT` | Existing bootstrap build email matching Terraform `build_service_account`; despite the legacy variable name it only publishes images, with no new state/plan grants |
| `GCP_BACKEND_HCL` | Exact contents of local `infra/backend.hcl`, dedicated application prefix |
| `GCP_TFVARS` | Contents of accepted ordinary `infra/terraform.tfvars`, runtime true and current deployed digest, no SQL password |

Preserve the existing provider/service accounts. Bootstrap restricts the repository name/ID, `refs/heads/main` and exact environment subject. Do not rename the GitHub Environment, invent `plan`/`release` environments, broaden WIF or create keys. Configure branch protection and required reviewers, main-only deployments and prevention of self-review where supported; YAML cannot establish those protections. Using the existing broad deployer for plan is an explicit trusted-admin trade-off, not a claim of read-only plan isolation. Both existing identities remain trusted by the same WIF subject.

The **first deployment is local**: cloud workflows require the already-enabled application's outputs and cannot create the registry before building. Subsequent workflows are:

1. **Publish Image Schema And Reviewed Deployment Plan**: dispatch on main. Existing deployer reads outputs; existing build identity publishes a unique commit/run-tagged Linux amd64 image with SBOM/provenance; deployer runs the private schema task. Only success produces a saved runtime-enabled plan for the new digest and the private `deployment-plan` artifact. Attestation generation is not scan/verification.
2. Review that run's `plan.txt`, binary plan, commit, image digest and schema success privately. Plans, logs and state may be sensitive; do not post them to issues/PR comments. Download only from the verified repository/run. Inspect its `release.auto.tfvars` as the nonsecret accepted image record, not as a new configuration system.
3. Dispatch **Reviewed Terraform Plan And Manual Apply**, operation `apply`, with that exact successful `plan_run_id`. The run must be from the same repository and main commit, from the infrastructure/release workflow and still have its artifact. If main advanced or the artifact expired, create a new plan/release; do not bypass the check. Review before dispatch/approving the environment.
4. Apply downloads only that run's `deployment-plan`, checks the binary/backend checksums and applies the saved file without replanning. Terraform additionally rejects stale state. It then waits for MIG stability and HTTP liveness and runs smoke. The backend configuration must remain byte-for-byte identical between plan/apply.
5. After success, update the image in local `terraform.tfvars` **and** `GCP_TFVARS`, retaining runtime true. Remove any temporary `release.auto.tfvars` after merging its two values if you downloaded it into a working directory. Saved-plan apply uses captured values, not the current repository variable; an unsynchronized later plan must not silently roll the image back.

For infrastructure-only changes, dispatch infrastructure operation `plan`; it requires runtime true in both state and inputs and refuses an image differing from the deployed digest. Review it and dispatch `apply` with its run ID. Image changes must use release/schema or the explicit local schema sequence. No destroy workflow remains.

Both cloud workflows use concurrency group `application-gcp-state` with cancellation disabled, serializing schema/planning/apply runs. GitHub may replace older pending runs; this is not a durable release queue. Another deployment between plan and apply makes the plan stale. Coordinate local operators separately; backend locks do not cover schema or image publishing. Do not use persistent self-hosted runners without separate credential/artifact isolation.

Terraform plan/apply output is kept in private ephemeral runner files, not streamed to logs or uploaded. On failure, review/reproduce privately with the owner rather than enabling shell tracing or publishing raw state/JSON. Only the exact binary plan, readable plan and checksums (plus nonsecret release inputs for release runs) are uploaded for one day; credentials and Terraform data directories are never included. The release job moves deployer credentials outside the Docker build context into the ephemeral runner's private temporary directory; publishing obtains only a short-lived access token and leaves the deployer ADC identity in place for schema and Terraform.

## Costs And Teardown

There is no automated data teardown. SQL deletion protection defaults on and the uploads bucket has Terraform `prevent_destroy`. Full cleanup requires an owner-reviewed backup/retention decision and a saved destroy plan; do not automatically disable protection or purge objects. Keep bootstrap/state/WIF intact until every dependent resource and recovery record is accounted for.

Stopping/removing runtime does not stop SQL, NAT, storage, backup or registry charges. SQL is zonal, not HA; the two-zone API does not provide database failover. Review regional prices, surge, egress, logs, backups and retained object versions. There is no budget alert enforcement, spending cap, automated rollback, restore certification or production readiness claim.
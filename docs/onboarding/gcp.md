# GCP Onboarding

This guide deploys one nonsensitive HTTP demonstration. It assumes the existing owner-managed bootstrap already provides a state bucket, WIF provider, deployer service account and build service account. **Do not reapply, migrate, rename, delete or reinitialize bootstrap as part of application onboarding.** Confirm its existing backend location and nonsecret identifiers with its owner; protect any local state/backups. No new service-account keys are needed.

## Prerequisites

- An existing project with billing, enabled APIs, sufficient Compute/SQL/IP quota and approved recurring costs.
- Terraform 1.11.4 (matching CI), Node 24/npm, Docker with Buildx, Google Cloud CLI, Bash, Make and jq.
- A reviewed region and exactly two distinct zones in it. The default example is not a residency or cost recommendation.
- Approved local permissions for application Terraform/state, registry publishing, temporary VM creation/deletion, guest attribute reads and acting as the schema identity. The deployer is a trusted infrastructure administrator, not a least-privilege sandbox.

Authenticate directly in your terminal using your organization's approved short-lived credentials. For an authorized interactive user, Google Cloud CLI and Terraform ADC are separate logins:

```sh
gcloud auth login
gcloud auth application-default login
```

Use approved impersonation instead where required. Never paste credentials into chat or put passwords/keys in tfvars, metadata, command arguments or source control. The schema script uses the gcloud identity; Terraform uses ADC.

## Application Inputs

From the repository root:

```sh
umask 077
cp infra/backend.hcl.example infra/backend.hcl
cp infra/terraform.tfvars.example infra/terraform.tfvars
```

Edit these ordinary local HCL files before running Terraform. They are deployment inputs, not YAML manifests. Verify they are ignored with `git check-ignore infra/backend.hcl infra/terraform.tfvars` before adding any files to Git.

| File/input | Set explicitly |
| --- | --- |
| `backend.hcl`: `bucket` | Existing protected state bucket from the bootstrap owner |
| `backend.hcl`: `prefix` | Dedicated application prefix, e.g. `application/single`; never the bootstrap or an old stack prefix |
| `terraform.tfvars`: `project_id` | Real billed project ID |
| `region`, `zones` | Region and exactly two distinct zones belonging to it |
| `name` | Stable lowercase resource prefix, at most 17 characters |
| `bucket_name` | Globally unique uploads bucket, distinct from the state bucket |
| `build_service_account` | Existing bootstrap build service-account email, not its JSON key |
| `min_replicas`, `max_replicas` | At least two API replicas; maximum at least minimum; allow rollout surge quota |
| `db_tier`, `machine_type` | Reviewed SQL/VM sizing and connection budget |
| `deletion_protection` | Keep true unless a separately reviewed teardown requires otherwise |
| `enable_runtime`, `image` | Initially false and empty; persist true and a digest after schema success |

Do not export lingering `TF_VAR_*` overrides or leave old `*.auto.tfvars*` files active; Terraform variable precedence can otherwise defeat the intended local inputs. Initialization must point at the reviewed backend. Changing its bucket or prefix later is a state-management operation, not a routine configuration fix.

## Provision The Base

Start with `enable_runtime = false` and `image = ""` in the local tfvars:

```sh
make init
make validate
make plan
terraform -chdir=infra show -no-color reviewed.tfplan
```

Review privately: only application resources, private SQL/VM networking, generated secret, registry, uploads and identities. Reject unexpected deletions, bootstrap resources, old state adoption or wrong project/region. Only after explicit approval:

```sh
make apply
make outputs
terraform -chdir=infra output -raw image_repository
```

`make apply` requires `infra/reviewed.tfplan` and never replans. A saved-plan apply does not ask for a second Terraform confirmation. Plans and state contain the generated SQL password. Use protected storage and least-access readers, not public logs or artifacts.

The base creates no MIG or load balancer. `deployment.api_url` and `deployment.mig` are null until runtime is enabled. Do not use `-target`, a placeholder image or `latest` to bypass this ordering.

## Build And Initialize SQL

With the registry now created, use an approved publisher identity:

```sh
make build TAG=first
make push TAG=first
```

Build targets Linux amd64 and loads the image locally; push authenticates Docker to the registry and prints `REGISTRY/api@sha256:DIGEST`. Build and push do not generate Terraform plans, persist variables or enable runtime. Record the full printed reference, then run:

```sh
make db-init IMAGE=REGISTRY/api@sha256:DIGEST
```

Replace the placeholder with the actual digest. The script accepts exactly one image argument. It reads `terraform -chdir=infra output -json deployment`, creates a temporary COS VM in the application subnet without a public IP, retrieves the credential using its schema identity, runs the image's schema command and polls bounded guest-attribute status. It deletes the VM on success/failure; any schema/cleanup error blocks continuing. It does not expose private MySQL to the runner.

Do not enable runtime until schema succeeds. The existing schema is idempotent, but future migrations must remain compatible with the running version. Runtime and schema identities are distinct Google identities but currently share one native SQL user/credential; this is not SQL least privilege.

## Enable The API

Edit the same local `infra/terraform.tfvars` to persist:

```hcl
enable_runtime = true
image = "us-central1-docker.pkg.dev/YOUR_PROJECT/distributed-cloud/api@sha256:YOUR_64_HEX_DIGEST"
```

The actual path must match `image_repository`; replace the example, not just the digest. Then:

```sh
make plan
terraform -chdir=infra show -no-color reviewed.tfplan
make apply
make outputs
```

Follow the [health checks](../operations/platform.md#health-and-smoke) before `make smoke SMOKE_ALLOW_HTTP=true`. Keep `enable_runtime = true` and the accepted image in local tfvars for every subsequent plan. False on an existing deployment removes serving resources.

This initial local sequence is intentionally required before enabling cloud workflows. Configure the [existing GitHub Environment and WIF variables](../operations/platform.md#github-actions) only after live acceptance. No DNS, certificate or domain is required for the initial HTTP IP endpoint.
# GCP Terraform architecture

## Scope and verification boundary

This is an initial GCP implementation, not a cloud-certified deployment. It uses Compute Engine regional managed instance groups (MIGs), Container-Optimized OS (COS), Docker and startup scripts. It does not use the deprecated konlet/container-declaration agent. The AWS reference is immutable and is not a Terraform target.

All three roots require Terraform **>= 1.9, < 2.0**. This deliberately exceeds 1.7 because input validation references other input variables (introduced in 1.9). Google is constrained to `~> 7.0` and resolved to **7.46.1** in each committed lockfile. Upgrade providers through an explicitly reviewed lockfile update, not incidental CI initialization. Provider schemas and mocked plans are locally testable; none of these establish that IAM, quotas, WAF, COS bootstrap, DNS, signed URLs or Cloud SQL work in a real project.

There are no payload-bearing Secret Manager versions, SQL users or SQL passwords in Terraform. A separate privileged provisioning operation is mandatory. There is no automated schema job or schema-success gate in this delivery. **Do not apply runtime until an authorized operator has successfully applied the schema privately.**

## Root contracts

Paths below are relative to the repository root. Use `terraform -chdir=<root> ...`. Each root has its own state; do not reuse a backend prefix across roots, projects or environments.

Every root takes these inputs:

| Input | Type | Default / rule |
| --- | --- | --- |
| `project_id` | string | Required existing, billing-enabled GCP project ID |
| `region` | string | Required GCP region; no implicit default |
| `environment` | string | Required: `dev` or `prod` |
| `name` | string | `distributed-cloud`; lowercase resource prefix, at most 17 characters |

The 17-character limit reserves space for environment and service-account suffixes. Use separate projects for dev and prod. Validate region support, quotas and costs before applying. Network ranges are fixed (`10.42.0.0/20` subnet and an automatically allocated /16 PSA range); check for overlap before peering or introducing VPNs.

### Bootstrap: `infra/bootstrap/gcp`

Additional required strings: `github_repository` (`owner/repository`), `github_repository_id` (immutable numeric GitHub repository ID), `state_bucket_name` (globally unique bucket name). GitHub names are case-sensitive in the trust condition: use the actual claim spelling.

Outputs: `workload_identity_provider` (full provider resource name), `build_service_account` (email), `deployer_service_account` (email), `state_bucket` (name).

Trust requires the exact repository name **and** numeric ID, `refs/heads/main`, and exact subject `repo:OWNER/REPO:environment:dev` (or `prod`). The workflow must declare that GitHub environment and request `id-token: write`. Protect main, protect the GitHub environment with required reviewers for prod, and restrict its deployment branches to main. Pull-request subjects and forks do not match. Reusable workflows/custom subject formats need a reviewed trust change, not a wildcard. Both build and deploy identities trust this same approved environment; workflow isolation between them is not an enforced separation of duties yet.

Bootstrap enables the Compute, SQL Admin, Service Networking, Storage, Artifact Registry, Secret Manager, IAM Credentials, IAM, STS, Logging, Monitoring, Resource Manager and Service Usage APIs. The owner must already have permission to enable Service Usage itself.

### Foundation: `infra/stacks/gcp/foundation`

| Additional input | Type | Default / rule |
| --- | --- | --- |
| `profile` | string | `economy` or `ha`; default `economy`; prod requires `ha` |
| `db_tier` | string | `db-f1-micro`; HA must use dedicated cores, e.g. `db-custom-2-7680` |
| `bucket_name` | string | Required globally unique 3-63 character lowercase bucket name |
| `build_service_account` | string | Required email from bootstrap output |

SQL is MySQL 8.0 Enterprise with private IP only, automated backups and binary logs. HA selects regional SQL availability; economy is zonal and is not HA. Both API-level and Terraform SQL deletion protection are enabled for prod. Uploads have public access prevention, uniform access, seven-day soft delete and prod versioning. Both uploads and state buckets have unconditional Terraform `prevent_destroy`; dev deletion is deliberately a reviewed code change, not a purge switch. No automatic registry cleanup can delete a currently deployed or rollback digest.

The sole output `platform` has this exact object shape, suitable for the runtime input of the same name:

```text
{
  project_id: string, region: string, environment: string,
  network: string, subnetwork: string,
  db_instance: string, db_host: string, db_name: string,
  bucket: string, registry: string,
  runtime_service_account: string, schema_service_account: string,
  runtime_secret_id: string, schema_secret_id: string
}
```

`network` and `subnetwork` are provider resource IDs. `db_instance` is an instance name; `db_host` is the private IPv4 address. `db_name` is always `aula_pratica_db`, matching the existing SQL script. `registry` is the repository image prefix, e.g. `us-central1-docker.pkg.dev/PROJECT/distributed-cloud-dev` (append `/api@sha256:...`). Service accounts are emails. Secret IDs are short Secret Manager names, not payloads or versions.

### Runtime: `infra/stacks/gcp/runtime`

| Additional input | Type | Default / rule |
| --- | --- | --- |
| `platform` | object above | Required; same project, region and environment as root |
| `image` | string | Required full image in `platform.registry`, ending `@sha256:` plus 64 lowercase hex characters; no tag |
| `runtime_secret_version` | number | Required positive integer, never `latest` |
| `hostname` | string | Required lowercase public DNS hostname, no scheme/path |
| `min_replicas` | number | Integer, default 1; prod requires at least 2 |
| `max_replicas` | number | Integer, default 3; between min and 10 |
| `machine_type` | string | `e2-small`; verify memory/CPU against load |

Outputs: `api_url` (HTTPS URL), `lb_ip` (global IPv4 address), `instance_group` (regional instance group reference), `release_digest` (full immutable image reference).

Runtime uses an evenly distributed regional MIG, CPU autoscaling, health-based autohealing and proactive replacement. It omits `target_size` altogether: the autoscaler is the only size owner, so there is no blanket lifecycle ignore. Rollouts allow three surge VMs and zero unavailable VMs; quota/cost/SQL connection budgets must allow **max + 3**, including bootstrapping instances. A single replica is still a single application failure domain. Regional distribution is provider-selected; no explicit zone input is exposed in this initial version.

The global external managed HTTPS load balancer uses a Google-managed certificate, TLS 1.2+, HTTP-to-HTTPS redirect, request logs and Cloud Armor. Point the hostname's DNS A record to `lb_ip`; remove conflicting AAAA records if no IPv6 listener is configured. Certificate issuance is asynchronous and needs working public DNS. Terraform completion does not imply certificate activation. The WAF uses SQLi v3.3 sensitivity 1 and per-IP throttling at 120 requests/minute. Test representative multipart images before publishing: body inspection limits, false positives, shared-IP throttling and abuse costs remain operational concerns. WAF is not authentication or upload authorization.

## State and first setup

The project and billing attachment must exist. The owner must approve quotas, domain ownership, API enablement, region/data residency and estimated recurring costs (SQL, global LB, NAT, disks, logs and surge capacity). There is no budget alert, spending cap or scale-to-zero database in this delivery.

Authenticate outside Terraform using ADC or short-lived service-account impersonation; never commit keys or tokens. The initial bootstrap is an **owner** operation requiring API enablement, state bucket administration, service-account and WIF administration and project IAM policy administration. `roles/owner` is not assigned by this code. Your organization may provide these capabilities with multiple time-limited roles. Terraform cannot grant its caller permissions the caller does not already possess.

Create protected nonsecret tfvars/backend files outside version control. The following examples use `.auto.tfvars.json`, ignored under `infra/`:

```sh
terraform -chdir=infra/bootstrap/gcp init
terraform -chdir=infra/bootstrap/gcp plan -out=bootstrap.tfplan
terraform -chdir=infra/bootstrap/gcp apply bootstrap.tfplan
terraform -chdir=infra/bootstrap/gcp output -json
```

Bootstrap initially uses local state, because its bucket does not exist yet. Protect local state, backups and saved plans as privileged artifacts. After creation, enable the supplied backend declaration and migrate with the original owner identity:

```sh
cp infra/bootstrap/gcp/backend.gcs.tf.example infra/bootstrap/gcp/backend.tf
terraform -chdir=infra/bootstrap/gcp init -migrate-state \
  -backend-config='bucket=YOUR_STATE_BUCKET' \
  -backend-config='prefix=gcp/PROJECT/dev/bootstrap'
```

Verify the remote state and retain a secured recovery copy before removing local backups. Commit the enabled backend declaration when adopting the remote backend; it contains no project-specific configuration. On a fresh checkout, provide the same bucket/prefix at init. GCS supplies state locking; do not use `-lock=false` to bypass competing deployments.

Foundation and runtime have empty partial GCS backends from the outset:

```sh
terraform -chdir=infra/stacks/gcp/foundation init \
  -backend-config='bucket=YOUR_STATE_BUCKET' \
  -backend-config='prefix=gcp/PROJECT/dev/foundation'
terraform -chdir=infra/stacks/gcp/foundation plan -out=foundation.tfplan
terraform -chdir=infra/stacks/gcp/foundation apply foundation.tfplan
terraform -chdir=infra/stacks/gcp/foundation output -json platform
terraform -chdir=infra/stacks/gcp/runtime init \
  -backend-config='bucket=YOUR_STATE_BUCKET' \
  -backend-config='prefix=gcp/PROJECT/dev/runtime'
```

Pass the output object's **value**, not the `{value,type,sensitive}` wrapper returned by an unqualified `output -json`, as `platform` in runtime tfvars. Do not use `terraform_remote_state` from application identities. To create a reviewed plan, `terraform -chdir=infra/stacks/gcp/runtime plan -out=runtime.tfplan`; apply that exact plan only after the schema gate and image acceptance checks. Plans and outputs may contain privileged topology and must have restricted artifact retention. Serialize foundation/runtime/bootstrap mutations per project/environment in the caller; no release workflow is supplied here.

## Privilege boundary

The deployer explicitly receives project roles: `compute.admin`, `cloudsql.admin`, `servicenetworking.networksAdmin`, `storage.admin`, `artifactregistry.admin`, `secretmanager.admin`, `iam.serviceAccountAdmin`, `iam.serviceAccountUser`, `iam.roleAdmin`, `resourcemanager.projectIamAdmin`, `logging.configWriter`, `monitoring.editor`, `serviceusage.serviceUsageConsumer` (all prefixed `roles/`). These support managing network, SQL, bucket, registry, secrets metadata, service identities, custom signing roles, IAM bindings and logs. Some are broad future operational capabilities rather than exact per-method minimums. In particular, project IAM administration can escalate privileges and Storage Admin reaches the state bucket. **This is a trusted infrastructure administrator, not a sandboxed or no-admin deployment identity.** Narrow custom deployment roles and owner-preprovisioned IAM are a future hardening boundary; do not remove roles blindly and claim deploy still works.

The deployer additionally receives bucket-scoped `storage.objectAdmin` for state objects and lock files. There is no bucket-level IAM deny overriding its project Storage Admin. The shared state bucket permits deployer access to bootstrap state too; use a separately owner-controlled bootstrap bucket in deployments requiring that stronger isolation. Bootstrap API/WIF administration and initial grants remain owner responsibilities; the deployer is not promised the ability to reapply bootstrap.

The build identity receives only repository-scoped Artifact Registry Writer from foundation, not state access. Runtime and schema identities receive repository Reader, project Log Writer and access only to their own secret. Runtime also receives bucket-scoped Object User and a custom role containing **only** `iam.serviceAccounts.signBlob`, bound to itself. There are no runtime/schema state grants and no service-account keys. OAuth `cloud-platform` scope is not an IAM grant. Compute Admin plus Service Account User lets the deployer run workloads as those identities: separation from the trusted deployer is not claimed.

The VPC has Private Google Access, PSA, Cloud NAT and sampled flow logs. VMs have no public IP or SSH ingress. Only GFE/health-check ranges can reach TCP 3000. No SQL ingress firewall is opened. NAT still permits general outbound internet access; this is not an egress allowlist. No IAP troubleshooting rule is provisioned. Any temporary access path needs a reviewed rule and audited identity, not open SSH.

## Secret and database provisioning

Foundation intentionally leaves the initial MySQL password unset and creates no users. Do not expose SQL publicly. Immediately use a privileged owner-controlled Cloud SQL operation to set the initial administrator password (for example `gcloud sql users set-password root --host=% --instance=INSTANCE --prompt-for-password`, after checking the actual initial host). Never pass passwords in CLI arguments, tfvars, shell history, VM metadata or Terraform resources. Organization policy or Cloud SQL API behavior may require adapting this privileged bootstrap; no live behavior has been verified.

From an authorized private SQL client/job, create distinct native MySQL users. Restrict the runtime user to `SELECT, INSERT, UPDATE, DELETE` on `aula_pratica_db.*`. The schema user needs `CREATE` (including the current `CREATE DATABASE IF NOT EXISTS`), `ALTER` and `INDEX` for the current script; explicitly review future DDL before adding privileges. Neither application identity should use root, `GRANT OPTION` or unrestricted global SQL grants. GCP IAM identities do not automatically create or authorize native MySQL users.

Publish separate Secret Manager versions securely using a protected input stream or secret provisioning tool, not Terraform. Both payloads use:

```json
{"DB_USER":"distinct_sql_username","DB_PASSWORD":"provisioned_password"}
```

Both fields must be nonempty strings with no newline, CR or NUL; single-line spaces and quotes are supported. The runtime pins a numeric version. Coordinate SQL password rotation and secret publication, test before rollout and retain compatible old versions only as long as needed for rollback. Secret access/data-access auditing should be enabled and retention chosen by the project owner; this implementation does not turn on organization-wide data-access logs or modify the entire project audit policy.

**Private SQL traffic currently permits non-TLS connections**, because the existing mysql2 application has no TLS input contract. Public SQL is disabled, but this is not end-to-end encryption. Before real production data, add and validate application TLS or an authenticated Cloud SQL connector/proxy, then enforce encrypted SQL connections. Backups/PITR configuration is not evidence of a successful restore. MySQL 8.0 support/extended-support charges must be checked against the intended deployment date.

## Release and COS bootstrap

Build the existing API image once and push to the foundation repository as the build identity. Resolve its immutable digest. The image must have Node with native `fetch`/`AbortSignal.timeout` (the current Node 24 image qualifies) and contain `src/server.js` and the schema command. Validate architecture compatibility with x86 Compute Engine machines.

An automated one-off private schema VM/job is **not implemented**. The required release gate is an operator-run private job using the schema service account and schema secret, the exact release image and the existing `node src/db/apply-schema.js` command (confirm the packaged path). It must await a successful exit, record a nonsecret result and clean up on success/failure/cancellation. Do not run DDL on each replica and do not deploy runtime before this gate. A repeatable private job helper and automated gate are outstanding work, not something Terraform validation proves.

The COS startup script starts Docker, authenticates to Artifact Registry with a metadata-issued OAuth token via password-stdin, pulls the digest with bounded retries and removes Docker's registry credential file. It runs the same image with a Node command override to fetch a pinned Secret Manager version using metadata ADC. No Python, gcloud container or COS package manager is assumed. Errors fail closed without secret payload logs. Runtime env is prepared atomically at mode 0600 in `/run/cloud-api`; Docker starts with host networking, gcplogs, restart supervision and **`node src/server.js`**, bypassing any package start script that applies schema. Initialization is repeatable on reboot; a transient failure beyond the retry budget requires reboot/recreation, and MIG autohealing will replace an unhealthy VM.

The file in `/run` is volatile, but Docker persists container configuration, including environment variables, on the root-owned boot disk. This design does **not** promise memory-only secrets or protection against root/Compute administrators. Application containers can reach the instance metadata service because of host networking. Add a stronger workload isolation/secret delivery design before exposing untrusted code. The COS family resolves at Terraform plan time and may advance on a future plan; review the boot image diff and test before promoting. The API digest remains pinned independently.

The `/` probe measures HTTP process liveness only, not database/schema/storage readiness. Do not infer dependency health or zero downtime from healthy instances. Before public acceptance verify HTTPS/certificate, CRUD, upload, signed unauthenticated download and expiry, private DB isolation, denied anonymous bucket access, denied unrelated secret/state access, allowed/rejected WIF subjects, rollout convergence and a no-change second plan. Test signed URL ADC/signBlob with the actual storage SDK version. Configure alerts, quota limits and a tested recovery procedure separately.

## Local validation

These commands do not apply cloud resources or require production credentials. Use a clean validation checkout/cache when a root was already initialized against a real backend. `init -backend=false` does not erase an existing backend configuration.

```sh
terraform fmt -check -recursive infra
for root in infra/bootstrap/gcp infra/stacks/gcp/foundation infra/stacks/gcp/runtime; do
  terraform -chdir="$root" init -backend=false -input=false -lockfile=readonly
  terraform -chdir="$root" validate
  terraform -chdir="$root" test
done
node --test platform/providers/gcp/startup.test.js
```

The `.tftest.hcl` files use only mocked Google providers and `command = plan`. They exercise private network/SQL/bucket contracts, production protections, exact trust claims, scoped signing, digest/secret pinning, bounded replicas, HTTPS configuration and invalid input rejection. Startup tests execute the credential extraction code with fake HTTP responses, validate credential formatting/fail-closed logging and parse Bash syntax. They do not boot COS or pull an image. Real `init` downloads the signed Google provider and `validate` checks its schema; mock tests do not substitute for that check.

## Teardown and outstanding hardening

Destroy runtime before foundation. Remove DNS separately. Protected prod SQL cannot be destroyed without an explicit reviewed change to both protection mechanisms. Upload/state bucket destruction requires a reviewed lifecycle change; force-destroy is false, and data/version/soft-delete retention needs deliberate handling. The owner should verify backups and restore before deletion. Bootstrap destruction is a separate owner procedure after migrating or retiring all state; ordinary application teardown must not dismantle state or WIF.

Remaining work includes the private schema helper/gate, live GCP acceptance, TLS to SQL, per-method deploy IAM review, alerting/budget resources, provenance/scanning, protected release workflows, SQL connection-capacity measurement, disaster recovery/restore exercises and WAF tuning. Application authentication is outside this delivery; a public demo allows anonymous modification/upload and must contain only disposable data. `prod` enables infrastructure safeguards, not certification for real-user production use.
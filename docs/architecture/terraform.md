# Terraform Architecture

## One Application Root

`infra/` is the only application root and has one GCS state. It composes `modules/network`, `database`, `storage`, `compute` and `load_balancer`. There are no foundation/runtime state handoffs, dev/prod application profiles, deployment YAML or custom CLI. `infra/bootstrap/gcp/` remains separately owner-managed and unchanged. Existing bootstrap identity names do not select an application environment.

Terraform requires >= 1.9 and < 2.0 because input validations reference other variables. CI selects 1.11.4; provider constraints and reviewed lockfiles live in Terraform. Do not upgrade providers incidentally during deployment.

| Module | Responsibility |
| --- | --- |
| Network | VPC/subnet, private service networking for SQL, Private Google Access, NAT and scoped application health-check ingress |
| Database | Private MySQL 8.0, database/user, generated password and Secret Manager payload/version |
| Storage | Private GCS uploads, Artifact Registry, scoped publishing/reading and runtime URL signing |
| Compute | COS startup, digest-pinned container, regional MIG over exactly two explicit zones, minimum two replicas, autoscaling and rolling replacement |
| Load balancer | Public global IP and HTTP frontend/backend health checks, no domain/certificate prerequisite |

`enable_runtime = false` omits serving compute/LB resources to break the initial registry/image dependency. The base is applied once, then the image is published and schema succeeds before persisting `enable_runtime = true` and its digest in ordinary local tfvars. False is not a shutdown mode: it destroys existing serving resources. Image validation requires this root's exact `REGION-docker.pkg.dev/PROJECT/NAME/api@sha256:DIGEST` path.

## Input And Output Contracts

Required inputs are `project_id`, `zones`, `bucket_name` and the existing `build_service_account`. Region defaults to `us-central1`, name to `distributed-cloud`. Exactly two distinct zones must belong to the selected region. `min_replicas` defaults to 2 and cannot be lower; `max_replicas` defaults to 4. Review the [actual variables](../../infra/variables.tf) and [input example](../../infra/terraform.tfvars.example) rather than relying on a parallel config schema.

The [root outputs](../../infra/outputs.tf) expose a nonsecret **object** named `deployment`. `terraform -chdir=infra output -json deployment` returns its value directly, not an encoded JSON string and not the envelope of unqualified `output -json`.

```text
name, project_id, region, zones, network, subnetwork,
schema_service_account, runtime_service_account,
runtime_secret_id, runtime_secret_version,
db_instance, db_host, db_name, bucket,
registry, registry_host, image_repository, image, enable_runtime,
api_url, lb_ip, mig, instance_group
```

The root also exposes `image_repository`, `api_url` and `mig` individually. Serving outputs are null before runtime is enabled. `db_host` is private, `db_name` is `aula_pratica_db`, service accounts are emails, and secret references are identifiers/version numbers only. Outputs never include SQL passwords, access tokens, signed URLs or secret payloads. Treat even nonsecret topology as internal operational information.

## Security Boundaries

Terraform generates a 32-character SQL password and provisions its SQL user and Secret Manager version. The accepted trade-off is that **state, state history and saved plans contain plaintext secret material**. Terraform's sensitive marking redacts presentation, not storage. Restrict the backend bucket, lock/state access, backups, local files and artifact readership; retain encryption/versioning and an owner-reviewed recovery policy. Never publish `terraform show -json`, raw state or secret payloads.

Runtime and schema have separate Google identities but read the same credential and use the same native SQL user. IAM separation does not imply separate DML/DDL grants. The broad trusted deployer can administer IAM and act as workload identities; bootstrap has not become a narrow plan/apply security boundary. Its existing state-bucket access may also reach bootstrap state. Do not claim stronger isolation than its actual IAM grants.

VMs and SQL have no public IP. NAT supports outbound image/API access; it is not an egress allowlist. The temporary schema VM uses the private subnet, schema identity and nonsecret metadata references. Passwords are fetched on the VM, not embedded in metadata/startup arguments. Runtime starts the server directly and does not run schema DDL on every replica boot.

The public API uses **unencrypted HTTP** and has no user authentication or authorization. No TLS frontend, managed certificate or WAF is promised. MySQL private traffic currently allows unencrypted connections too; a private IP is not end-to-end TLS. Use nonsensitive synthetic data only. Signed GCS read URLs must still use HTTPS, but are bearer URLs valid until expiry. The bucket itself has uniform access/public access prevention, versioning, seven-day soft delete and Terraform `prevent_destroy`; it is not publicly readable.

## Availability And Costs

The regional MIG distributes API instances across the two supplied zones and allows rolling surge with zero configured unavailable instances. Quota and connection budgets must cover autoscaling plus surge (currently two extra VMs). Policy settings are not a guarantee of zero downtime or a passed zonal-failure exercise.

Cloud SQL is explicitly **ZONAL**, even though the API spans two zones. Backups and binary logs are configured, but neither proves successful restore nor provides automatic database failover. A SQL/zone outage can stop the whole service. This is not database HA, multi-region failover or disaster recovery.

Cloud SQL, two or more VMs, rollout surge, disks, LB, NAT/IPs, logs, registry, storage, backups, soft-deleted objects and temporary schema VMs can all cost money. There is no scale-to-zero baseline, budget enforcement or spending cap. Review current region-specific pricing, MySQL version/support charges and quotas before provisioning. Database deletion protection defaults on; uploads also require a deliberate reviewed retention/deletion decision.
# Platform boundary

The application remains one Node/Express service. The platform workspace is a small CommonJS CLI, not a cloud abstraction framework. Only `gcp` is a deploy target. Environments are `dev` and explicitly activated `prod`; an AWS storage adapter does not imply AWS infrastructure support.

## Interfaces

`@distributed-cloud/platform` uses installed `yaml` and Ajv dependencies through the root workspace lockfile; the CLI never installs dependencies. Run `npm run platform -- --help` using installed dependencies, or `npm ci` on a fresh checkout. Node must meet the workspace engine requirement. Workflow runners use Node 24 and Terraform 1.11.4 without its action wrapper.

Paths are resolved from the CLI's `__dirname`, never the current directory. Manifests are fixed at `platform/environments/gcp/dev.yaml` and `prod.yaml`. No arbitrary config, stack-root, backend or command override is accepted.

| Root | Owner and role |
| --- | --- |
| `infra/bootstrap/gcp` | Owner-operated state, APIs and federation setup; never ordinary CLI apply/destroy |
| `infra/stacks/gcp/foundation` | Network, database, registry, storage and identities |
| `infra/stacks/gcp/runtime` | Digest-pinned compute and edge resources |

Each ordinary stack receives `project_id`, `region`, `environment`, and `name = "distributed-cloud"`. Foundation also receives `profile`, `db_tier`, manifest `storageBucket` as required `bucket_name`, and manifest string `buildServiceAccount` as required `build_service_account`. Both new fields are mandatory; template placeholders are allowed only for structural example validation, never mutation. State and upload bucket names are separate inputs. The build email comes from bootstrap `build_service_account` and receives repository-scoped publishing access in foundation.

Foundation exposes a **nonsecret, nonempty object** named `platform`: `project_id`, `region`, `environment`, `network`, `subnetwork`, `db_instance`, `db_host`, `db_name`, `bucket`, `registry`, `runtime_service_account`, `schema_service_account`, `runtime_secret_id` and `schema_secret_id`. Terraform owns the detailed object type; the CLI checks the JSON object boundary and runtime Terraform validates its fields. Do not add passwords, tokens, signed URLs or secret payloads to this contract.

Runtime planning first initializes foundation, then executes exactly `terraform output -json platform` in the foundation root. Runtime receives that object as `platform`, plus `image`, numeric `runtime_secret_version`, `hostname`, `min_replicas`, and `max_replicas`. The image must be in this manifest's regional Artifact Registry project and include a full lowercase SHA-256 digest. Tags alone are rejected. A secret version is a positive safe integer, never `latest`.

## State And Plans

The GCS backend uses manifest `stateBucket` and prefix `gcp/PROJECT/ENVIRONMENT/STACK`. Every initialization uses `-reconfigure`; changing backend/project is an owner-reviewed state migration, not something to try by repeatedly applying. Bootstrap uses its own owner-managed backend lifecycle.

The CLI sets a stack-specific `TF_DATA_DIR` and writes JSON variables under `.platform/gcp/ENVIRONMENT/STACK/inputs.auto.tfvars.json`. It passes the absolute path explicitly with `-var-file`. Directories are mode 0700 and generated input/plan/metadata files mode 0600. `.platform/` must remain ignored. Backend locking is enabled; plan/apply use a five-minute lock wait.

After saving the binary plan, the CLI renders that exact file using `terraform show -no-color` into private `plan.txt`; an empty rendering fails before approval metadata is emitted. Workflows publish this readable file with the saved plan and metadata. Foundation approval links the immutable artifact URL and apply downloads only the artifact ID from its prerequisite job in the current run. Reviewers must inspect it, not merely approve an environment prompt. Readable text is review material, not a signed authorization token; the binary plan hash is verified on apply.

`reviewed.tfplan` is paired with `plan.json`: target, environment, stack, backend bucket/prefix, repository HEAD, canonical config hash, variables hash, operation and plan-byte SHA-256. A clean tracked/untracked worktree is required for plan/apply. Canonical hashes ignore object-key order, not changed values. Runtime apply re-reads foundation output, refusing a changed platform object. Only the saved file is applied; there is no implicit replan or `-auto-approve` variable-based apply. Terraform's stale-state detection adds another boundary. Metadata is consumed before apply; a failed apply requires a fresh reviewed plan.

Hashes are consistency checks, not signatures against a malicious operator who can rewrite both files. Limit artifact access, use branch review and protected environments, and review Terraform plan text. Raw Terraform subprocess failure output is deliberately not echoed because provider diagnostics can contain sensitive data; rerun diagnostic commands privately when needed. Successful plan/apply output is visible in operator/CI logs and must also be treated as sensitive.

`status` is an alias of `outputs`, not a live health assertion. Runtime output envelopes require Terraform's `type`, `sensitive`, and `value` fields; sensitive values are redacted. Foundation's dedicated `platform` output is nonsecret by contract. `doctor` validates configuration, checks Terraform JSON version output, repository cleanliness and root existence. It **does not** prove billing, IAM, credentials, quotas, DNS or dependency reachability.

## Delivery Boundary

`deploy` means **runtime plan only**. The image workflow pushes one commit-tagged image with BuildKit SBOM/provenance attestations, records the digest/config hash/commit/secret version, then creates a runtime plan. No runtime apply workflow exists. No schema runner, vulnerability scan gate, attestation verification, smoke gate, automated rollback or health-convergence gate is implemented by this workspace. Attestation generation is not verification. Runtime delivery must not be advertised as end-to-end until those checks exist.

Foundation has an optional protected apply job. Manual destroy creates a dev runtime destroy plan only; applying it requires a second explicit consent. Foundation and bootstrap destruction are never exposed through this CLI.

All subprocesses use `spawnSync` argument arrays with `shell: false`. Tests inject a runner and temporary repository root; they never need cloud credentials. PR CI does not request OIDC tokens. Cloud workflow mutations share `platform-gcp-ENVIRONMENT` concurrency; local operators still need coordination because GitHub concurrency cannot serialize local invocations. Terraform locks protect individual state, not a transaction spanning both stacks.

All cloud jobs use environment `dev` or `prod` on `main`, matching bootstrap's exact environment subject, repository name, immutable numeric repository ID and branch checks. Bootstrap does not provision a read-only plan identity or build-account Terraform planning grants; those are explicit owner prerequisites, not completed automation. The release job validates its publisher email and foundation repository ID before authentication. Required reviewers and branch restrictions must be configured outside YAML.
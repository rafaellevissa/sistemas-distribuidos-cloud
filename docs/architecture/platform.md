# Direct Tool Boundaries

The deployment interface is Terraform plus Docker, gcloud, Bash and an optional thin [Makefile](../../Makefile). There is no deployment CLI, configuration registry or YAML environment layer. For the actual resource/security contracts see [Terraform architecture](terraform.md).

| Operation | Direct command from repository root |
| --- | --- |
| Initialize | `terraform -chdir=infra init -backend-config=backend.hcl` |
| Validate | `terraform -chdir=infra validate` |
| Plan | `terraform -chdir=infra plan -out=reviewed.tfplan` |
| Private review | `terraform -chdir=infra show -no-color reviewed.tfplan` |
| Explicit saved apply | `terraform -chdir=infra apply reviewed.tfplan` |
| Deployment object | `terraform -chdir=infra output -json deployment` |
| Build | `docker buildx build --platform linux/amd64 --load -f apps/api/Dockerfile -t REPOSITORY:TAG .` |
| Publish | `docker push REPOSITORY:TAG`, then resolve and record the immutable registry digest |
| Private schema | `bash scripts/apply-schema-gcp.sh REPOSITORY@sha256:DIGEST` |
| HTTP demo smoke | `SMOKE_ALLOW_HTTP=true node tests/smoke/api.js http://LB_IP` |

The Make targets do not select environments, generate deployment configuration, hide a plan inside apply, or auto-approve changes. Plan paths passed through `PLAN=...` are relative to `infra/`; default is `reviewed.tfplan`. Local tfvars are intentionally user-managed. Do not rely on one-shot `TF_VAR_image` exports: a later ordinary plan must retain the deployed image and `enable_runtime = true`.

The [schema script](../../scripts/apply-schema-gcp.sh) is one bounded private maintenance operation, not a new general-purpose deployment wrapper. It reads the root's deployment object and accepts one digest argument. It has no application environment selector or backend migration behavior.

Make and Terraform outputs describe desired/deployed state, not live service health. Terraform's per-state lock prevents competing state writes, but it does not serialize image publishing or SQL schema operations. Cloud workflows therefore share one concurrency group; operators must coordinate local runs separately. Bootstrap remains outside all ordinary application operations.
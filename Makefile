SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := validate

TERRAFORM ?= terraform
PLAN ?= reviewed.tfplan
TAG ?= manual
IMAGE ?=
SMOKE_ALLOW_HTTP ?= false

.PHONY: fmt init validate plan apply outputs build push db-init smoke

fmt:
	$(TERRAFORM) -chdir=infra fmt -recursive

init:
	$(TERRAFORM) -chdir=infra init -backend-config=backend.hcl

validate:
	$(TERRAFORM) -chdir=infra validate

plan:
	umask 077; $(TERRAFORM) -chdir=infra plan -out="$(PLAN)"

apply:
	test -f "infra/$(PLAN)" || { printf 'Missing saved plan: infra/%s\n' "$(PLAN)" >&2; exit 1; }
	$(TERRAFORM) -chdir=infra apply "$(PLAN)"

outputs:
	$(TERRAFORM) -chdir=infra output -json deployment

build:
	repository=$$($(TERRAFORM) -chdir=infra output -raw image_repository); docker buildx build --platform linux/amd64 --load --file apps/api/Dockerfile --tag "$$repository:$(TAG)" .

push:
	repository=$$($(TERRAFORM) -chdir=infra output -raw image_repository); gcloud auth configure-docker "$${repository%%/*}"; docker push "$$repository:$(TAG)"; digest=$$(gcloud artifacts docker images describe "$$repository:$(TAG)" --format='value(image_summary.digest)'); [[ "$$digest" =~ ^sha256:[a-f0-9]{64}$$ ]]; printf '\nSet image in infra/terraform.tfvars to:\n%s@%s\n' "$$repository" "$$digest"

db-init:
	test -n "$(IMAGE)" || { printf 'Pass IMAGE=REGISTRY/api@sha256:DIGEST\n' >&2; exit 1; }
	bash scripts/apply-schema-gcp.sh "$(IMAGE)"

smoke:
	url=$$($(TERRAFORM) -chdir=infra output -raw api_url); SMOKE_ALLOW_HTTP="$(SMOKE_ALLOW_HTTP)" node tests/smoke/api.js "$$url"
variable "project_id" { type = string }
variable "region" { type = string }
variable "environment" {
  type = string
  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be dev or prod."
  }
}
variable "name" {
  type    = string
  default = "distributed-cloud"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,16}$", var.name))
    error_message = "name must be a lowercase resource prefix of at most 17 characters."
  }
}
variable "platform" {
  type = object({
    project_id              = string, region = string, environment = string,
    network                 = string, subnetwork = string, db_instance = string, db_host = string,
    db_name                 = string, bucket = string, registry = string,
    runtime_service_account = string, schema_service_account = string,
    runtime_secret_id       = string, schema_secret_id = string
  })
  validation {
    condition = (
      var.platform.project_id == var.project_id && var.platform.region == var.region &&
      var.platform.environment == var.environment && var.platform.db_name == "aula_pratica_db"
    )
    error_message = "platform must match this root project/region/environment and the fixed database contract."
  }
  validation {
    condition = (
      can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.platform.project_id)) &&
      can(regex("^[a-z]+-[a-z]+[0-9]+$", var.platform.region)) &&
      can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$", var.platform.bucket)) &&
      can(cidrnetmask("${var.platform.db_host}/32")) &&
      can(regex("^[A-Za-z0-9_-]{1,255}$", var.platform.runtime_secret_id)) &&
      startswith(var.platform.registry, "${var.region}-docker.pkg.dev/${var.project_id}/")
    )
    error_message = "platform contains invalid project, region, bucket, private IPv4 address, secret ID or registry."
  }
}
variable "image" {
  type = string
  validation {
    condition     = can(regex("^[a-z0-9.-]+/[A-Za-z0-9_./-]+@sha256:[a-f0-9]{64}$", var.image)) && startswith(var.image, "${var.platform.registry}/")
    error_message = "image must belong to platform.registry and end in @sha256:<64 lowercase hex characters>."
  }
}
variable "runtime_secret_version" {
  type = number
  validation {
    condition     = var.runtime_secret_version >= 1 && floor(var.runtime_secret_version) == var.runtime_secret_version
    error_message = "Pin a positive numeric Secret Manager version, never latest."
  }
}
variable "hostname" {
  type = string
  validation {
    condition     = length(var.hostname) <= 253 && can(regex("^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$", var.hostname))
    error_message = "hostname must be a lowercase public DNS hostname without scheme or path."
  }
}
variable "min_replicas" {
  type    = number
  default = 1
  validation {
    condition     = var.min_replicas >= (var.environment == "prod" ? 2 : 1) && floor(var.min_replicas) == var.min_replicas
    error_message = "Use at least one replica (two for prod), as an integer."
  }
}
variable "max_replicas" {
  type    = number
  default = 3
  validation {
    condition     = var.max_replicas >= var.min_replicas && var.max_replicas <= 10 && floor(var.max_replicas) == var.max_replicas
    error_message = "max_replicas must be an integer between min_replicas and 10; verify SQL connection capacity separately."
  }
}
variable "machine_type" {
  type    = string
  default = "e2-small"
}
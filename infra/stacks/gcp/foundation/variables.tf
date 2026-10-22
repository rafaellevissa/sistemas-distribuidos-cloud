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
variable "profile" {
  type    = string
  default = "economy"
  validation {
    condition     = contains(["economy", "ha"], var.profile)
    error_message = "profile must be economy or ha."
  }
  validation {
    condition     = var.environment != "prod" || var.profile == "ha"
    error_message = "prod requires the ha profile."
  }
}
variable "db_tier" {
  type    = string
  default = "db-f1-micro"
  validation {
    condition     = var.profile != "ha" || !contains(["db-f1-micro", "db-g1-small"], var.db_tier)
    error_message = "HA requires a dedicated-core Cloud SQL tier, e.g. db-custom-2-7680."
  }
}
variable "bucket_name" {
  type = string
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$", var.bucket_name))
    error_message = "Use a globally unique DNS-compatible bucket name (3-63 characters)."
  }
}
variable "build_service_account" {
  type = string
  validation {
    condition     = can(regex("^[a-z0-9-]+@[^/]+\\.iam\\.gserviceaccount\\.com$", var.build_service_account))
    error_message = "Pass the bootstrap build_service_account email."
  }
}
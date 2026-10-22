terraform {
  required_version = ">= 1.9.0, < 2.0.0"
  backend "gcs" {}
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  prefix = "${var.name}-${var.environment}"
  labels = { environment = var.environment, application = var.name, managed_by = "terraform" }
}

resource "google_compute_network" "app" {
  name                    = local.prefix
  auto_create_subnetworks = false
}
resource "google_compute_subnetwork" "app" {
  name                     = local.prefix
  region                   = var.region
  network                  = google_compute_network.app.id
  ip_cidr_range            = "10.42.0.0/20"
  private_ip_google_access = true
  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.1
    metadata             = "EXCLUDE_ALL_METADATA"
  }
}
resource "google_compute_global_address" "sql" {
  name          = "${local.prefix}-sql"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.app.id
}
resource "google_service_networking_connection" "sql" {
  network                 = google_compute_network.app.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.sql.name]
}
resource "google_compute_router" "app" {
  name    = local.prefix
  region  = var.region
  network = google_compute_network.app.id
}
resource "google_compute_router_nat" "app" {
  name                               = local.prefix
  router                             = google_compute_router.app.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "LIST_OF_SUBNETWORKS"
  subnetwork {
    name                    = google_compute_subnetwork.app.id
    source_ip_ranges_to_nat = ["ALL_IP_RANGES"]
  }
  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

resource "google_sql_database_instance" "app" {
  name                = "${local.prefix}-mysql"
  region              = var.region
  database_version    = "MYSQL_8_0"
  deletion_protection = var.environment == "prod"
  settings {
    tier                        = var.db_tier
    edition                     = "ENTERPRISE"
    availability_type           = var.profile == "ha" ? "REGIONAL" : "ZONAL"
    disk_type                   = "PD_SSD"
    disk_size                   = 10
    disk_autoresize             = true
    disk_autoresize_limit       = 100
    deletion_protection_enabled = var.environment == "prod"
    user_labels                 = local.labels
    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.app.id
      enable_private_path_for_google_cloud_services = true
      ssl_mode                                      = "ALLOW_UNENCRYPTED_AND_ENCRYPTED"
    }
    backup_configuration {
      enabled                        = true
      binary_log_enabled             = true
      start_time                     = "03:00"
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }
    maintenance_window {
      day          = 7
      hour         = 4
      update_track = "stable"
    }
  }
  depends_on = [google_service_networking_connection.sql]
}
resource "google_sql_database" "app" {
  name     = "aula_pratica_db"
  instance = google_sql_database_instance.app.name
}

resource "google_storage_bucket" "uploads" {
  name                        = var.bucket_name
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = local.labels
  versioning { enabled = var.environment == "prod" }
  soft_delete_policy { retention_duration_seconds = 604800 }
  lifecycle { prevent_destroy = true }
}
resource "google_artifact_registry_repository" "app" {
  location      = var.region
  repository_id = local.prefix
  format        = "DOCKER"
  labels        = local.labels
}

resource "google_service_account" "runtime" {
  account_id   = "${local.prefix}-run"
  display_name = "API runtime: DML only through external SQL user"
}
resource "google_service_account" "schema" {
  account_id   = "${local.prefix}-ddl"
  display_name = "Private one-off schema job"
}
resource "google_secret_manager_secret" "runtime" {
  secret_id = "${local.prefix}-runtime"
  labels    = local.labels
  replication {
    auto {}
  }
}
resource "google_secret_manager_secret" "schema" {
  secret_id = "${local.prefix}-schema"
  labels    = local.labels
  replication {
    auto {}
  }
}
resource "google_secret_manager_secret_iam_member" "runtime" {
  secret_id = google_secret_manager_secret.runtime.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}
resource "google_secret_manager_secret_iam_member" "schema" {
  secret_id = google_secret_manager_secret.schema.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.schema.email}"
}
resource "google_storage_bucket_iam_member" "runtime" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.runtime.email}"
}
resource "google_project_iam_custom_role" "sign_blob" {
  role_id     = "${replace(local.prefix, "-", "_")}_signBlob"
  title       = "Upload URL signing only"
  permissions = ["iam.serviceAccounts.signBlob"]
}
resource "google_service_account_iam_member" "sign_blob" {
  service_account_id = google_service_account.runtime.name
  role               = google_project_iam_custom_role.sign_blob.name
  member             = "serviceAccount:${google_service_account.runtime.email}"
}
resource "google_project_iam_member" "logs" {
  for_each = {
    runtime = google_service_account.runtime.email
    schema  = google_service_account.schema.email
  }
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${each.value}"
}
resource "google_artifact_registry_repository_iam_member" "reader" {
  for_each = {
    runtime = google_service_account.runtime.email
    schema  = google_service_account.schema.email
  }
  location   = var.region
  repository = google_artifact_registry_repository.app.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${each.value}"
}
resource "google_artifact_registry_repository_iam_member" "builder" {
  location   = var.region
  repository = google_artifact_registry_repository.app.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${var.build_service_account}"
}

output "platform" {
  value = {
    project_id              = var.project_id
    region                  = var.region
    environment             = var.environment
    network                 = google_compute_network.app.id
    subnetwork              = google_compute_subnetwork.app.id
    db_instance             = google_sql_database_instance.app.name
    db_host                 = google_sql_database_instance.app.private_ip_address
    db_name                 = google_sql_database.app.name
    bucket                  = google_storage_bucket.uploads.name
    registry                = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}"
    runtime_service_account = google_service_account.runtime.email
    schema_service_account  = google_service_account.schema.email
    runtime_secret_id       = google_secret_manager_secret.runtime.secret_id
    schema_secret_id        = google_secret_manager_secret.schema.secret_id
  }
  depends_on = [google_compute_router_nat.app, google_secret_manager_secret_iam_member.runtime, google_artifact_registry_repository_iam_member.reader]
}
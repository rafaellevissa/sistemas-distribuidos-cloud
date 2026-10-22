mock_provider "google" {}
variables {
  project_id            = "example-project"
  region                = "us-central1"
  environment           = "dev"
  bucket_name           = "example-project-demo-uploads"
  build_service_account = "distributed-cloud-dev-build@example-project.iam.gserviceaccount.com"
}
run "private_foundation" {
  command = plan
  assert {
    condition     = !google_sql_database_instance.app.settings[0].ip_configuration[0].ipv4_enabled && google_compute_subnetwork.app.private_ip_google_access
    error_message = "SQL must be private-only and subnet must have Private Google Access."
  }
  assert {
    condition     = google_storage_bucket.uploads.public_access_prevention == "enforced" && !google_storage_bucket.uploads.force_destroy
    error_message = "Uploads must not be public or implicitly purged."
  }
  assert {
    condition     = google_project_iam_custom_role.sign_blob.permissions == toset(["iam.serviceAccounts.signBlob"])
    error_message = "Signing must not grant the broader token creator role."
  }
  assert {
    condition     = output.platform.db_name == "aula_pratica_db" && output.platform.registry == "us-central1-docker.pkg.dev/example-project/distributed-cloud-dev"
    error_message = "Stable platform output contract changed."
  }
  assert {
    condition     = google_secret_manager_secret.runtime.secret_id != google_secret_manager_secret.schema.secret_id
    error_message = "Runtime and schema must use separate secrets."
  }
}
run "protected_ha" {
  command = plan
  variables {
    environment = "prod"
    profile     = "ha"
    db_tier     = "db-custom-2-7680"
  }
  assert {
    condition     = google_sql_database_instance.app.deletion_protection && google_sql_database_instance.app.settings[0].deletion_protection_enabled && google_sql_database_instance.app.settings[0].availability_type == "REGIONAL"
    error_message = "Prod requires both SQL deletion protections and regional availability."
  }
}
run "reject_prod_economy" {
  command = plan
  variables { environment = "prod" }
  expect_failures = [var.profile]
}
run "reject_shared_core_ha" {
  command = plan
  variables { profile = "ha" }
  expect_failures = [var.db_tier]
}
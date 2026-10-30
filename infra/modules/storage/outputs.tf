output "bucket" { value = google_storage_bucket.uploads.name }
output "registry_host" { value = "${var.region}-docker.pkg.dev" }
output "registry" { value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}" }
output "image_repository" { value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}/api" }
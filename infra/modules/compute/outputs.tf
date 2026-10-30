output "mig" { value = google_compute_region_instance_group_manager.api.name }
output "instance_group" { value = google_compute_region_instance_group_manager.api.instance_group }
output "health_check" { value = google_compute_health_check.api.id }
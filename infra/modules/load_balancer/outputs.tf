output "api_url" { value = "http://${google_compute_global_address.api.address}" }
output "ip_address" { value = google_compute_global_address.api.address }
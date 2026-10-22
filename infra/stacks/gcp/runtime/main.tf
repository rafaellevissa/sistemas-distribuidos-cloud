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
  startup = templatefile("${path.module}/../../../../platform/providers/gcp/startup.sh.tftpl", {
    image     = var.image, project_id = var.project_id,
    secret_id = var.platform.runtime_secret_id, secret_version = var.runtime_secret_version,
    db_host   = var.platform.db_host, db_name = var.platform.db_name,
    bucket    = var.platform.bucket, registry_host = split("/", var.platform.registry)[0]
  })
}
data "google_compute_image" "cos" {
  family  = "cos-stable"
  project = "cos-cloud"
}
resource "google_compute_instance_template" "api" {
  name_prefix  = "${local.prefix}-"
  machine_type = var.machine_type
  region       = var.region
  tags         = ["${local.prefix}-api"]
  labels       = { environment = var.environment, application = var.name }
  disk {
    source_image = data.google_compute_image.cos.self_link
    auto_delete  = true
    boot         = true
    disk_size_gb = 20
    disk_type    = "pd-balanced"
  }
  network_interface {
    subnetwork = var.platform.subnetwork
  }
  service_account {
    email  = var.platform.runtime_service_account
    scopes = ["cloud-platform"]
  }
  metadata = {
    startup-script           = local.startup
    block-project-ssh-keys   = "true"
    enable-oslogin           = "TRUE"
    disable-legacy-endpoints = "true"
  }
  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }
  lifecycle { create_before_destroy = true }
}
resource "google_compute_firewall" "gfe" {
  name          = "${local.prefix}-gfe"
  network       = var.platform.network
  source_ranges = ["35.191.0.0/16", "130.211.0.0/22"]
  target_tags   = ["${local.prefix}-api"]
  allow {
    protocol = "tcp"
    ports    = ["3000"]
  }
  log_config { metadata = "EXCLUDE_ALL_METADATA" }
}
resource "google_compute_health_check" "api" {
  name                = local.prefix
  check_interval_sec  = 10
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 3
  http_health_check {
    port         = 3000
    request_path = "/"
  }
}
resource "google_compute_region_instance_group_manager" "api" {
  name                             = local.prefix
  region                           = var.region
  base_instance_name               = local.prefix
  distribution_policy_target_shape = "EVEN"
  version {
    instance_template = google_compute_instance_template.api.id
  }
  named_port {
    name = "http"
    port = 3000
  }
  auto_healing_policies {
    health_check      = google_compute_health_check.api.id
    initial_delay_sec = 300
  }
  update_policy {
    type                  = "PROACTIVE"
    minimal_action        = "REPLACE"
    max_surge_fixed       = 3
    max_unavailable_fixed = 0
    replacement_method    = "SUBSTITUTE"
  }
  wait_for_instances        = true
  wait_for_instances_status = "UPDATED"
}
resource "google_compute_region_autoscaler" "api" {
  name   = local.prefix
  region = var.region
  target = google_compute_region_instance_group_manager.api.id
  autoscaling_policy {
    min_replicas    = var.min_replicas
    max_replicas    = var.max_replicas
    cooldown_period = 180
    cpu_utilization { target = 0.65 }
  }
}
resource "google_compute_security_policy" "api" {
  name = local.prefix
  rule {
    priority = 1000
    action   = "deny(403)"
    match {
      expr { expression = "evaluatePreconfiguredWaf('sqli-v33-stable', {'sensitivity': 1})" }
    }
    description = "SQLi sensitivity 1; tune with representative multipart uploads before public use"
  }
  rule {
    priority = 2000
    action   = "throttle"
    match {
      versioned_expr = "SRC_IPS_V1"
      config { src_ip_ranges = ["*"] }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = 120
        interval_sec = 60
      }
    }
  }
  rule {
    priority = 2147483647
    action   = "allow"
    match {
      versioned_expr = "SRC_IPS_V1"
      config { src_ip_ranges = ["*"] }
    }
  }
}
resource "google_compute_backend_service" "api" {
  name                  = local.prefix
  protocol              = "HTTP"
  port_name             = "http"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  timeout_sec           = 60
  health_checks         = [google_compute_health_check.api.id]
  security_policy       = google_compute_security_policy.api.id
  backend {
    group           = google_compute_region_instance_group_manager.api.instance_group
    balancing_mode  = "UTILIZATION"
    capacity_scaler = 1
  }
  log_config {
    enable      = true
    sample_rate = 1
  }
}
resource "google_compute_global_address" "api" { name = local.prefix }
resource "google_compute_managed_ssl_certificate" "api" {
  name = local.prefix
  managed { domains = [var.hostname] }
}
resource "google_compute_url_map" "api" {
  name            = local.prefix
  default_service = google_compute_backend_service.api.id
}
resource "google_compute_target_https_proxy" "api" {
  name             = local.prefix
  url_map          = google_compute_url_map.api.id
  ssl_certificates = [google_compute_managed_ssl_certificate.api.id]
  ssl_policy       = google_compute_ssl_policy.api.id
}
resource "google_compute_ssl_policy" "api" {
  name            = local.prefix
  profile         = "MODERN"
  min_tls_version = "TLS_1_2"
}
resource "google_compute_global_forwarding_rule" "https" {
  name                  = "${local.prefix}-https"
  ip_address            = google_compute_global_address.api.address
  target                = google_compute_target_https_proxy.api.id
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}
resource "google_compute_url_map" "redirect" {
  name = "${local.prefix}-redirect"
  default_url_redirect {
    https_redirect         = true
    strip_query            = false
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
  }
}
resource "google_compute_target_http_proxy" "redirect" {
  name    = "${local.prefix}-redirect"
  url_map = google_compute_url_map.redirect.id
}
resource "google_compute_global_forwarding_rule" "http" {
  name                  = "${local.prefix}-http"
  ip_address            = google_compute_global_address.api.address
  target                = google_compute_target_http_proxy.redirect.id
  port_range            = "80"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}
output "api_url" { value = "https://${var.hostname}" }
output "lb_ip" { value = google_compute_global_address.api.address }
output "instance_group" { value = google_compute_region_instance_group_manager.api.instance_group }
output "release_digest" { value = var.image }
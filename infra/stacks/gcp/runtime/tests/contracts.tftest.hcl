mock_provider "google" {
  mock_data "google_compute_image" {
    defaults = { self_link = "https://www.googleapis.com/compute/v1/projects/cos-cloud/global/images/cos-test" }
  }
}
variables {
  project_id             = "example-project"
  region                 = "us-central1"
  environment            = "dev"
  hostname               = "api.example.com"
  runtime_secret_version = 1
  image                  = "us-central1-docker.pkg.dev/example-project/distributed-cloud-dev/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  platform = {
    project_id              = "example-project", region = "us-central1", environment = "dev"
    network                 = "projects/example-project/global/networks/distributed-cloud-dev"
    subnetwork              = "projects/example-project/regions/us-central1/subnetworks/distributed-cloud-dev"
    db_instance             = "distributed-cloud-dev-mysql", db_host = "10.43.0.3", db_name = "aula_pratica_db"
    bucket                  = "example-project-demo-uploads"
    registry                = "us-central1-docker.pkg.dev/example-project/distributed-cloud-dev"
    runtime_service_account = "distributed-cloud-dev-run@example-project.iam.gserviceaccount.com"
    schema_service_account  = "distributed-cloud-dev-ddl@example-project.iam.gserviceaccount.com"
    runtime_secret_id       = "distributed-cloud-dev-runtime", schema_secret_id = "distributed-cloud-dev-schema"
  }
}
run "private_digest_runtime" {
  command = plan
  assert {
    condition     = length(google_compute_instance_template.api.network_interface[0].access_config) == 0
    error_message = "API VMs must not have public IPs."
  }
  assert {
    condition     = google_compute_firewall.gfe.source_ranges == toset(["35.191.0.0/16", "130.211.0.0/22"])
    error_message = "Only GFE and health check ranges may reach the API."
  }
  assert {
    condition     = strcontains(local.startup, "--entrypoint node") && strcontains(local.startup, "src/server.js") && !strcontains(local.startup, "konlet") && !strcontains(local.startup, "latest:access")
    error_message = "Startup must run the server directly and pin secret versions without konlet."
  }
  assert {
    condition     = google_compute_region_autoscaler.api.autoscaling_policy[0].max_replicas == 3 && google_compute_region_instance_group_manager.api.update_policy[0].max_unavailable_fixed == 0
    error_message = "Autoscaling must be capped and rollouts bounded."
  }
  assert {
    condition     = google_compute_url_map.redirect.default_url_redirect[0].https_redirect && google_compute_backend_service.api.load_balancing_scheme == "EXTERNAL_MANAGED" && google_compute_security_policy.api.name == "distributed-cloud-dev"
    error_message = "The external managed edge must include HTTPS redirect and a dedicated security policy."
  }
}
run "reject_mutable_image" {
  command = plan
  variables { image = "us-central1-docker.pkg.dev/example-project/distributed-cloud-dev/api:latest" }
  expect_failures = [var.image]
}
run "reject_secret_alias" {
  command = plan
  variables { runtime_secret_version = 0 }
  expect_failures = [var.runtime_secret_version]
}
run "reject_unbounded_replicas" {
  command = plan
  variables { max_replicas = 100 }
  expect_failures = [var.max_replicas]
}
run "reject_cross_environment_platform" {
  command = plan
  variables { environment = "prod" }
  expect_failures = [var.platform, var.min_replicas]
}
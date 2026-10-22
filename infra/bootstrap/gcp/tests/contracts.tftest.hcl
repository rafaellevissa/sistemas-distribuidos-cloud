mock_provider "google" {}
variables {
  project_id           = "example-project"
  region               = "us-central1"
  environment          = "dev"
  github_repository    = "example/distributed-cloud"
  github_repository_id = "123456"
  state_bucket_name    = "example-project-tfstate-dev"
}
run "restricted_identity_and_state" {
  command = plan
  assert {
    condition     = google_storage_bucket.state.public_access_prevention == "enforced" && google_storage_bucket.state.versioning[0].enabled
    error_message = "State must be versioned and private."
  }
  assert {
    condition     = strcontains(google_iam_workload_identity_pool_provider.github.attribute_condition, "assertion.ref == 'refs/heads/main'") && strcontains(google_iam_workload_identity_pool_provider.github.attribute_condition, "repo:example/distributed-cloud:environment:dev") && strcontains(google_iam_workload_identity_pool_provider.github.attribute_condition, "assertion.repository_id == '123456'")
    error_message = "Federation must constrain main, exact environment subject and immutable repository ID."
  }
  assert {
    condition     = google_storage_bucket_iam_member.deployer_state.role == "roles/storage.objectAdmin"
    error_message = "Deployer requires state object/lock operations."
  }
}
run "invalid_environment" {
  command = plan
  variables { environment = "staging" }
  expect_failures = [var.environment]
}
run "invalid_repository" {
  command = plan
  variables { github_repository = "example/repo' || true" }
  expect_failures = [var.github_repository]
}
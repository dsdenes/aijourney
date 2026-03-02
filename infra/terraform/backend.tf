# =============================================================================
# Terraform Backend — S3 state storage
# =============================================================================
terraform {
  backend "s3" {
    bucket  = "815-ai-tools-terraform-tf-state"
    key     = "aijourney/mvp/terraform.tfstate"
    region  = "eu-central-1"
    encrypt = true
  }
}

# =============================================================================
# Terraform Configuration — Mito AI Journey MVP
# =============================================================================
# Infrastructure as Code for the AI Journey platform.
# Manages: DynamoDB, S3, CloudFront, Cognito, Lightsail, ElastiCache, CloudWatch
#
# NOTE: IAM roles/policies cannot be created by this user (PowerUser minus IAM).
# IAM resources must be pre-created by an admin and referenced by ARN.
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  default_tags {
    tags = {
      Project     = "aijourney"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# ---------------------------------------------------------------------------
# Modules
# ---------------------------------------------------------------------------

module "data" {
  source      = "./modules/data"
  environment = var.environment
  project     = var.project
}

module "cdn" {
  source                = "./modules/cdn"
  environment           = var.environment
  project               = var.project
  frontend_bucket_name  = module.data.frontend_bucket_name
  frontend_bucket_arn   = module.data.frontend_bucket_arn
  frontend_domain       = module.data.frontend_bucket_regional_domain
}

module "cognito" {
  source           = "./modules/cognito"
  environment      = var.environment
  project          = var.project
  allowed_domain   = var.allowed_email_domain
  callback_urls    = var.cognito_callback_urls
  logout_urls      = var.cognito_logout_urls
  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret
}

module "observability" {
  source      = "./modules/observability"
  environment = var.environment
  project     = var.project
}

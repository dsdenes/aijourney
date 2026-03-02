# =============================================================================
# Variables
# =============================================================================

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "eu-central-1"
}

variable "aws_profile" {
  description = "AWS CLI profile to use"
  type        = string
  default     = "mito815"
}

variable "environment" {
  description = "Environment name (mvp, staging, production)"
  type        = string
  default     = "mvp"
}

variable "project" {
  description = "Project name prefix for resources"
  type        = string
  default     = "aijourney"
}

variable "allowed_email_domain" {
  description = "Email domain allowed for authentication"
  type        = string
  default     = "mito.hu"
}

variable "cognito_callback_urls" {
  description = "OAuth callback URLs for Cognito"
  type        = list(string)
  default     = ["http://localhost:5173/auth/callback"]
}

variable "cognito_logout_urls" {
  description = "OAuth logout URLs for Cognito"
  type        = list(string)
  default     = ["http://localhost:5173"]
}

variable "google_client_id" {
  description = "Google OAuth client ID for Cognito federation"
  type        = string
  sensitive   = true
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth client secret for Cognito federation"
  type        = string
  sensitive   = true
  default     = ""
}

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

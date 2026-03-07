# =============================================================================
# Outputs
# =============================================================================

output "dynamodb_tables" {
  description = "DynamoDB table names"
  value       = module.data.dynamodb_table_names
}

output "frontend_bucket" {
  description = "S3 bucket for frontend assets"
  value       = module.data.frontend_bucket_name
}

output "kb_data_bucket" {
  description = "S3 bucket for knowledge base data"
  value       = module.data.kb_data_bucket_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = module.cdn.distribution_id
}

output "cloudfront_domain" {
  description = "CloudFront domain name"
  value       = module.cdn.domain_name
}

output "log_groups" {
  description = "CloudWatch log group names"
  value       = module.observability.log_group_names
}

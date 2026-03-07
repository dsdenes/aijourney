# =============================================================================
# Data Module — DynamoDB tables + S3 buckets
# =============================================================================

variable "environment" {
  type = string
}

variable "project" {
  type = string
}

# ---------------------------------------------------------------------------
# DynamoDB Tables
# ---------------------------------------------------------------------------

locals {
  tables = {
    users = {
      hash_key  = "id"
      range_key = null
      gsi = [
        {
          name     = "email-index"
          hash_key = "email"
        },
        {
          name     = "googleId-index"
          hash_key = "googleId"
        }
      ]
    }
    articles = {
      hash_key  = "id"
      range_key = null
      gsi = [
        {
          name      = "status-crawledAt-index"
          hash_key  = "status"
          range_key = "crawledAt"
        }
      ]
    }
    summaries = {
      hash_key  = "id"
      range_key = null
      gsi = [
        {
          name     = "articleId-index"
          hash_key = "articleId"
        }
      ]
    }
    agent_runs = {
      hash_key  = "id"
      range_key = null
      gsi = [
        {
          name      = "agent-createdAt-index"
          hash_key  = "agent"
          range_key = "createdAt"
        },
        {
          name      = "status-createdAt-index"
          hash_key  = "status"
          range_key = "createdAt"
        }
      ]
    }
    journeys = {
      hash_key  = "id"
      range_key = null
      gsi = [
        {
          name     = "userId-index"
          hash_key = "userId"
        }
      ]
    }
    journey_steps = {
      hash_key  = "id"
      range_key = null
      gsi = [
        {
          name      = "journeyId-order-index"
          hash_key  = "journeyId"
          range_key = "order"
        }
      ]
    }
    run_requests = {
      hash_key  = "id"
      range_key = null
      gsi = [
        {
          name      = "status-createdAt-index"
          hash_key  = "status"
          range_key = "createdAt"
        },
        {
          name      = "userId-createdAt-index"
          hash_key  = "userId"
          range_key = "createdAt"
        }
      ]
    }
    run_logs = {
      hash_key  = "id"
      range_key = null
      gsi = [
        {
          name      = "runRequestId-timestamp-index"
          hash_key  = "runRequestId"
          range_key = "timestamp"
        }
      ]
    }
    budgets = {
      hash_key  = "id"
      range_key = null
      gsi = []
    }
    kpi_snapshots = {
      hash_key  = "id"
      range_key = null
      gsi = [
        {
          name      = "userId-capturedAt-index"
          hash_key  = "userId"
          range_key = "capturedAt"
        }
      ]
    }
    chat_sessions = {
      hash_key  = "id"
      range_key = null
      gsi = [
        {
          name      = "userId-createdAt-index"
          hash_key  = "userId"
          range_key = "createdAt"
        }
      ]
    }
  }
}

resource "aws_dynamodb_table" "tables" {
  for_each = local.tables

  name         = each.key
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = each.value.hash_key

  attribute {
    name = each.value.hash_key
    type = "S"
  }

  # Add range key attribute if defined at table level
  dynamic "attribute" {
    for_each = each.value.range_key != null ? [each.value.range_key] : []
    content {
      name = attribute.value
      type = "S"
    }
  }

  # Add all GSI key attributes
  dynamic "attribute" {
    for_each = {
      for attr in distinct(flatten([
        for gsi in each.value.gsi : concat(
          [gsi.hash_key],
          try([gsi.range_key], [])
        )
      ])) : attr => attr
      if attr != each.value.hash_key && (each.value.range_key == null || attr != each.value.range_key)
    }
    content {
      name = attribute.value
      type = "S"
    }
  }

  dynamic "global_secondary_index" {
    for_each = each.value.gsi
    content {
      name            = global_secondary_index.value.name
      hash_key        = global_secondary_index.value.hash_key
      range_key       = try(global_secondary_index.value.range_key, null)
      projection_type = "ALL"
    }
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Table = each.key
  }
}

# ---------------------------------------------------------------------------
# S3 Buckets
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "frontend" {
  bucket = "${var.project}-frontend"

  tags = {
    Purpose = "Frontend static assets"
  }
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket" "kb_data" {
  bucket = "${var.project}-kb-data"

  tags = {
    Purpose = "Knowledge base documents for Bedrock"
  }
}

resource "aws_s3_bucket_versioning" "kb_data" {
  bucket = aws_s3_bucket.kb_data.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "kb_data" {
  bucket = aws_s3_bucket.kb_data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "dynamodb_table_names" {
  value = { for k, v in aws_dynamodb_table.tables : k => v.name }
}

output "frontend_bucket_name" {
  value = aws_s3_bucket.frontend.bucket
}

output "frontend_bucket_arn" {
  value = aws_s3_bucket.frontend.arn
}

output "frontend_bucket_regional_domain" {
  value = aws_s3_bucket.frontend.bucket_regional_domain_name
}

output "kb_data_bucket_name" {
  value = aws_s3_bucket.kb_data.bucket
}

output "kb_data_bucket_arn" {
  value = aws_s3_bucket.kb_data.arn
}

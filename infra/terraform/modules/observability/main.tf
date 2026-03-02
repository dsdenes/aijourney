# =============================================================================
# Observability Module — CloudWatch Log Groups + Alarms
# =============================================================================

variable "environment" {
  type = string
}

variable "project" {
  type = string
}

# ---------------------------------------------------------------------------
# Log Groups
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "api" {
  name              = "/${var.project}/${var.environment}/api"
  retention_in_days = 30

  tags = {
    Service = "api"
  }
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/${var.project}/${var.environment}/worker"
  retention_in_days = 30

  tags = {
    Service = "worker"
  }
}

resource "aws_cloudwatch_log_group" "kb_builder" {
  name              = "/${var.project}/${var.environment}/kb-builder"
  retention_in_days = 30

  tags = {
    Service = "kb-builder"
  }
}

# ---------------------------------------------------------------------------
# Metric Alarms
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "api_errors" {
  alarm_name          = "${var.project}-${var.environment}-api-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "API 5XX errors above threshold"
  treat_missing_data  = "notBreaching"

  tags = {
    Service = "api"
  }
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "log_group_names" {
  value = {
    api        = aws_cloudwatch_log_group.api.name
    worker     = aws_cloudwatch_log_group.worker.name
    kb_builder = aws_cloudwatch_log_group.kb_builder.name
  }
}

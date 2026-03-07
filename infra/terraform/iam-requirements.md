# IAM Requirements — Pre-creation Needed

#

# These IAM resources CANNOT be created by the Terraform user (d.pal)

# due to PowerUser policy restrictions. They must be created by an admin (fmile).

#

# =============================================================================

## 1. ECS Task Execution Role

# Name: aijourney-ecs-task-execution-role

# Trust: ecs-tasks.amazonaws.com

# Policies:

# - AmazonECSTaskExecutionRolePolicy (AWS managed)

# - AmazonSSMReadOnlyAccess (for parameter store)

# - SecretsManagerReadWrite (for secrets)

## 2. ECS Task Role (API)

# Name: aijourney-api-task-role

# Trust: ecs-tasks.amazonaws.com

# Policies:

# - DynamoDB full access to aijourney-\* tables

# - ElastiCache connect

# - Bedrock InvokeModel, RetrieveAndGenerate

# - S3 read on aijourney-kb-data

# - CloudWatch Logs write

# - Cognito user pool read

## 3. ECS Task Role (Worker)

# Name: aijourney-worker-task-role

# Trust: ecs-tasks.amazonaws.com

# Policies:

# - DynamoDB full access to aijourney-\* tables

# - ElastiCache connect

# - S3 read/write on aijourney-kb-data

# - CloudWatch Logs write

## 4. ECS Task Role (KB Builder)

# Name: aijourney-kb-builder-task-role

# Trust: ecs-tasks.amazonaws.com

# Policies:

# - DynamoDB full access to articles, summaries, agent_runs tables

# - S3 read/write on aijourney-kb-data

# - Bedrock Agent (for KB ingestion)

# - CloudWatch Logs write

## 5. Bedrock Knowledge Base Role

# Name: aijourney-bedrock-kb-role

# Trust: bedrock.amazonaws.com

# Policies:

# - S3 read on aijourney-kb-data

# - Bedrock foundational model access (titan-embed-text-v2)

## 6. CloudFront OAC

# NOTE: CloudFront OAC does not require an IAM role — handled via S3 bucket policy.

# This is already managed in Terraform directly.

# =============================================================================

# How to request:

# 1. Share this file with fmile (Owner, access_level 50)

# 2. Admin creates roles using AWS Console or separate privileged Terraform

# 3. Admin provides ARNs

# 4. Reference ARNs as data sources in Terraform:

#

# data "aws_iam_role" "ecs_task_execution" {

# name = "aijourney-ecs-task-execution-role"

# }

# =============================================================================

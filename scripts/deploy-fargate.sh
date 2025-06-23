#!/bin/bash

# AWS Fargate Deployment Script for Signal AI Chat Bot
# Usage: ./scripts/deploy-fargate.sh [environment]

set -e

# Configuration
ENVIRONMENT=${1:-dev}
AWS_REGION=${AWS_REGION:-us-east-1}
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="signal-aichat"
IMAGE_TAG=${GITHUB_SHA:-latest}
CLUSTER_NAME="signal-aichat-${ENVIRONMENT}"
SERVICE_NAME="signal-aichat-service"
TASK_FAMILY="signal-aichat-${ENVIRONMENT}"

echo "🚀 Deploying Signal AI Chat Bot to AWS Fargate"
echo "Environment: $ENVIRONMENT"
echo "Region: $AWS_REGION"
echo "Image Tag: $IMAGE_TAG"

# Step 1: Build and push Docker image
echo "📦 Building and pushing Docker image..."

# Get ECR login token
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Create ECR repository if it doesn't exist
aws ecr describe-repositories --repository-names $ECR_REPO --region $AWS_REGION 2>/dev/null || \
aws ecr create-repository --repository-name $ECR_REPO --region $AWS_REGION

# Build and tag image
docker build -t $ECR_REPO:$IMAGE_TAG .
docker tag $ECR_REPO:$IMAGE_TAG $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$IMAGE_TAG

# Push image
docker push $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$IMAGE_TAG

echo "✅ Image pushed: $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$IMAGE_TAG"

# Step 2: Update task definition
echo "📋 Updating ECS task definition..."

# Generate task definition
envsubst < scripts/task-definition-template.json > /tmp/task-definition.json

# Register new task definition
TASK_DEFINITION_ARN=$(aws ecs register-task-definition \
  --cli-input-json file:///tmp/task-definition.json \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)

echo "✅ Task definition registered: $TASK_DEFINITION_ARN"

# Step 3: Update ECS service
echo "🔄 Updating ECS service..."

# Check if cluster exists
aws ecs describe-clusters --clusters $CLUSTER_NAME --region $AWS_REGION >/dev/null 2>&1 || {
  echo "Creating ECS cluster: $CLUSTER_NAME"
  aws ecs create-cluster --cluster-name $CLUSTER_NAME --capacity-providers FARGATE --region $AWS_REGION
}

# Check if service exists
if aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --region $AWS_REGION >/dev/null 2>&1; then
  # Update existing service
  aws ecs update-service \
    --cluster $CLUSTER_NAME \
    --service $SERVICE_NAME \
    --task-definition $TASK_FAMILY \
    --force-new-deployment \
    --region $AWS_REGION
  
  echo "✅ Service updated: $SERVICE_NAME"
else
  # Create new service
  aws ecs create-service \
    --cluster $CLUSTER_NAME \
    --service-name $SERVICE_NAME \
    --task-definition $TASK_FAMILY \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$(aws ec2 describe-subnets --filters Name=default-for-az,Values=true --query 'Subnets[0].SubnetId' --output text)],securityGroups=[$(aws ec2 describe-security-groups --filters Name=group-name,Values=default --query 'SecurityGroups[0].GroupId' --output text)],assignPublicIp=ENABLED}" \
    --region $AWS_REGION
  
  echo "✅ Service created: $SERVICE_NAME"
fi

# Step 4: Wait for deployment
echo "⏳ Waiting for deployment to complete..."

aws ecs wait services-stable \
  --cluster $CLUSTER_NAME \
  --services $SERVICE_NAME \
  --region $AWS_REGION

echo "🎉 Deployment completed successfully!"

# Step 5: Display service information
echo "📊 Service Information:"
aws ecs describe-services \
  --cluster $CLUSTER_NAME \
  --services $SERVICE_NAME \
  --region $AWS_REGION \
  --query 'services[0].{Status:status,RunningCount:runningCount,PendingCount:pendingCount,TaskDefinition:taskDefinition}'

echo ""
echo "📝 Next steps:"
echo "1. Register your Signal phone number:"
echo "   curl -X POST 'http://YOUR_ALB_URL:8080/v1/register/+1234567890'"
echo "2. Verify with SMS code:"
echo "   curl -X POST 'http://YOUR_ALB_URL:8080/v1/register/+1234567890/verify/123456'"
echo "3. Test sending messages:"
echo "   curl -X POST 'http://YOUR_ALB_URL:8080/v2/send' -H 'Content-Type: application/json' -d '{\"number\":\"+1234567890\",\"recipients\":[\"+0987654321\"],\"message\":\"!openai Hello from AWS!\"}'"
echo ""
echo "🔗 View logs: aws logs tail /ecs/signal-aichat-${ENVIRONMENT} --follow"
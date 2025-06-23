#!/bin/bash

# Setup AWS Resources for Signal AI Chat Bot
# Usage: ./scripts/setup-aws-resources.sh [environment]

set -e

ENVIRONMENT=${1:-dev}
AWS_REGION=${AWS_REGION:-us-east-1}
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "🔧 Setting up AWS resources for Signal AI Chat Bot"
echo "Environment: $ENVIRONMENT"
echo "Region: $AWS_REGION"
echo "Account: $ACCOUNT_ID"

# Create IAM roles
echo "👤 Creating IAM roles..."

# ECS Task Execution Role
cat > /tmp/task-execution-role-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
  --role-name ecsTaskExecutionRole \
  --assume-role-policy-document file:///tmp/task-execution-role-trust-policy.json \
  --path / 2>/dev/null || echo "Role ecsTaskExecutionRole already exists"

aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Signal AI Chat Task Role
cat > /tmp/signal-task-role-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

cat > /tmp/signal-task-role-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath"
      ],
      "Resource": [
        "arn:aws:ssm:${AWS_REGION}:${ACCOUNT_ID}:parameter/signal-aichat/${ENVIRONMENT}/*"
      ]
    }
  ]
}
EOF

aws iam create-role \
  --role-name signal-aichat-task-role \
  --assume-role-policy-document file:///tmp/signal-task-role-trust-policy.json \
  --path / 2>/dev/null || echo "Role signal-aichat-task-role already exists"

aws iam put-role-policy \
  --role-name signal-aichat-task-role \
  --policy-name signal-aichat-ssm-access \
  --policy-document file:///tmp/signal-task-role-policy.json

echo "✅ IAM roles created"

# Create CloudWatch log group
echo "📊 Creating CloudWatch log group..."
aws logs create-log-group \
  --log-group-name "/ecs/signal-aichat-${ENVIRONMENT}" \
  --region $AWS_REGION 2>/dev/null || echo "Log group already exists"

echo "✅ CloudWatch log group created"

# Create Parameter Store parameters
echo "🔐 Creating Parameter Store parameters..."

# Phone number (you'll need to update this with your actual number)
aws ssm put-parameter \
  --name "/signal-aichat/${ENVIRONMENT}/phone" \
  --value "+1234567890" \
  --type "SecureString" \
  --description "Signal phone number for ${ENVIRONMENT} environment" \
  --overwrite 2>/dev/null || echo "Phone parameter already exists"

# OpenAI API Key (placeholder - update with real key)
aws ssm put-parameter \
  --name "/signal-aichat/${ENVIRONMENT}/openai-key" \
  --value "sk-your-openai-key-here" \
  --type "SecureString" \
  --description "OpenAI API key for ${ENVIRONMENT} environment" \
  --overwrite 2>/dev/null || echo "OpenAI key parameter already exists"

# OpenRouter API Key (placeholder - update with real key)
aws ssm put-parameter \
  --name "/signal-aichat/${ENVIRONMENT}/openrouter-key" \
  --value "sk-your-openrouter-key-here" \
  --type "SecureString" \
  --description "OpenRouter API key for ${ENVIRONMENT} environment" \
  --overwrite 2>/dev/null || echo "OpenRouter key parameter already exists"

echo "✅ Parameter Store parameters created"

# Create security group for ECS tasks
echo "🔒 Creating security group..."

VPC_ID=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)

SECURITY_GROUP_ID=$(aws ec2 create-security-group \
  --group-name "signal-aichat-${ENVIRONMENT}" \
  --description "Security group for Signal AI Chat Bot ${ENVIRONMENT}" \
  --vpc-id $VPC_ID \
  --query 'GroupId' \
  --output text 2>/dev/null || \
  aws ec2 describe-security-groups \
    --filters Name=group-name,Values="signal-aichat-${ENVIRONMENT}" \
    --query 'SecurityGroups[0].GroupId' \
    --output text)

# Add ingress rules
aws ec2 authorize-security-group-ingress \
  --group-id $SECURITY_GROUP_ID \
  --protocol tcp \
  --port 8080 \
  --cidr 0.0.0.0/0 2>/dev/null || echo "Port 8080 rule already exists"

aws ec2 authorize-security-group-ingress \
  --group-id $SECURITY_GROUP_ID \
  --protocol tcp \
  --port 3000 \
  --cidr 0.0.0.0/0 2>/dev/null || echo "Port 3000 rule already exists"

echo "✅ Security group created: $SECURITY_GROUP_ID"

# Create Application Load Balancer (optional, for external access)
echo "⚖️ Creating Application Load Balancer..."

SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters Name=default-for-az,Values=true \
  --query 'Subnets[*].SubnetId' \
  --output text | tr '\t' ',')

ALB_ARN=$(aws elbv2 create-load-balancer \
  --name "signal-aichat-${ENVIRONMENT}" \
  --subnets $(echo $SUBNET_IDS | tr ',' ' ') \
  --security-groups $SECURITY_GROUP_ID \
  --scheme internet-facing \
  --type application \
  --ip-address-type ipv4 \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text 2>/dev/null || \
  aws elbv2 describe-load-balancers \
    --names "signal-aichat-${ENVIRONMENT}" \
    --query 'LoadBalancers[0].LoadBalancerArn' \
    --output text)

echo "✅ Load balancer created: $ALB_ARN"

# Cleanup temporary files
rm -f /tmp/*-policy.json

echo ""
echo "🎉 AWS resources setup completed!"
echo ""
echo "📝 Next steps:"
echo "1. Update Parameter Store with your actual values:"
echo "   aws ssm put-parameter --name '/signal-aichat/${ENVIRONMENT}/phone' --value '+YOUR_PHONE_NUMBER' --type SecureString --overwrite"
echo "   aws ssm put-parameter --name '/signal-aichat/${ENVIRONMENT}/openai-key' --value 'sk-YOUR_OPENAI_KEY' --type SecureString --overwrite"
echo "   aws ssm put-parameter --name '/signal-aichat/${ENVIRONMENT}/openrouter-key' --value 'sk-YOUR_OPENROUTER_KEY' --type SecureString --overwrite"
echo ""
echo "2. Deploy the application:"
echo "   ./scripts/deploy-fargate.sh ${ENVIRONMENT}"
echo ""
echo "3. Register your Signal number and start chatting!"
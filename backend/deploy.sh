#!/usr/bin/env bash
# Deploy sample-agents-and-dragons to Bedrock AgentCore Runtime.
#
# Five idempotent phases:
#   1. ECR repo (create-if-missing)
#   2. ARM64 image (buildx + push)
#   3. IAM execution role (create-if-missing, attach Bedrock + S3 + CloudWatch perms)
#   4. AgentCore Runtime registration (create-or-update via bedrock-agentcore-control)
#   5. Read-back from the registry to confirm DynamoDB persistence
#
# Re-run safely; each phase checks current state before writing.

set -euo pipefail

# --- config ---------------------------------------------------------------
: "${AWS_REGION:=us-east-1}"
: "${RUNTIME_NAME:=sample_agents_and_dragons}"           # [a-zA-Z][a-zA-Z0-9_]{0,47}
: "${ECR_REPO:=${RUNTIME_NAME}}"
# Tag = git SHA + timestamp suffix, so re-runs against an uncommitted working
# tree always produce a fresh tag (AgentCore caches manifest digests by tag-as-key
# when the digest happens to match across pushes — rare, but a stable tag means
# we'd never know).
: "${IMAGE_TAG:=$(git -C "$(dirname "$0")" rev-parse --short HEAD 2>/dev/null || echo nogit)-$(date -u +%Y%m%d%H%M%S)}"
: "${EXEC_ROLE_NAME:=BedrockAgentCoreExecRole-${RUNTIME_NAME}}"
: "${S3_BUCKET:=}"                                      # optional — used by writeResult tool

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"
IMAGE_URI="${ECR_URI}:${IMAGE_TAG}"

echo "==[ deploy.sh ]=================================================="
echo "  account:     ${ACCOUNT_ID}"
echo "  region:      ${AWS_REGION}"
echo "  runtime:     ${RUNTIME_NAME}"
echo "  image:       ${IMAGE_URI}"
echo "  exec role:   ${EXEC_ROLE_NAME}"
echo "================================================================="

cd "$(dirname "$0")"

# --- 1. ECR ---------------------------------------------------------------
echo "[1/5] Ensuring ECR repository '${ECR_REPO}'…"
aws ecr describe-repositories --repository-names "${ECR_REPO}" --region "${AWS_REGION}" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "${ECR_REPO}" --region "${AWS_REGION}" \
       --image-scanning-configuration scanOnPush=true >/dev/null
echo "      ${ECR_URI}"

# --- 2. Image -------------------------------------------------------------
echo "[2/5] Building & pushing ARM64 image…"
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
docker buildx inspect agentcore-builder >/dev/null 2>&1 \
  || docker buildx create --name agentcore-builder --use >/dev/null
docker buildx build \
  --builder agentcore-builder \
  --platform linux/arm64 \
  --tag "${IMAGE_URI}" \
  --push \
  .

# --- 3. IAM execution role ------------------------------------------------
echo "[3/5] Ensuring IAM execution role '${EXEC_ROLE_NAME}'…"
TRUST_DOC='{
  "Version":"2012-10-17",
  "Statement":[{
    "Effect":"Allow",
    "Principal":{"Service":"bedrock-agentcore.amazonaws.com"},
    "Action":"sts:AssumeRole"
  }]
}'
ECR_REPO_ARN="arn:aws:ecr:${AWS_REGION}:${ACCOUNT_ID}:repository/${ECR_REPO}"
INLINE_DOC=$(cat <<EOF
{
  "Version":"2012-10-17",
  "Statement":[
    {"Effect":"Allow","Action":["bedrock:InvokeModel","bedrock:InvokeModelWithResponseStream","bedrock:Converse","bedrock:ConverseStream"],"Resource":"*"},
    {"Effect":"Allow","Action":["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents","logs:DescribeLogStreams"],"Resource":"*"},
    {"Effect":"Allow","Action":"ecr:GetAuthorizationToken","Resource":"*"},
    {"Effect":"Allow","Action":["ecr:BatchGetImage","ecr:GetDownloadUrlForLayer"],"Resource":"${ECR_REPO_ARN}"},
    {"Effect":"Allow","Action":["s3:PutObject","s3:GetObject"],"Resource":"arn:aws:s3:::${S3_BUCKET:-not-configured}/apps/*"}
  ]
}
EOF
)
if ! aws iam get-role --role-name "${EXEC_ROLE_NAME}" >/dev/null 2>&1; then
  aws iam create-role --role-name "${EXEC_ROLE_NAME}" \
    --assume-role-policy-document "${TRUST_DOC}" \
    --description "Execution role for AgentCore runtime ${RUNTIME_NAME}" >/dev/null
  echo "      created role"
else
  echo "      role already exists, refreshing trust + inline policy"
  aws iam update-assume-role-policy --role-name "${EXEC_ROLE_NAME}" \
    --policy-document "${TRUST_DOC}" >/dev/null
fi
aws iam put-role-policy --role-name "${EXEC_ROLE_NAME}" \
  --policy-name "${RUNTIME_NAME}-inline" \
  --policy-document "${INLINE_DOC}" >/dev/null
EXEC_ROLE_ARN="$(aws iam get-role --role-name "${EXEC_ROLE_NAME}" --query 'Role.Arn' --output text)"
echo "      ${EXEC_ROLE_ARN}"

# IAM is eventually consistent — give the trust policy a moment to propagate.
sleep 8

# --- 4. AgentCore Runtime: create or update -------------------------------
echo "[4/5] Registering with AgentCore Runtime control plane…"
EXISTING_ID="$(aws bedrock-agentcore-control list-agent-runtimes --region "${AWS_REGION}" \
  --query "agentRuntimes[?agentRuntimeName=='${RUNTIME_NAME}'].agentRuntimeId | [0]" \
  --output text 2>/dev/null || true)"

ARTIFACT_JSON="{\"containerConfiguration\":{\"containerUri\":\"${IMAGE_URI}\"}}"
NETWORK_JSON='{"networkMode":"PUBLIC"}'

if [[ -z "${EXISTING_ID}" || "${EXISTING_ID}" == "None" ]]; then
  echo "      no existing runtime — creating"
  aws bedrock-agentcore-control create-agent-runtime --region "${AWS_REGION}" \
    --agent-runtime-name "${RUNTIME_NAME}" \
    --agent-runtime-artifact "${ARTIFACT_JSON}" \
    --network-configuration "${NETWORK_JSON}" \
    --role-arn "${EXEC_ROLE_ARN}" \
    --description "Sample Agents & Dragons — Spring AI patterns demo (mono / orchestrator / graph / swarm)" \
    > /tmp/agentcore-create.json
  EXISTING_ID="$(jq -r .agentRuntimeId /tmp/agentcore-create.json)"
else
  echo "      runtime ${EXISTING_ID} exists — updating with new image"
  aws bedrock-agentcore-control update-agent-runtime --region "${AWS_REGION}" \
    --agent-runtime-id "${EXISTING_ID}" \
    --agent-runtime-artifact "${ARTIFACT_JSON}" \
    --network-configuration "${NETWORK_JSON}" \
    --role-arn "${EXEC_ROLE_ARN}" \
    > /tmp/agentcore-update.json
fi
echo "      runtimeId=${EXISTING_ID}"

# --- 5. Read-back from the registry --------------------------------------
echo "[5/5] Confirming registration (reads from AgentCore's DynamoDB)…"
aws bedrock-agentcore-control get-agent-runtime --region "${AWS_REGION}" \
  --agent-runtime-id "${EXISTING_ID}" \
  --query '{name:agentRuntimeName,id:agentRuntimeId,status:status,version:agentRuntimeVersion,arn:agentRuntimeArn,image:agentRuntimeArtifact.containerConfiguration.containerUri}' \
  --output table

echo
echo "Done. Invoke with:"
echo "  aws bedrock-agentcore invoke-agent-runtime --agent-runtime-arn <arn> --payload fileb://samples/mono.json --content-type application/json /tmp/out.json"

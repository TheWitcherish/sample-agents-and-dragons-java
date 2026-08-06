import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import * as iam from 'aws-cdk-lib/aws-iam';
import { verifyOwner } from './functions/verify-owner/resource';
import { manageTasks } from './functions/manage-tasks/ressource';
import { invokeAgentRuntime } from './functions/invoke-agent-runtime/resource';
import { MCPGateway } from './agentcore/MCPGateway';
import { AgentCoreRuntimeRole } from './agentcore/AgentCoreRuntimeRole';

import { NonRegTestRole } from './agentcore/NonRegTestRole';

// Java AgentCore runtime is deployed out-of-band via backend/deploy.sh and is not
// owned by this CloudFormation stack. The frontend's AgentsPatternRuntime rows
// point at this ARN so the invokeAgentRuntime Lambda routes every pattern to the
// Java Spring AI runtime.
const JAVA_AGENT_RUNTIME_NAME = 'sample_agents_and_dragons';
const JAVA_AGENT_RUNTIME_ARN =
  'arn:aws:bedrock-agentcore:eu-central-1:307424506594:runtime/sample_agents_and_dragons-S3fSr9FXQK';

const backend = defineBackend({  
  auth,
  data,
  storage,
  verifyOwner,
  manageTasks,
  invokeAgentRuntime,
});

const { cfnUserPool } = backend.auth.resources.cfnResources;
cfnUserPool.addPropertyOverride('AdminCreateUserConfig.AllowAdminCreateUserOnly',true)

backend.auth.resources.groups["ADMINS"].role.addToPrincipalPolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: [
      'bedrock-agentcore:ListAgentRuntimes',
      'bedrock-agentcore:ListAgentRuntimeEndpoints'
    ],
    resources: ['*']
  })
)

//Grant authenticated users acces to lambda agentcore invocation function
backend.invokeAgentRuntime.resources.lambda.grantInvoke(backend.auth.resources.authenticatedUserIamRole)
backend.invokeAgentRuntime.resources.lambda.grantInvoke(backend.auth.resources.groups["ADMINS"].role)
backend.invokeAgentRuntime.resources.lambda.addToRolePolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: [
      "bedrock-agentcore:InvokeAgentRuntime"
    ],
    resources: [
      `arn:aws:bedrock-agentcore:${process.env.CDK_DEFAULT_REGION}:${process.env.CDK_DEFAULT_ACCOUNT}:runtime/*`,
      `arn:aws:bedrock-agentcore:${process.env.CDK_DEFAULT_REGION}:${process.env.CDK_DEFAULT_ACCOUNT}:runtime/*/runtime-endpoint/*`,
    ],
  })
)

const gatewayStack = backend.createStack("gatewayStack");

const mcpGateway = new MCPGateway(gatewayStack, 'MCPGateway', {
  artifactId: backend.stack.artifactId,
  userPoolId: backend.auth.resources.userPool.userPoolId,
  discoveryUrl: `https://cognito-idp.${process.env.CDK_DEFAULT_REGION}.amazonaws.com/${backend.auth.resources.userPool.userPoolId}/.well-known/openid-configuration`,
  userPoolClientId: backend.auth.resources.userPoolClient.userPoolClientId,
  lambdaFunctionArn: `${backend.manageTasks.resources.lambda.functionArn}:$LATEST`,
  description: "MCP Gateway for Agents and Dragons"
})

// IAM role available for any future AgentCore runtime managed by this stack.
// The Java runtime currently used by the frontend is deployed via backend/deploy.sh
// and brings its own execution role.
const agentCoreRuntimeRole = new AgentCoreRuntimeRole(gatewayStack, 'AgentCoreRuntimeRole', {agentName: 'agent', lambdaFunctionArn: backend.manageTasks.resources.lambda.functionArn});
backend.storage.resources.bucket.grantReadWrite(agentCoreRuntimeRole.runtimeRole);

// Non-regression test role (used by staging postBuild)
const nonRegTestRole = new NonRegTestRole(gatewayStack, 'NonRegTestRole', {
  invokeAgentRuntimeArn: backend.invokeAgentRuntime.resources.lambda.functionArn,
});

backend.addOutput({
  custom: {
    aws_region: process.env.CDK_DEFAULT_REGION,
    gatewayUrl: mcpGateway.gatewayUrl,
    // The Java AgentCore runtime uses the MCP gateway URL to publish telemetry
    // (save_agent_state etc.) via the manage-tasks Lambda target.
    useGatewayUrl: true,
    functionNames: {
      verifyOwner: backend.verifyOwner.resources.lambda.functionName,
      manageTasks: backend.manageTasks.resources.lambda.functionName,
      invokeAgentRuntime: backend.invokeAgentRuntime.resources.lambda.functionName,
    },
    agentCoreRuntimeRoleName: agentCoreRuntimeRole.runtimeRole.roleName,
    agentCoreRuntimeFunction: backend.invokeAgentRuntime.resources.lambda.functionName,
    // The runtime call defaults to the Lambda branch; readers should set
    // VITE_LOCAL_BACKEND_URL to point at the local Java backend during development,
    // or rely on the Java runtime ARN below (deployed via backend/deploy.sh) once
    // seeded into AgentsPatternRuntime.
    useAgentCoreRuntimeFunction: true,
    nonRegTestRoleArn: nonRegTestRole.role.roleArn,
    agentCoreRuntimeArn: JAVA_AGENT_RUNTIME_ARN,
    agentCoreRuntimeName: JAVA_AGENT_RUNTIME_NAME,
  },
});


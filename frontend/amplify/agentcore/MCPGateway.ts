import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as bedrockagentcore from 'aws-cdk-lib/aws-bedrockagentcore';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Amplify Gen 2 builds CDK code as ESM, so __dirname is undefined. Reconstruct it from
// the module URL so we can locate ../functions/manage-tasks/schema.json relative to here.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MCPGatewayProps {
  artifactId: string;
  userPoolId: string;
  discoveryUrl: string;
  userPoolClientId: string;
  lambdaFunctionArn: string;
  description?: string;
}

/**
 * Tool schema entry as authored in `manage-tasks/schema.json`. Mirrors the JSON Schema
 * subset CfnGatewayTarget understands.
 */
type ToolSchemaEntry = {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, { type: string; description?: string; items?: { type: string } }>;
    required?: string[];
  };
};

export class MCPGateway extends Construct {
  public readonly gateway: bedrockagentcore.CfnGateway;
  public readonly gatewayId: string;
  public readonly gatewayUrl: string;
  public readonly target: bedrockagentcore.CfnGatewayTarget;

  constructor(scope: Construct, id: string, props: MCPGatewayProps) {
    super(scope, id);

    let gatewayName = `gateway-${props.artifactId}`;
    if(gatewayName.length > 50) {
      gatewayName = gatewayName.substring(0, 50);
      console.log(`Gateway name is too long, it will be truncated to ${gatewayName}`);
    }

    //Create gateway role
    const gatewayArnPattern = `arn:aws:bedrock-agentcore:*:${process.env.CDK_DEFAULT_ACCOUNT}:gateway/${gatewayName}`;

    const gatewayRole = new iam.Role(this, 'GatewayLambdaRole', {
    assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com').withConditions({
        StringEquals: {
        'aws:SourceAccount': process.env.CDK_DEFAULT_ACCOUNT,
        },
        ArnLike: {
        'aws:SourceArn': `${gatewayArnPattern}-*`,
        },
    }),
    });

    gatewayRole.addToPolicy(
    new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
            "bedrock-agentcore:GetGateway",
        ],
        resources: [gatewayArnPattern],
        }));

    gatewayRole.addToPolicy(
    new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
            "lambda:InvokeFunction"
        ],
        resources: [props.lambdaFunctionArn],
        }));


    this.gateway = new bedrockagentcore.CfnGateway(this, 'Gateway', {
      name: gatewayName,
      description: props.description,
      authorizerType: 'CUSTOM_JWT',
      protocolType: 'MCP',
      roleArn: gatewayRole.roleArn,
      authorizerConfiguration: {
        customJwtAuthorizer: {
          discoveryUrl: props.discoveryUrl,
          allowedClients: [props.userPoolClientId]
        }
      }
    });

    this.gatewayId = this.gateway.attrGatewayIdentifier;
    this.gatewayUrl = this.gateway.attrGatewayUrl;

    // Register the manage-tasks Lambda as an MCP target. Schema is read from
    // manage-tasks/schema.json at synth time so the source of truth stays one file.
    // Tools are exposed under the prefix `${target.name}___<toolName>`.
    const schemaPath = path.join(__dirname, '..', 'functions', 'manage-tasks', 'schema.json');
    const rawSchema: ToolSchemaEntry[] = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

    const inlinePayload: bedrockagentcore.CfnGatewayTarget.ToolDefinitionProperty[] = rawSchema.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: toCfnSchema(tool.inputSchema),
    }));

    this.target = new bedrockagentcore.CfnGatewayTarget(this, 'ManageTasksTarget', {
      gatewayIdentifier: this.gateway.attrGatewayIdentifier,
      name: 'lambda',
      description: 'manage-tasks Lambda — task CRUD plus AgentRun/Message/Transition/Project telemetry',
      targetConfiguration: {
        mcp: {
          lambda: {
            lambdaArn: props.lambdaFunctionArn,
            toolSchema: { inlinePayload },
          },
        },
      },
      credentialProviderConfigurations: [{
        credentialProviderType: 'GATEWAY_IAM_ROLE',
      }],
    });

  }
}

/**
 * Recursively convert a JSON-schema fragment from `schema.json` into the shape
 * `CfnGatewayTarget.SchemaDefinitionProperty` expects. The CDK type accepts items,
 * properties, required, and type — same as JSON Schema, but property names match
 * the CFN binding rather than the spec.
 */
function toCfnSchema(node: {
  type: string;
  properties?: Record<string, { type: string; description?: string; items?: { type: string } }>;
  required?: string[];
  description?: string;
  items?: { type: string };
}): bedrockagentcore.CfnGatewayTarget.SchemaDefinitionProperty {
  const out: Writable<bedrockagentcore.CfnGatewayTarget.SchemaDefinitionProperty> = {
    type: node.type,
  };
  if (node.description) out.description = node.description;
  if (node.required && node.required.length > 0) out.required = node.required;
  if (node.items) out.items = toCfnSchema(node.items);
  if (node.properties) {
    out.properties = Object.fromEntries(
      Object.entries(node.properties).map(([k, v]) => [k, toCfnSchema(v)])
    );
  }
  return out;
}

type Writable<T> = { -readonly [P in keyof T]: T[P] };

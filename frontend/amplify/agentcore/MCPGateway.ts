import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as bedrockagentcore from 'aws-cdk-lib/aws-bedrockagentcore';

export interface MCPGatewayProps {
  artifactId: string;
  userPoolId: string;
  discoveryUrl: string;
  userPoolClientId: string;
  lambdaFunctionArn: string;
  description?: string;
}

export class MCPGateway extends Construct {
  public readonly gateway: bedrockagentcore.CfnGateway;
  public readonly gatewayId: string;
  public readonly gatewayUrl: string;

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

  }
}

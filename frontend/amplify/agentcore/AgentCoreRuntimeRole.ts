import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface AgentCoreRuntimeRoleProps {
  agentName: string;
  lambdaFunctionArn?: string;
}

export class AgentCoreRuntimeRole extends Construct {

  readonly runtimeRole: iam.Role;

  constructor(scope: Construct, id: string, props: AgentCoreRuntimeRoleProps) {
    super(scope, id);

    this.runtimeRole = new iam.Role(this, `${props.agentName}-RuntimeRole`, {
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com').withConditions({
          StringEquals: {
          'aws:SourceAccount': process.env.CDK_DEFAULT_ACCOUNT,
          },
      }),
    });
    
    this.runtimeRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ECRImageAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'ecr:BatchGetImage',
          'ecr:GetDownloadUrlForLayer'
        ],
        resources: [`arn:aws:ecr:${process.env.CDK_DEFAULT_REGION}:${process.env.CDK_DEFAULT_ACCOUNT}:repository/*`]
      })
    );

    this.runtimeRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:DescribeLogStreams',
          'logs:CreateLogGroup'
        ],
        resources: [`arn:aws:logs:${process.env.CDK_DEFAULT_REGION}:${process.env.CDK_DEFAULT_ACCOUNT}:log-group:/aws/bedrock-agentcore/runtimes/*`]
      })
    );

    this.runtimeRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:DescribeLogGroups'],
        resources: [`arn:aws:logs:${process.env.CDK_DEFAULT_REGION}:${process.env.CDK_DEFAULT_ACCOUNT}:log-group:*`]
      })
    );

    this.runtimeRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogStream',
          'logs:PutLogEvents'
        ],
        resources: [`arn:aws:logs:${process.env.CDK_DEFAULT_REGION}:${process.env.CDK_DEFAULT_ACCOUNT}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*`]
      })
    );

    // OTEL observability: allow AgentCore to deliver spans to /aws/spans/*
    this.runtimeRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'OtelSpanDelivery',
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: [
          `arn:aws:logs:${process.env.CDK_DEFAULT_REGION}:${process.env.CDK_DEFAULT_ACCOUNT}:log-group:/aws/spans/*`,
          `arn:aws:logs:${process.env.CDK_DEFAULT_REGION}:${process.env.CDK_DEFAULT_ACCOUNT}:log-group:/aws/spans/*:log-stream:*`,
        ]
      })
    );

    this.runtimeRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ECRTokenAccess',
        effect: iam.Effect.ALLOW,
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*']
      })
    );

    this.runtimeRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'xray:PutTraceSegments',
          'xray:PutTelemetryRecords', 
          'xray:GetSamplingRules',
          'xray:GetSamplingTargets'
        ],
        resources: ['*']
      })
    );

    this.runtimeRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'cloudwatch:namespace': 'bedrock-agentcore'
          }
        }
      })
    );

    this.runtimeRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'GetAgentAccessToken',
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock-agentcore:GetWorkloadAccessToken',
          'bedrock-agentcore:GetWorkloadAccessTokenForJWT',
          'bedrock-agentcore:GetWorkloadAccessTokenForUserId'
        ],
        resources: [
          `arn:aws:bedrock-agentcore:${process.env.CDK_DEFAULT_REGION}:${process.env.CDK_DEFAULT_ACCOUNT}:workload-identity-directory/default`,
          `arn:aws:bedrock-agentcore:${process.env.CDK_DEFAULT_REGION}:${process.env.CDK_DEFAULT_ACCOUNT}:workload-identity-directory/default/workload-identity/agentName-*`
        ]
      })
    );

    this.runtimeRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'BedrockModelInvocation',
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream'
        ],
        resources: [
          'arn:aws:bedrock:*::foundation-model/*',
          `arn:aws:bedrock:${process.env.CDK_DEFAULT_REGION}:${process.env.CDK_DEFAULT_ACCOUNT}:*`
        ]
      })
    );

    this.runtimeRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'BedrockGuardrailAccess',
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:ApplyGuardrail'],
        resources: [`arn:aws:bedrock:${process.env.CDK_DEFAULT_REGION}:${process.env.CDK_DEFAULT_ACCOUNT}:guardrail/*`]
      })
    );

    if (props.lambdaFunctionArn) {
      this.runtimeRole.addToPolicy(
        new iam.PolicyStatement({
          sid: 'LambdaInvocation',
          effect: iam.Effect.ALLOW,
          actions: ['lambda:InvokeFunction'],
          resources: [props.lambdaFunctionArn]
        })
      );
    }    

  }

}
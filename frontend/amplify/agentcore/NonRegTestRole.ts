import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface NonRegTestRoleProps {
  /** ARN of the invoke-agent-runtime Lambda function */
  invokeAgentRuntimeArn: string;
}

/**
 * IAM role assumed by the non-regression test script during staging builds.
 *
 * Grants:
 * - lambda:InvokeFunction on the invoke-agent-runtime Lambda
 * - dynamodb:GetItem / Query / Scan on Project-* and AgentsPatternRuntime-* tables
 * - dynamodb:ListTables for table name discovery
 */
export class NonRegTestRole extends Construct {
  public readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: NonRegTestRoleProps) {
    super(scope, id);

    const account = cdk.Stack.of(this).account;

    this.role = new iam.Role(this, 'Role', {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('amplify.amazonaws.com'),
        new iam.AccountRootPrincipal(),
      ),
      description: 'Role assumed by the non-regression test script in Amplify staging builds',
    });

    // Lambda invoke on invoke-agent-runtime
    this.role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['lambda:InvokeFunction'],
        resources: [props.invokeAgentRuntimeArn],
      }),
    );

    // DynamoDB read access for status polling
    this.role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:Scan'],
        resources: [
          `arn:aws:dynamodb:*:${account}:table/Project-*`,
          `arn:aws:dynamodb:*:${account}:table/AgentsPatternRuntime-*`,
        ],
      }),
    );

    // Table discovery
    this.role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:ListTables'],
        resources: ['*'],
      }),
    );
  }
}

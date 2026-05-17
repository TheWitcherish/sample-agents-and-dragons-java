import { Construct } from 'constructs';
import { aws_bedrockagentcore as bedrockagentcore } from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3assets from 'aws-cdk-lib/aws-s3-assets';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface AgentCoreRuntimeProps {
  artifactId: string;
  agentSourcePath: string;
  agentName: string;
  agentRoleArn: string;
  awsRegion: string;
}

export class AgentCoreRuntime extends Construct {

  public readonly runtime: bedrockagentcore.CfnRuntime;
  public readonly runtimeAsset: s3assets.Asset;

  constructor(scope: Construct, id: string, props: AgentCoreRuntimeProps) {
    super(scope, id);

    let agentName = `${props.agentName}-${props.artifactId}`.replaceAll('-','_');
    if(agentName.length > 45) {
      agentName = agentName.substring(0, 45);
      console.log(`Agent name is too long, it will be truncated to ${agentName}`);
    }

    const buildPath = path.join(props.agentSourcePath, 'build');
    
    // Create build directory
    if (fs.existsSync(buildPath)) {
      fs.rmSync(buildPath, { recursive: true, force: true });
    }
    fs.mkdirSync(buildPath, { recursive: true });
    
    // Copy files (equivalent to rsync --exclude='build')
    const copyRecursive = (src: string, dest: string) => {
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'build') continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          fs.mkdirSync(destPath, { recursive: true });
          copyRecursive(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    };
    copyRecursive(props.agentSourcePath, buildPath);
    
    // Install dependencies
    execSync(`uv pip install --python-platform aarch64-manylinux2014 --python-version 3.13 --target=${buildPath} --only-binary=:all: -r ${path.join(props.agentSourcePath, 'requirements.txt')}`);

    this.runtimeAsset = new s3assets.Asset(this, 'ZippedAgentRuntime', {
      path: props.agentSourcePath+"/build",
    });    


    this.runtime = new bedrockagentcore.CfnRuntime(this, `${props.agentName}-Runtime`, {
      agentRuntimeArtifact: {
        'codeConfiguration': {
            'code': {
                's3': {
                    'bucket': this.runtimeAsset.s3BucketName,
                    'prefix': this.runtimeAsset.s3ObjectKey
                }
            },
            'runtime': 'PYTHON_3_13',
            'entryPoint': ['opentelemetry-instrument', 'agent.py']
        },
      },
      agentRuntimeName: agentName,
      networkConfiguration: {
        networkMode: 'PUBLIC',
      },
      roleArn: props.agentRoleArn,
      environmentVariables: {
        "AWS_REGION": props.awsRegion,
        // OTEL auto-instrumentation via ADOT
        "AGENT_OBSERVABILITY_ENABLED": "true",
        "OTEL_PYTHON_DISTRO": "aws_distro",
        "OTEL_PYTHON_CONFIGURATOR": "aws_configurator",
        "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
        "OTEL_TRACES_SAMPLER": "always_on",
        "OTEL_RESOURCE_ATTRIBUTES": `service.name=${agentName}`,
        "OTEL_SEMCONV_STABILITY_OPT_IN": "gen_ai_latest_experimental,gen_ai_tool_definitions",
      }
    });

    // --- Vended trace delivery (TRACES → X-Ray → CloudWatch Transaction Search) ---
    // Required for sessions/traces to appear in GenAI Observability dashboard.
    const deliveryPrefix = agentName.substring(0, 48);

    const tracesSource = new logs.CfnDeliverySource(this, 'TracesDeliverySource', {
      name: `${deliveryPrefix}-traces-src`,
      logType: 'TRACES',
      resourceArn: this.runtime.attrAgentRuntimeArn,
    });

    const tracesDestination = new logs.CfnDeliveryDestination(this, 'TracesDeliveryDestination', {
      name: `${deliveryPrefix}-traces-dst`,
      deliveryDestinationType: 'XRAY',
    });

    const tracesDelivery = new logs.CfnDelivery(this, 'TracesDelivery', {
      deliverySourceName: tracesSource.name,
      deliveryDestinationArn: tracesDestination.attrArn,
    });
    tracesDelivery.addDependency(tracesSource);
    tracesDelivery.addDependency(tracesDestination);

  }

}
import { useState, useEffect, useCallback } from 'react';
import { BedrockAgentCoreControlClient, GetAgentRuntimeCommand } from '@aws-sdk/client-bedrock-agentcore-control';
import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from '@aws-sdk/client-bedrock-agentcore';
import { fetchAuthSession } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import type { AgentRuntime, Project, ProjectRequestPayload } from '../types';
import outputs from '../../amplify_outputs.json';
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

export const useAgentRuntime = (agentRuntimeId?: string) => {
  const [agentRuntime, setAgentRuntime] = useState<AgentRuntime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentRuntimeId) {
      setLoading(false);
      return;
    }

    const fetchAgentRuntime = async () => {
      try {
        setLoading(true);
        setError(null);

        const session = await fetchAuthSession();
        const credentials = session.credentials;

        if (!credentials) {
          throw new Error('No AWS credentials available');
        }

        const client = new BedrockAgentCoreControlClient({
          region: outputs.custom.aws_region,
          credentials: {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            sessionToken: credentials.sessionToken,
          },
        });

        const command = new GetAgentRuntimeCommand({
          agentRuntimeId,
        });

        const response = await client.send(command);
        if (response.agentRuntimeId) {
          // Map the response to our AgentRuntime type
          const agentRuntime: AgentRuntime = {
            agentRuntimeArn: response.agentRuntimeArn || '',
            agentRuntimeId: response.agentRuntimeId,
            agentRuntimeName: response.agentRuntimeName || '',
            agentRuntimeVersion: response.agentRuntimeVersion || '',
            description: response.description,
            lastUpdatedAt: response.lastUpdatedAt || new Date(),
            status: response.status || 'UNKNOWN',
          };
          setAgentRuntime(agentRuntime);
        } else {
          setAgentRuntime(null);
        }
      } catch (err) {
        console.error('Failed to fetch agent runtime:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch agent runtime');
      } finally {
        setLoading(false);
      }
    };

    fetchAgentRuntime();
  }, [agentRuntimeId]);

  const invokeAgentRuntime = useCallback(async (project: Project) => {
    try {
      const dataClient = generateClient<Schema>();

      // Helper: load each AgentDefinition from DynamoDB (used by every runtime branch).
      const loadAgents = async () => {
        const data = await Promise.all(
          project.agents.map(async (agentId) => {
            const { data: agent } = await dataClient.models.Agent.get({ id: agentId }, { authMode: 'userPool' });
            if (!agent) return null;
            return {
              id: agent.id,
              name: `${agent.name} [${agent.role}]`,
              model: agent.model,
              prompt: agent.prompt,
              role: agent.role,
              tools: agent.tools || []
            };
          })
        );
        return data.filter(a => a !== null);
      };

      // ─── Local Java backend (sample-agents-and-dragons) ─────────────────────
      // Set VITE_LOCAL_BACKEND_URL=http://localhost:8080 to skip the deployed
      // AgentCore Runtime entirely and POST the payload to the Spring Boot app.
      const localBackendUrl = import.meta.env.VITE_LOCAL_BACKEND_URL;
      if (localBackendUrl) {
        console.debug("invokeAgentRuntime via local Java backend at", localBackendUrl);
        const localAgents = await loadAgents();
        const localPayload: ProjectRequestPayload = {
          project: {
            id: project.id,
            questId: project.questId || '',
            name: project.name,
            prompt: project.prompt
          },
          team: {
            name: project.teamName || project.name,
            prompt: project.teamPrompt || '',
            pattern: project.teamPattern,
            entrypoint: project.teamEntrypoint,
            agents: localAgents,
            connections: project.agentsConnections,
          },
          config: { gateway_url: '', token: '', s3_bucket_name: '' }
        };
        const response = await fetch(`${localBackendUrl}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(localPayload),
        });
        if (!response.ok) {
          throw new Error(`Local backend ${localBackendUrl} returned HTTP ${response.status}: ${await response.text()}`);
        }
        const body = await response.json();
        // Persist sessionId-equivalent so the UI knows the run started
        await dataClient.models.Project.update({
          id: project.id,
          sessionId: `local-${Date.now()}`,
          status: body.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
          url: body.finalAnswer || '',
        } as Parameters<typeof dataClient.models.Project.update>[0], { authMode: 'userPool' });
        return {
          success: body.status === 'COMPLETED',
          response: body,
          pattern: project.teamPattern,
        };
      }

      // ─── Deployed Amplify path (original behaviour) ─────────────────────────
      // Get agent runtime ARN from AgentsPatternRuntime
      const { data: patternRuntimes, errors } = await dataClient.models.AgentsPatternRuntime.list({
        filter: { agentsPattern: { eq: project.teamPattern } },
        authMode: 'userPool'
      });

      if (errors) {
        console.log(`Failed to fetch pattern runtimes: ${errors}`);
      }

      if (!patternRuntimes || patternRuntimes.length === 0) {
        throw new Error(`No runtime ARN configured for pattern: ${project.teamPattern}`);
      }

      const agentRuntimeArn = patternRuntimes[0].runtimeArn;

      // Get MCP gateway URL
      const mcpGatewayUrl = outputs.custom.useGatewayUrl ? outputs.custom.gatewayUrl : outputs.custom.functionNames.manageTasks;
      console.debug("mcpGatewayUrl", mcpGatewayUrl);
      const session = await fetchAuthSession();
      const credentials = session.credentials;
      const accessToken = session.tokens?.accessToken?.toString();

      if (!credentials) {
        throw new Error('No AWS credentials available');
      }


      // Load agents from database
      const agents = await loadAgents();

      const runtimePayloadData: ProjectRequestPayload = {
        project: {
          id: project.id,
          questId: project.questId || '',
          name: project.name,
          prompt: project.prompt
        },
        team: {
          name: project.teamName || project.name,
          prompt: project.teamPrompt || '',
          pattern: project.teamPattern,
          entrypoint: project.teamEntrypoint,
          agents,
          connections: project.agentsConnections,
        },
        config: {
          gateway_url: mcpGatewayUrl,
          token: accessToken,
          s3_bucket_name: outputs.storage.bucket_name,
        }
      };

      console.debug("runtimePayloadData",runtimePayloadData);

      if (outputs.custom.useAgentCoreRuntimeFunction) {

        const client = new LambdaClient({
          region: outputs.custom.aws_region,
          credentials,
        });

        const command = new InvokeCommand({
          FunctionName: outputs.custom.agentCoreRuntimeFunction,
          Payload: JSON.stringify({
            payload: runtimePayloadData}),
          InvocationType: 'Event'
        });

        const response = await client.send(command);

        return {
          success: true,
          response: response,
          pattern: project.teamPattern
        };
      }
      else {

        const client = new BedrockAgentCoreClient({
          region: outputs.custom.aws_region,
          credentials,
        });

        const command = new InvokeAgentRuntimeCommand({
          agentRuntimeArn,
          payload: JSON.stringify(runtimePayloadData),
          qualifier: 'DEFAULT'
        });

        const response = await client.send(command);

        console.debug("invokeAgentRuntime response", response);

        const responseSessionId = response.runtimeSessionId;
        
        // Store sessionId without changing status - runtime will set IN_PROGRESS
        await dataClient.models.Project.update({
          id: project.id,
          sessionId: responseSessionId,
        } as Parameters<typeof dataClient.models.Project.update>[0], { authMode: 'userPool' });
        
        if (response.response) {
          const responseBody = await response.response.transformToString();
          return {
            success: responseSessionId?true:false,
            sessionId: responseSessionId,
            response: responseBody,
            pattern: project.teamPattern
          };
        }
        
        return {
          success: responseSessionId?true:false,
          sessionId: responseSessionId,
          pattern: project.teamPattern
        };
      }
    } catch (err) {
      console.error('Failed to invoke agent runtime:', err);
      throw err;
    }
  }, []);

  return { agentRuntime, loading, error, invokeAgentRuntime };
};

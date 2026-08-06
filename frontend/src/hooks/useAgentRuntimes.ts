import { useState, useEffect } from 'react';
import { BedrockAgentCoreControlClient, ListAgentRuntimesCommand } from '@aws-sdk/client-bedrock-agentcore-control';
import { fetchAuthSession } from 'aws-amplify/auth';
import outputs from '../../amplify_outputs.json';
import type { AgentRuntime } from '../types';

export const useAgentRuntimes = () => {
  const [agentRuntimes, setAgentRuntimes] = useState<AgentRuntime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAgentRuntimes = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get AWS credentials from Amplify
        const session = await fetchAuthSession();
        const credentials = session.credentials;

        if (!credentials) {
          throw new Error('No AWS credentials available');
        }

        // Use the same region the rest of the deployment runs in. The runtime ARN we
        // care about is regional, so listing in the wrong region returns zero items
        // (silent failure). custom.aws_region is set by amplify/backend.ts at deploy
        // time; default falls back to AppSync's region only if missing.
        const region: string =
          (outputs as { custom?: { aws_region?: string } }).custom?.aws_region
          ?? outputs.data.aws_region;

        // Create Bedrock AgentCore Control client
        const client = new BedrockAgentCoreControlClient({
          region,
          credentials: {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            sessionToken: credentials.sessionToken,
          },
        });

        // List agent runtimes
        const command = new ListAgentRuntimesCommand({
          maxResults: 50,
        });

        const response = await client.send(command);
        setAgentRuntimes(response.agentRuntimes || []);
      } catch (err) {
        console.error('Failed to fetch agent runtimes:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch agent runtimes');
      } finally {
        setLoading(false);
      }
    };

    fetchAgentRuntimes();
  }, []);

  return { agentRuntimes, loading, error };
};
import { useState, useEffect } from 'react';
import { BedrockAgentCoreControlClient, ListAgentRuntimesCommand } from '@aws-sdk/client-bedrock-agentcore-control';
import { fetchAuthSession } from 'aws-amplify/auth';
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

        // Create Bedrock AgentCore Control client
        const client = new BedrockAgentCoreControlClient({
          region: 'us-east-1', // AgentCore is typically in us-east-1
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
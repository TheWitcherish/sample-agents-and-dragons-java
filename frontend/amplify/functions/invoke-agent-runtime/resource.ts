import { defineFunction } from '@aws-amplify/backend';

export const invokeAgentRuntime = defineFunction({
  name: 'invoke-agent-runtime',
  timeoutSeconds: 900,
});
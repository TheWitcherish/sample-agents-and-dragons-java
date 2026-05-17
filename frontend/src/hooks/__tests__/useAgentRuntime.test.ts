import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAgentRuntime } from '../useAgentRuntime';
import type { Project } from '../../types';

// Mock amplify_outputs.json
vi.mock('../../../amplify_outputs.json', () => ({
  default: {
    custom: {
      aws_region: 'us-east-1',
      useGatewayUrl: false,
      gatewayUrl: 'https://gateway.example.com',
      functionNames: { manageTasks: 'manage-tasks-fn' },
      useAgentCoreRuntimeFunction: true,
      agentCoreRuntimeFunction: 'invoke-agent-fn',
    },
    storage: {
      bucket_name: 'test-bucket',
    },
  },
}));

// Mock AWS SDK clients
const mockControlClientSend = vi.fn();
vi.mock('@aws-sdk/client-bedrock-agentcore-control', () => ({
  BedrockAgentCoreControlClient: vi.fn(() => ({
    send: mockControlClientSend,
  })),
  GetAgentRuntimeCommand: vi.fn((input) => input),
}));

const mockBedrockClientSend = vi.fn();
vi.mock('@aws-sdk/client-bedrock-agentcore', () => ({
  BedrockAgentCoreClient: vi.fn(() => ({
    send: mockBedrockClientSend,
  })),
  InvokeAgentRuntimeCommand: vi.fn((input) => input),
}));

const mockLambdaSend = vi.fn();
vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: vi.fn(() => ({
    send: mockLambdaSend,
  })),
  InvokeCommand: vi.fn((input) => input),
}));

// Mock Amplify auth
vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn(() =>
    Promise.resolve({
      credentials: {
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        sessionToken: 'test-token',
      },
      tokens: {
        accessToken: { toString: () => 'mock-access-token' },
      },
    })
  ),
}));

// Mock Amplify data client
const mockAgentGet = vi.fn();
const mockPatternRuntimeList = vi.fn();
const mockProjectUpdate = vi.fn();

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(() => ({
    models: {
      Agent: { get: mockAgentGet },
      AgentsPatternRuntime: { list: mockPatternRuntimeList },
      Project: { update: mockProjectUpdate },
    },
  })),
}));

describe('useAgentRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- useEffect: fetch agent runtime metadata ---

  describe('fetch agent runtime', () => {
    it('sets loading false immediately when no agentRuntimeId', async () => {
      const { result } = renderHook(() => useAgentRuntime());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      expect(result.current.agentRuntime).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('fetches and sets agent runtime on success', async () => {
      mockControlClientSend.mockResolvedValue({
        agentRuntimeArn: 'arn:aws:bedrock:us-east-1:123:runtime/test',
        agentRuntimeId: 'rt-123',
        agentRuntimeName: 'Test Runtime',
        agentRuntimeVersion: '1.0',
        description: 'Test',
        lastUpdatedAt: new Date('2024-01-01'),
        status: 'ACTIVE',
      });

      const { result } = renderHook(() => useAgentRuntime('rt-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.agentRuntime).toEqual({
        agentRuntimeArn: 'arn:aws:bedrock:us-east-1:123:runtime/test',
        agentRuntimeId: 'rt-123',
        agentRuntimeName: 'Test Runtime',
        agentRuntimeVersion: '1.0',
        description: 'Test',
        lastUpdatedAt: new Date('2024-01-01'),
        status: 'ACTIVE',
      });
      expect(result.current.error).toBeNull();
    });

    it('sets agentRuntime to null when response has no agentRuntimeId', async () => {
      mockControlClientSend.mockResolvedValue({});

      const { result } = renderHook(() => useAgentRuntime('rt-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      expect(result.current.agentRuntime).toBeNull();
    });

    it('sets error on fetch failure', async () => {
      mockControlClientSend.mockRejectedValue(new Error('Access denied'));

      const { result } = renderHook(() => useAgentRuntime('rt-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      expect(result.current.error).toBe('Access denied');
      expect(result.current.agentRuntime).toBeNull();
    });

    it('sets generic error message for non-Error throws', async () => {
      mockControlClientSend.mockRejectedValue('something went wrong');

      const { result } = renderHook(() => useAgentRuntime('rt-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      expect(result.current.error).toBe('Failed to fetch agent runtime');
    });
  });

  // --- invokeAgentRuntime ---

  describe('invokeAgentRuntime', () => {
    const mockProject: Project = {
      id: 'proj-1',
      name: 'Test Project',
      prompt: 'Build something',
      teamPattern: 'mono',
      teamEntrypoint: 'agent-1',
      teamName: 'Test Team',
      teamPrompt: 'Team prompt',
      ownerKey: 'owner-1',
      questId: 'quest-1',
      agents: ['agent-1'],
      agentsConnections: [],
      status: 'CREATED',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    beforeEach(() => {
      mockPatternRuntimeList.mockResolvedValue({
        data: [{ agentsPattern: 'mono', runtimeName: 'mono-rt', runtimeArn: 'arn:runtime/mono' }],
      });
      mockAgentGet.mockResolvedValue({
        data: {
          id: 'agent-1',
          name: 'Agent One',
          model: 'claude-3-haiku',
          prompt: 'Be helpful',
          role: 'coder',
          tools: ['code_interpreter'],
        },
      });
      mockProjectUpdate.mockResolvedValue({ data: { id: 'proj-1' } });
    });

    it('invokes via Lambda when useAgentCoreRuntimeFunction is true', async () => {
      mockLambdaSend.mockResolvedValue({ StatusCode: 202 });

      const { result } = renderHook(() => useAgentRuntime());

      await waitFor(() => expect(result.current.loading).toBe(false));

      const response = await result.current.invokeAgentRuntime(mockProject);

      expect(mockLambdaSend).toHaveBeenCalled();
      expect(response.success).toBe(true);
      expect(response.pattern).toBe('mono');
      // Lambda path does not call Project.update — status is managed by the runtime itself
      expect(mockProjectUpdate).not.toHaveBeenCalled();
    });

    it('throws when no pattern runtime found', async () => {
      mockPatternRuntimeList.mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useAgentRuntime());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(result.current.invokeAgentRuntime(mockProject)).rejects.toThrow(
        'No runtime ARN configured for pattern: mono'
      );
    });

    it('throws when credentials are missing', async () => {
      const { fetchAuthSession } = await import('aws-amplify/auth');
      vi.mocked(fetchAuthSession).mockResolvedValueOnce({
        credentials: undefined,
        tokens: undefined,
      } as never);

      const { result } = renderHook(() => useAgentRuntime());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(result.current.invokeAgentRuntime(mockProject)).rejects.toThrow(
        'No AWS credentials available'
      );
    });

    it('filters out null agents from database lookup', async () => {
      const projectWithMultipleAgents = {
        ...mockProject,
        agents: ['agent-1', 'missing-agent'],
      };

      mockAgentGet
        .mockResolvedValueOnce({
          data: { id: 'agent-1', name: 'Agent One', model: 'claude-3-haiku', prompt: 'Be helpful', role: 'coder', tools: [] },
        })
        .mockResolvedValueOnce({ data: null });

      mockLambdaSend.mockResolvedValue({ StatusCode: 202 });

      const { result } = renderHook(() => useAgentRuntime());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const response = await result.current.invokeAgentRuntime(projectWithMultipleAgents);
      expect(response.success).toBe(true);
      // Lambda was called with payload containing only 1 agent (null filtered out)
      expect(mockLambdaSend).toHaveBeenCalled();
    });
  });
});

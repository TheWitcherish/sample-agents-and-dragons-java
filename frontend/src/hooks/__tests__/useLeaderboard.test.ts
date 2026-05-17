import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useLeaderboard } from '../useLeaderboard';

// vi.hoisted ensures these are available when vi.mock factories run (hoisted above imports)
const { mockProcessProjects, mockAgents, projectUnsubscribe, agentRunUnsubscribe, getCallbacks } = vi.hoisted(() => {
  const callbacks = {
    project: null as { next: (data: unknown) => void } | null,
    agentRun: null as { next: (data: unknown) => void } | null,
  };
  return {
    mockProcessProjects: vi.fn(),
    mockAgents: [{ id: 'a1', name: 'Agent 1' }],
    projectUnsubscribe: vi.fn(),
    agentRunUnsubscribe: vi.fn(),
    getCallbacks: () => callbacks,
  };
});

vi.mock('../../utils/leaderboardScoring', () => ({
  processProjects: (...args: unknown[]) => mockProcessProjects(...args),
}));

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(() => ({
    models: {
      Project: {
        observeQuery: vi.fn(() => ({
          subscribe: vi.fn((cb) => {
            getCallbacks().project = cb;
            return { unsubscribe: projectUnsubscribe };
          }),
        })),
      },
      AgentRun: {
        observeQuery: vi.fn(() => ({
          subscribe: vi.fn((cb) => {
            getCallbacks().agentRun = cb;
            return { unsubscribe: agentRunUnsubscribe };
          }),
        })),
      },
      Agent: {
        list: vi.fn().mockResolvedValue({ data: mockAgents }),
      },
    },
  })),
}));

describe('useLeaderboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessProjects.mockResolvedValue({ top: [], live: [] });
  });

  it('starts in loading state', () => {
    const { result } = renderHook(() => useLeaderboard(null, null));
    expect(result.current.loading).toBe(true);
    expect(result.current.topProjects).toEqual([]);
    expect(result.current.liveRuns).toEqual([]);
  });

  it('sets loading to false when projects are synced', async () => {
    const { result } = renderHook(() => useLeaderboard(null, null));

    // Simulate subscription emitting synced data
    act(() => {
      getCallbacks().project!.next({ items: [], isSynced: true });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('calls processProjects when projects and runs arrive', async () => {
    const mockProjects = [{ id: 'p1', name: 'Project 1', status: 'COMPLETED' }];
    const mockRuns = [{ projectId: 'p1', agentId: 'a1' }];
    const mockTop = [{ projectId: 'p1', score: 5000, rank: 1 }];
    const mockLive = [{ projectId: 'p1', status: 'COMPLETED' }];

    mockProcessProjects.mockResolvedValue({ top: mockTop, live: mockLive });

    const { result } = renderHook(() => useLeaderboard(null, null));

    // Emit project and run data
    act(() => {
      getCallbacks().project!.next({ items: mockProjects, isSynced: true });
      getCallbacks().agentRun!.next({ items: mockRuns });
    });

    await waitFor(() => {
      expect(mockProcessProjects).toHaveBeenCalledWith(mockProjects, mockRuns, mockAgents);
    });

    await waitFor(() => {
      expect(result.current.topProjects).toEqual(mockTop);
      expect(result.current.liveRuns).toEqual(mockLive);
    });
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useLeaderboard(null, null));
    unmount();
    expect(projectUnsubscribe).toHaveBeenCalled();
    expect(agentRunUnsubscribe).toHaveBeenCalled();
  });

  it('resubscribes when date range changes', () => {
    const { rerender } = renderHook(
      ({ from, to }) => useLeaderboard(from, to),
      { initialProps: { from: null as Date | null, to: null as Date | null } }
    );

    // First render creates subscriptions
    expect(projectUnsubscribe).not.toHaveBeenCalled();

    // Change dates triggers re-subscription
    rerender({
      from: new Date('2024-01-01'),
      to: new Date('2024-02-01'),
    });

    expect(projectUnsubscribe).toHaveBeenCalledTimes(1);
    expect(agentRunUnsubscribe).toHaveBeenCalledTimes(1);
  });
});

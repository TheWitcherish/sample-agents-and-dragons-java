import { describe, it, expect } from 'vitest';
import {
  calculateScore,
  calculateExecutionTime,
  sumTokens,
  filterByDateRange,
  formatTime
} from '../leaderboardScoring';
import type { Schema } from '../../../amplify/data/resource';

type Agent = Schema['Agent']['type'];

// Helpers to build test data
const makeAgent = (id: string, frugality = 50, precision = 50) => ({
  id,
  name: `Agent ${id}`,
  prompt: '',
  model: 'claude-3-haiku',
  tools: null,
  compatiblePatterns: ['mono'],
  cost: 1,
  frugality,
  precision,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
} as unknown as Agent);

const makeAgentRun = (
  agentId: string,
  totalTokens: number,
  createdAt = '2024-01-01T00:00:00Z'
) => ({
  agentId,
  agentName: `Agent ${agentId}`,
  state: [{ totalTokens, createdAt }],
});

// --- calculateExecutionTime ---

describe('calculateExecutionTime', () => {
  it('returns 0 for empty runs', () => {
    expect(calculateExecutionTime([])).toBe(0);
  });

  it('returns 0 when runs have no state', () => {
    expect(calculateExecutionTime([{ agentId: 'a', state: [] }])).toBe(0);
  });

  it('calculates duration between earliest and latest timestamps', () => {
    const runs = [
      {
        agentId: 'a',
        state: [
          { totalTokens: 100, createdAt: '2024-01-01T00:00:00Z' },
          { totalTokens: 200, createdAt: '2024-01-01T00:01:00Z' },
        ],
      },
      {
        agentId: 'b',
        state: [
          { totalTokens: 150, createdAt: '2024-01-01T00:00:30Z' },
          { totalTokens: 300, createdAt: '2024-01-01T00:02:00Z' },
        ],
      },
    ];
    // 2 minutes = 120 seconds
    expect(calculateExecutionTime(runs)).toBe(120);
  });

  it('returns 0 when all timestamps are the same', () => {
    const runs = [
      makeAgentRun('a', 100, '2024-01-01T00:00:00Z'),
      makeAgentRun('b', 200, '2024-01-01T00:00:00Z'),
    ];
    expect(calculateExecutionTime(runs)).toBe(0);
  });
});

// --- sumTokens ---

describe('sumTokens', () => {
  it('returns 0 for empty runs', () => {
    expect(sumTokens([])).toBe(0);
  });

  it('returns 0 when runs have no state', () => {
    expect(sumTokens([{ agentId: 'a', state: [] }])).toBe(0);
  });

  it('sums the last state totalTokens from each run', () => {
    const runs = [
      {
        agentId: 'a',
        state: [
          { totalTokens: 100, createdAt: '2024-01-01T00:00:00Z' },
          { totalTokens: 500, createdAt: '2024-01-01T00:01:00Z' },
        ],
      },
      makeAgentRun('b', 300),
    ];
    // Last state of run a = 500, run b = 300
    expect(sumTokens(runs)).toBe(800);
  });

  it('handles null state gracefully', () => {
    const runs = [{ agentId: 'a', state: null }];
    expect(sumTokens(runs)).toBe(0);
  });
});

// --- calculateScore ---

describe('calculateScore', () => {
  const agents = [
    makeAgent('a1', 50, 60),  // frugality 50 → costMultiplier = 2.0
    makeAgent('a2', 100, 40), // frugality 100 → costMultiplier = 1.0
  ];

  it('returns only completion bonus when there are no agent runs', () => {
    const result = calculateScore({ questCompleted: true, teamPattern: 'mono' }, [], agents);
    expect(result.total).toBe(1500); // only completion bonus
    expect(result.breakdown.tokenEfficiency).toBe(0);
    expect(result.breakdown.executionSpeed).toBe(0);
    expect(result.breakdown.teamOptimization).toBe(0);
    expect(result.breakdown.completionBonus).toBe(1500);
  });

  it('returns zero total when no runs and quest not completed', () => {
    const result = calculateScore({ questCompleted: false, teamPattern: 'mono' }, [], agents);
    expect(result.total).toBe(0);
  });

  it('gives completion bonus when quest is completed', () => {
    const result = calculateScore(
      { questCompleted: true, teamPattern: 'mono' },
      [makeAgentRun('a1', 1000)],
      agents
    );
    expect(result.breakdown.completionBonus).toBe(1500);
  });

  it('gives no completion bonus when quest is not completed', () => {
    const result = calculateScore(
      { questCompleted: false, teamPattern: 'mono' },
      [makeAgentRun('a1', 1000)],
      agents
    );
    expect(result.breakdown.completionBonus).toBe(0);
  });

  it('applies 90% token penalty when quest not completed', () => {
    const completed = calculateScore(
      { questCompleted: true, teamPattern: 'mono' },
      [makeAgentRun('a1', 1000)],
      agents
    );
    const incomplete = calculateScore(
      { questCompleted: false, teamPattern: 'mono' },
      [makeAgentRun('a1', 1000)],
      agents
    );
    expect(incomplete.breakdown.tokenEfficiency).toBe(
      Math.round(completed.breakdown.tokenEfficiency * 0.1)
    );
  });

  it('applies pattern multiplier to team score', () => {
    // graph has multiplier 1.2, mono has 0.8
    const graphResult = calculateScore(
      { questCompleted: true, teamPattern: 'graph' },
      [makeAgentRun('a1', 1000)],
      agents
    );
    const monoResult = calculateScore(
      { questCompleted: true, teamPattern: 'mono' },
      [makeAgentRun('a1', 1000)],
      agents
    );
    expect(graphResult.breakdown.teamOptimization).toBeGreaterThan(
      monoResult.breakdown.teamOptimization
    );
  });

  it('weighs token cost by agent frugality', () => {
    // a1 has frugality 50 → multiplier 2.0, a2 has frugality 100 → multiplier 1.0
    // Same tokens but different cost
    const resultA1 = calculateScore(
      { questCompleted: true, teamPattern: 'mono' },
      [makeAgentRun('a1', 5000)],
      agents
    );
    const resultA2 = calculateScore(
      { questCompleted: true, teamPattern: 'mono' },
      [makeAgentRun('a2', 5000)],
      agents
    );
    // a2 (more frugal) should have higher token efficiency
    expect(resultA2.breakdown.tokenEfficiency).toBeGreaterThan(
      resultA1.breakdown.tokenEfficiency
    );
  });

  it('caps token efficiency at minimum 200 with runs', () => {
    // Huge token count to push score down
    const result = calculateScore(
      { questCompleted: true, teamPattern: 'mono' },
      [makeAgentRun('a1', 10000000)],
      agents
    );
    expect(result.breakdown.tokenEfficiency).toBe(200);
  });

  it('caps team optimization at 1000', () => {
    // Create agents with very high precision
    const highPrecisionAgents = Array.from({ length: 5 }, (_, i) =>
      makeAgent(`hp${i}`, 50, 100)
    );
    const runs = highPrecisionAgents.map(a => makeAgentRun(a.id, 100));
    const result = calculateScore(
      { questCompleted: true, teamPattern: 'graph' },
      runs,
      highPrecisionAgents
    );
    expect(result.breakdown.teamOptimization).toBeLessThanOrEqual(1000);
  });

  it('speed score is 0 when execution time is 0', () => {
    // Single state entry → no time difference
    const result = calculateScore(
      { questCompleted: true, teamPattern: 'mono' },
      [makeAgentRun('a1', 100)],
      agents
    );
    expect(result.breakdown.executionSpeed).toBe(0);
  });

  it('total equals sum of all breakdown components', () => {
    const result = calculateScore(
      { questCompleted: true, teamPattern: 'hierarchical' },
      [makeAgentRun('a1', 2000), makeAgentRun('a2', 1500)],
      agents
    );
    const { tokenEfficiency, executionSpeed, teamOptimization, completionBonus } = result.breakdown;
    expect(result.total).toBe(tokenEfficiency + executionSpeed + teamOptimization + completionBonus);
  });
});

// --- filterByDateRange ---

describe('filterByDateRange', () => {
  const projects = [
    { createdAt: '2024-01-15T00:00:00Z' },
    { createdAt: '2024-02-15T00:00:00Z' },
    { createdAt: '2024-03-15T00:00:00Z' },
    { createdAt: undefined },
  ] as Array<{ createdAt?: string; [key: string]: unknown }>;

  it('returns all projects with dates when no range specified', () => {
    const result = filterByDateRange(projects as never[], null, null);
    expect(result).toHaveLength(3); // excludes undefined createdAt
  });

  it('filters by fromDate', () => {
    const result = filterByDateRange(
      projects as never[],
      new Date('2024-02-01T00:00:00Z'),
      null
    );
    expect(result).toHaveLength(2);
  });

  it('filters by toDate', () => {
    const result = filterByDateRange(
      projects as never[],
      null,
      new Date('2024-02-28T00:00:00Z')
    );
    expect(result).toHaveLength(2);
  });

  it('filters by both fromDate and toDate', () => {
    const result = filterByDateRange(
      projects as never[],
      new Date('2024-01-20T00:00:00Z'),
      new Date('2024-03-01T00:00:00Z')
    );
    expect(result).toHaveLength(1);
  });

  it('excludes projects without createdAt', () => {
    const result = filterByDateRange(projects as never[], null, null);
    expect(result.every((p: { createdAt?: string }) => p.createdAt !== undefined)).toBe(true);
  });
});

// --- formatTime ---

describe('formatTime', () => {
  it('formats 0 seconds', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('formats seconds under a minute', () => {
    expect(formatTime(45)).toBe('0:45');
  });

  it('formats exact minutes', () => {
    expect(formatTime(120)).toBe('2:00');
  });

  it('formats minutes and seconds', () => {
    expect(formatTime(195)).toBe('3:15');
  });

  it('pads single-digit seconds', () => {
    expect(formatTime(62)).toBe('1:02');
  });
});

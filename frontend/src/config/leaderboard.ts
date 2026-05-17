export const LEADERBOARD_CONFIG = {
  useMockData: false,
  topEntriesCount: 10,
  liveRunsCount: 4,
  autoSwitchInterval: 20000,
  scoringWeights: {
    tokenEfficiency: 0.25,
    executionSpeed: 0.15,
    teamOptimization: 0.10,
    completionBonus: 0.50
  }
};

export const PATTERN_MULTIPLIERS = {
  mono: 0.8,
  hierarchical: 1.0,
  swarm: 1.1,
  graph: 1.2
};

export interface LeaderboardEntry {
  rank: number;
  projectId: string;
  projectName: string;
  logoColor: string;
  score: number;
  executionTime: number;
  totalTokens: number;
  agentCount: number;
  teamPattern: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'CREATED' | 'ABORTED' | 'ON_ERROR';
  lastUpdate: string;
  scoreBreakdown: ScoreBreakdown;
  questCompleted: boolean;
}

export interface ScoreBreakdown {
  tokenEfficiency: number;
  executionSpeed: number;
  teamOptimization: number;
  completionBonus: number;
}

export interface LiveRun {
  projectId: string;
  projectName: string;
  logoColor: string;
  currentTime: number;
  startTime: string;
  currentAgent: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'CREATED' | 'ABORTED' | 'ON_ERROR';
  score: number;
  rank: number | null;
  lastUpdate: string;
}

export interface ScoringWeights {
  tokenEfficiency: number;
  executionSpeed: number;
  teamOptimization: number;
  completionBonus: number;
}

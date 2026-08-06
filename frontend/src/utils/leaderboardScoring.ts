import { LEADERBOARD_CONFIG, PATTERN_MULTIPLIERS } from '../config/leaderboard';
import { generateLogoColor } from './logoGenerator';
import type { ScoringWeights, LeaderboardEntry, LiveRun, ScoreBreakdown } from '../types/leaderboard';
import type { Schema } from '../../amplify/data/resource';
import { getUrl } from 'aws-amplify/storage';

type Project = Schema['Project']['type'];
type AgentRun = Schema['AgentRun']['type'];
type Agent = Schema['Agent']['type'];

interface ScoringProject {
  questCompleted?: boolean;
  teamPattern?: string | null;
}

interface ScoringAgentRunState {
  totalTokens?: number;
  createdAt?: string;
  [key: string]: unknown;
}

interface ScoringAgentRun {
  agentId?: string | null;
  agentName?: string | null;
  state?: ScoringAgentRunState[] | null;
  [key: string]: unknown;
}

export function calculateScore(
  project: ScoringProject,
  agentRuns: ScoringAgentRun[],
  agents: Agent[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _weights: ScoringWeights = LEADERBOARD_CONFIG.scoringWeights
): { total: number; breakdown: ScoreBreakdown } {
  // Efficiency: ratio per agent run (tokens by less frugal agents cost more)
  let weightedTokenCost = 0;
  agentRuns.forEach(run => {
    const agent = agents.find(a => a.id === run.agentId);
    const frugality = agent?.frugality || 50;
    const tokens = run.state?.[run.state.length - 1]?.totalTokens || 0;
    const costMultiplier = (100 - frugality) / 50 + 1; // 1x to 3x based on frugality
    weightedTokenCost += tokens * costMultiplier;
  });
  let tokenScore = agentRuns.length > 0 
    ? Math.max(200, 5000 - weightedTokenCost / 20) 
    : 0;
  
  // Massive penalty if quest not completed
  if (!project.questCompleted) {
    tokenScore = Math.round(tokenScore * 0.1); // 90% penalty
  }
  
  const executionTime = calculateExecutionTime(agentRuns);
  const speedScore = executionTime === 0 ? 0 : Math.max(0, 2000 - executionTime * 5);
  
  // Team score: sum of agent precision values (max 1000)
  const totalPrecision = agentRuns.reduce((sum, run) => {
    const agent = agents.find(a => a.id === run.agentId);
    return sum + (agent?.precision || 0);
  }, 0);
  const patternMultiplier = PATTERN_MULTIPLIERS[project.teamPattern as keyof typeof PATTERN_MULTIPLIERS] || 1.0;
  const teamScore = Math.min(1000, totalPrecision * 10 * patternMultiplier);
  
  const completionScore = project.questCompleted ? 1500 : 0;
  
  const breakdown = {
    tokenEfficiency: Math.round(tokenScore),
    executionSpeed: Math.round(speedScore),
    teamOptimization: Math.round(teamScore),
    completionBonus: Math.round(completionScore)
  };
  
  return {
    total: Math.round(tokenScore + speedScore + teamScore + completionScore),
    breakdown
  };
}

export function calculateExecutionTime(agentRuns: ScoringAgentRun[]): number {
  if (!agentRuns.length) return 0;

  const timestamps = agentRuns.flatMap(run =>
    (run.state || []).map((s) => new Date(s.createdAt || '').getTime())
  );

  if (!timestamps.length) return 0;

  const start = Math.min(...timestamps);
  const end = Math.max(...timestamps);

  return Math.round((end - start) / 1000);
}

export function sumTokens(agentRuns: ScoringAgentRun[]): number {
  let total = 0;
  for (const run of agentRuns) {
    const states = run.state || [];
    if (states.length > 0) {
      const lastState = states[states.length - 1];
      total += lastState?.totalTokens || 0;
    }
  }
  return total;
}

export function filterByDateRange(
  projects: Project[],
  fromDate: Date | null,
  toDate: Date | null
): Project[] {
  return projects.filter(p => {
    if (!p.createdAt) return false;
    const created = new Date(p.createdAt);
    if (fromDate && created < fromDate) return false;
    if (toDate && created > toDate) return false;
    return true;
  });
}

export async function processProjects(
  projects: Project[],
  runs: AgentRun[],
  agents: Agent[]
): Promise<{ top: LeaderboardEntry[]; live: LiveRun[] }> {
  const agentsList = agents || [];

  const runsByProject = runs.reduce((acc, run) => {
    if (!acc[run.projectId]) acc[run.projectId] = [];
    acc[run.projectId].push(run);
    return acc;
  }, {} as Record<string, AgentRun[]>);

  const completedProjectsData = await Promise.all(
    projects
      .filter(p => p.status === 'COMPLETED')
      .map(async project => {
        const projectRuns = runsByProject[project.id] || [];
        const displayName = project.teamName ? `${project.teamName} - ${project.name}` : project.name || 'Unnamed Project';
        const questCompleted = await validateQuestCompletion(project.id, project.status);
        const scoreResult = calculateScore({ ...project, questCompleted }, projectRuns, agentsList);
        return {
          rank: 0,
          projectId: project.id,
          projectName: displayName,
          logoColor: generateLogoColor(displayName),
          score: scoreResult.total,
          executionTime: calculateExecutionTime(projectRuns),
          totalTokens: sumTokens(projectRuns),
          agentCount: projectRuns.length || 0,
          teamPattern: project.teamPattern || 'mono',
          status: project.status as LeaderboardEntry['status'],
          lastUpdate: project.updatedAt || project.createdAt || new Date().toISOString(),
          scoreBreakdown: scoreResult.breakdown,
          questCompleted
        };
      })
  );

  const completedProjects = completedProjectsData
    .sort((a, b) => b.score - a.score)
    .map((entry, index) => ({ ...entry, rank: index + 1 }))
    .slice(0, LEADERBOARD_CONFIG.topEntriesCount);

  // Show last 4 runs regardless of status (running/completed)
  const latestRuns: LiveRun[] = projects
    .sort((a, b) => {
      const dateA = new Date(b.updatedAt || b.createdAt || 0).getTime();
      const dateB = new Date(a.updatedAt || a.createdAt || 0).getTime();
      return dateA - dateB;
    })
    .slice(0, LEADERBOARD_CONFIG.liveRunsCount)
    .map(project => {
      const projectRuns = runsByProject[project.id] || [];
      const currentRun = projectRuns[projectRuns.length - 1];
      const displayName = project.teamName ? `${project.teamName} - ${project.name}` : project.name || 'Unnamed Project';
      const scoreResult = calculateScore(project, projectRuns, agentsList);
      
      // Find rank if completed
      const rank = project.status === 'COMPLETED' 
        ? completedProjects.findIndex(cp => cp.projectId === project.id) + 1 || null
        : null;
      
      return {
        projectId: project.id,
        projectName: displayName,
        logoColor: generateLogoColor(displayName),
        currentTime: calculateExecutionTime(projectRuns),
        startTime: project.createdAt || new Date().toISOString(),
        currentAgent: currentRun?.agentName || project.agents?.[0] || 'agent',
        status: project.status as LiveRun['status'],
        score: scoreResult.total,
        rank,
        lastUpdate: project.updatedAt || project.createdAt || new Date().toISOString()
      };
    });

  return { top: completedProjects, live: latestRuns };
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const questCompletionCache = new Map<string, { result: boolean; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function validateQuestCompletion(projectId: string, status: string | null | undefined): Promise<boolean> {
  if (status !== 'COMPLETED') return false;
  
  const cached = questCompletionCache.get(projectId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }
  
  try {
    await getUrl({ 
      path: `apps/${projectId}/index.html`,
      options: { validateObjectExistence: true }
    });
    questCompletionCache.set(projectId, { result: true, timestamp: Date.now() });
    return true;
  } catch {
    questCompletionCache.set(projectId, { result: false, timestamp: Date.now() });
    return false;
  }
}

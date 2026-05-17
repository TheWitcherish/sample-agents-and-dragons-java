import type { TeamPattern, AgentConnection } from '../types';

export interface AgentPatternConfig {
  primaryAgentRequired: boolean;
  maxAgents?: number;
  generateConnections: (agents: string[], primaryAgent: string) => AgentConnection[];
}

export const AGENT_PATTERN_RULES: Record<TeamPattern, AgentPatternConfig> = {
  mono: {
    primaryAgentRequired: true,
    maxAgents: 1,
    generateConnections: () => []
  },
  
  hierarchical: {
    primaryAgentRequired: true,
    generateConnections: (agents: string[], primaryAgent: string) => {
      const entryPoint = primaryAgent || agents[0];
      const otherAgents = agents.filter(id => id !== entryPoint);
      
      return otherAgents.map(target => ({
        source: entryPoint,
        target,
        description: 'Hierarchical delegation'
      }));
    }
  },
  
  graph: {
    primaryAgentRequired: true,
    generateConnections: (agents: string[], primaryAgent: string) => {
      const orderedAgents = [primaryAgent || agents[0], ...agents.filter(id => id !== (primaryAgent || agents[0]))];
      const connections: AgentConnection[] = [];
      
      for (let i = 0; i < orderedAgents.length - 1; i++) {
        connections.push({
          source: orderedAgents[i],
          target: orderedAgents[i + 1],
          description: 'Sequential flow'
        });
      }
      
      return connections;
    }
  },
  
  swarm: {
    primaryAgentRequired: true,
    generateConnections: () => []
  }
};

export const validateAgentSelection = (
  pattern: TeamPattern,
  selectedAgents: string[],
  primaryAgent: string
): { isValid: boolean; error?: string } => {
  const config = AGENT_PATTERN_RULES[pattern];
  
  if (config.maxAgents && selectedAgents.length > config.maxAgents) {
    return { isValid: false, error: `Maximum ${config.maxAgents} agent(s) allowed for ${pattern} pattern` };
  }
  
  if (config.primaryAgentRequired && !primaryAgent) {
    return { isValid: false, error: 'Primary agent must be selected' };
  }
  
  if (primaryAgent && !selectedAgents.includes(primaryAgent)) {
    return { isValid: false, error: 'Primary agent must be in selected agents' };
  }
  
  return { isValid: true };
};
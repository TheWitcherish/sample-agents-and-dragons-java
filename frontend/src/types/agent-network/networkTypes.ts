import type { Schema } from '../../../amplify/data/resource';

export type TaskEvent = Schema['TaskEvent']['type'];

export interface D3Node {
  id: string;           // agentName
  group: number;        // agent group/type
  eventCount: number;   // number of events for this agent
  lastActivity: string; // most recent event timestamp
  x?: number;          // D3 position
  y?: number;          // D3 position
  fx?: number | null;  // D3 fixed position
  fy?: number | null;  // D3 fixed position
}

export interface D3Link {
  source: string | D3Node;       // callerAgentName
  target: string | D3Node;       // agentName
  value: number;        // interaction frequency
  events: TaskEvent[]; // related events
}

export interface AgentInteraction {
  source: string;
  target: string;
  frequency: number;
  events: TaskEvent[];
  firstInteraction: string;
  lastInteraction: string;
}

export interface NetworkFilters {
  agentNames: string[];
  minInteractionCount: number;
  messageSearch: string;
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  showIsolatedNodes: boolean;
}

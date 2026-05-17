
// Task status enum
export type TaskStatus = 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABORTED' | 'ON_ERROR';
export type ProjectStatus = 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABORTED' | 'ON_ERROR';

// Agent pattern options
export type TeamPattern = 
  | "mono" 
  | "hierarchical" 
  | "swarm" 
  | "graph";


export interface ProjectRequestPayload {
  project: {
    id: string;
    questId: string;
    name: string;
    prompt: string;
  };
  team: {
    name: string;
    prompt: string;
    pattern: TeamPattern;
    entrypoint: string;
    agents: Array<{
      id: string;
      name: string;
      model: string;
      prompt: string;
      role: string;
      tools: string[];
    }>;
    connections: AgentConnection[];
  };
  config: {
    gateway_url: string;
    token: string;
    s3_bucket_name: string;
  };
}

// Agent Connection type
export interface AgentConnection {
  source: string;
  target: string;
  description: string;
}

// Agent Visual Position type
export interface AgentVisualPosition {
  agentId: string;
  x: number;
  y: number;
}

// Quest type
export interface Quest {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;

  name?: string | null;
  prompt?: string | null;
  mandatoryAgentRoles?: string[] | null;
  authorizedAgentList?: string[] | null;
  authorizedPatternList?: AgenticPattern[] | null;
  teamDirectionSamples?: string[] | null;
}

// AgenticPattern type
export interface AgenticPattern {
  name: string;
  runtime: string;
}

// Agent type
export interface Agent {

  //automatic properties 
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;

  //core properties 
  name: string;
  prompt: string;
  model: string;
  tools: string[] | null;
  role?: string | null;
  
  //display properties 
  avatar?: string | null;
  roleDisplayName?: string | null;
  skills?: string[] | null;
  modelDisplayName?: string | null;
  speed?: number | null;
  precision?: number | null;
  frugality?: number | null;

  //filtering properties 
  compatiblePatterns: string[];
  cost: number;

}

// Project type
export interface Project {

  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;

  ownerKey: string;

  questId?: string | null;
  templateId?: string | null;
  name: string;
  prompt: string;
  
  teamName?: string | null;
  teamPrompt?: string | null;
  teamPattern: TeamPattern;
  teamEntrypoint: string;
  
  agents?: string[];
  agentsConnections?: AgentConnection[];
  agentsVisualPositions?: AgentVisualPosition[];

  url?: string | null;
  status: ProjectStatus;
  sessionId?: string | null;
}

// Task type
export interface Task {
  readonly id: string;
  name?: string | null;
  projectId?: string | null;
  sessionId?: string | null;
  content?: string | null;
  status?: TaskStatus | null;
  createdBy?: string | null;
  assignee?: string | null;
  result?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// TaskEvent type
export interface TaskEvent {
  readonly id: string;
  taskId?: string | null;
  sessionId?: string | null;
  newStatus?: TaskStatus | null;
  newComment?: string | null;
  updatedBy?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// UI State types
export interface KanbanColumn {
  id: TaskStatus;
  title: string;
  tasks: Task[];
}

export interface DragItem {
  id: string;
  type: string;
  status: TaskStatus;
}

// Agent status enum
export type AgentStatus = 'READY' | 'WORKING' |'THINKING' | 'USING_TOOL' | 'WAITING' | 'STOPPED';

// Agent state type
export interface AgentState {
  status: AgentStatus;
  messageCount: number;
  cycleCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  createdAt: string;
  latency: number;
}

// AgentRun type
export interface AgentRun {
  readonly projectId: string;
  readonly agentId: string;
  agentName?: string | null;
  state?: AgentState[] | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// AgentTransition type
export interface AgentTransition {
  readonly projectId: string;
  readonly transitionId: string;
  sourceAgentId?: string | null;
  targetAgentId?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// AWS Bedrock AgentCore types
export interface AgentRuntime {
  agentRuntimeArn: string;
  agentRuntimeId: string;
  agentRuntimeName: string;
  agentRuntimeVersion: string;
  description?: string;
  lastUpdatedAt: Date;
  status: string;
}



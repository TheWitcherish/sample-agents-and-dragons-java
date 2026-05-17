import type { Project } from "../types";

interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  skills: string[];
  personality: string[];
}

interface AgentComposition {
  agentEntrypoint: string;
  agents: Agent[];
  connections: Array<{
    from: string;
    to: string[];
    description: string;
  }>;
}

interface LambdaPayload {
  project: {
    id: string;
    name: string;
    preferences: {
      interests: string[];
      designStyle: string;
      preferredTracks: string[];
      additionalInput: string;
    };
  };
  agents: {
    pattern: string;
    composition: AgentComposition;
  };
  agentsPatternRuntime: Record<string, string>;
  auth?: {
    accessToken: string;
  };
  mcp?: {
    gatewayUrl: string;
  };
}

export class LambdaPayloadService {
  private static getMockedAgentComposition(): AgentComposition {
    return {
      agentEntrypoint: "99104e28-80f6-4a0e-ae32-e7dc7d1ef1fe",
      agents: [
        {
          id: "99104e28-80f6-4a0e-ae32-e7dc7d1ef1fe",
          name: "Emma Thompson",
          role: "Tech Lead / Product Owner",
          description: "Responsible for project management and team coordination",
          skills: ["Project Management", "Team Leadership"],
          personality: ["Organized", "Detail-oriented", "Problem-solving"],
        },
        {
          id: "dd559395-b925-4169-bb18-033904ee8f61",
          name: "Jake Martinez",
          role: "Junior Frontend Developer",
          description: "Basic development tasks and code implementation",
          skills: ["React", "CSS"],
          personality: ["Detail-oriented", "Innovation-focused", "User-centric"]
        },
        {
          id: "b1b2b3b4-b5b6-b7b8-b9b0-b1b2b3b4b5b6",
          name: "Sophie Lee",
          role: "Senior Backend Developer",
          description: "Advanced backend development tasks and database management",
          skills: ["Node.js", "Express", "MongoDB"],
          personality: ["Analytical", "Problem-solving", "Attention to detail"]
        }
      ],
      connections: [
        {
          from: "99104e28-80f6-4a0e-ae32-e7dc7d1ef1fe",
          to: ["dd559395-b925-4169-bb18-033904ee8f61", "b1b2b3b4-b5b6-b7b8-b9b0-b1b2b3b4b5b6"],
          description: "Dispatch tasks"
        }
      ]
    };
  }

  private static getMockedPreferences(additionalInput: string) {
    return {
      interests: ["Keynotes & Main Events", "Dining & Foods", "Networking Events"],
      designStyle: "professional",
      preferredTracks: ["Application Development", "AI/ML", "Analytics"],
      additionalInput
    };
  }

  static generatePayload(
    project: Project, 
    agentsPattern: string, 
    agentsPatternRuntime: Record<string, string>,
    accessToken?: string, 
    mcpGatewayUrl?: string
  ): LambdaPayload {
    const payload: LambdaPayload = {
      project: {
        id: project.id,
        name: project.name,
        preferences: this.getMockedPreferences(project.prompt || "")
      },
      agents: {
        pattern: agentsPattern,
        composition: this.getMockedAgentComposition()
      },
      agentsPatternRuntime
    };

    if (accessToken) {
      payload.auth = { accessToken };
    }

    if (mcpGatewayUrl) {
      payload.mcp = { gatewayUrl: mcpGatewayUrl };
    }

    return payload;
  }
}
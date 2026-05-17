import { useEffect, useState } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";
import type { Project, Task, AgentRun, AgentTransition, Agent, Quest, TeamPattern, AgentConnection, AgentVisualPosition } from "../types";
import { getErrorMessage } from './useErrorHandler';

const client = generateClient<Schema>();

export const useProjects = () => {  

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Optimize query by selecting only necessary fields for project list

    const subscription = client.models.Project.observeQuery({
      selectionSet: ['id', 'name', 'prompt', 'teamName', 'teamPattern', 'ownerKey', 'status', 'createdAt', 'updatedAt'],
      authMode: "userPool"
    }).subscribe({
      next: ({ items, isSynced }) => {
        setProjects([...items] as unknown as Project[]);
        setLoading(!isSynced);
        setError(null);
      },
      error: (err) => {
        console.error("Error fetching projects:", err);
        setError(getErrorMessage(err));
        setLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, []);

  const createProject = async (projectData: {
    ownerKey: string;
    
    templateId?: string | null;
    name: string;
    prompt: string;
    
    teamName?: string | null;
    teamPrompt?: string | null;
    teamPattern: TeamPattern;
    teamEntrypoint: string;
    
    agents: string[];
    agentsConnections?: AgentConnection[];
    agentsVisualPositions?: AgentVisualPosition[];

  }) => {
    
      const result = await client.models.Project.create({
        ...projectData,
        url: "",
        status: "CREATED",        
      } as Parameters<typeof client.models.Project.create>[0],
      {authMode: "userPool"});
      
      console.debug("project created",result);

      return result.data;
  };

  const deleteProject = async (projectId: string) => {
    try {
      // First, delete all tasks associated with the project
      const tasksResult = await client.models.Task.list({
        filter: { projectId: { eq: projectId } },
        authMode: "userPool",
      });

      if (tasksResult.data) {
        await Promise.all(
          tasksResult.data.map(task =>
            client.models.Task.delete({ id: task.id },
              {authMode: "userPool"})
          )
        );
      }

      // Then delete the project
      await client.models.Project.delete({ id: projectId },
        {authMode: "userPool"});
    } catch (err) {
      console.error("Error deleting project:", err);
      throw new Error(getErrorMessage(err));
    }
  };

  const checkTeamNameExists = async (teamName: string): Promise<boolean> => {
    try {
      const result = await client.models.Project.list({
        filter: { teamName: { eq: teamName } },
        authMode: "userPool",
      });
      return (result.data?.length ?? 0) > 0;
    } catch (err) {
      console.error("Error checking team name:", err);
      throw new Error(getErrorMessage(err));
    }
  };

  const cancelProject = async (projectId: string) => {
    try {
      await client.models.Project.update({
        id: projectId,
        status: "ABORTED",
      } as Parameters<typeof client.models.Project.update>[0],
      {authMode: "userPool"});
    } catch (err) {
      console.error("Error cancelling project:", err);
      throw new Error(getErrorMessage(err));
    }
  };

  return { projects, loading, error, createProject, deleteProject, cancelProject, checkTeamNameExists };
};

export const useProject = (projectId: string | undefined, ownerKey: string | undefined) => {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectOwner, setProjectOwner] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }    
    const connectionMode = ownerKey ? "identityPool" : "userPool";

    const fetchProject = async () => {
      try {
        const result = await client.models.Project.get({ id: projectId },
          {authMode: connectionMode}
        );
        setProject(result.data as unknown as Project);
        setError(null);
      } catch (err) {
        console.error("Error fetching project:", err);
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    fetchProject();

    const verifyProjectOwner = async () => {
      try {
        const result = await client.queries.verifyOwner({
          projectId,
          ownerKey,
        });
        setProjectOwner(result.data=='owner'?true:false);
        setError(null);
      } catch (err) {
        console.error("Error verifying project owner:", err);
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    verifyProjectOwner();

  }, [projectId, ownerKey]);

  return { project, projectOwner, loading, error };
};

export const useProjectSubscription = (projectId: string | undefined, ownerKey: string | undefined) => {
  const [project, setProject] = useState<Project | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    const connectionMode = "userPool";

    const subscription = client.models.Project.observeQuery({
      filter: { id: { eq: projectId } },
      authMode: connectionMode
    }).subscribe({
      next: async ({ items, isSynced }) => {
        if (items.length > 0) {
          const projectData = items[0] as unknown as Project;
          setProject(projectData);

          if (projectData.agents && projectData.agents.length > 0) {
            try {
              const agentPromises = projectData.agents.map(agentId =>
                client.models.Agent.get({ id: agentId }, { authMode: connectionMode })
              );
              const agentResults = await Promise.all(agentPromises);
              const agentsList = agentResults
                .filter(result => result.data)
                .map(result => result.data as unknown as Agent);
              setAgents(agentsList);
            } catch (err) {
              console.error("Error fetching agents:", err);
              setError(getErrorMessage(err));
            }
          } else {
            setAgents([]);
          }
        }
        setLoading(!isSynced);
        setError(null);
      },
      error: (err) => {
        console.error("Error subscribing to project:", err);
        setError(getErrorMessage(err));
        setLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [projectId, ownerKey]);

  return { project, agents, loading, error };
};

export const useProjectTasks = (projectId: string | undefined, ownerKey: string | undefined) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    const connectionMode = ownerKey ? "identityPool" : "userPool";

    // Optimize query by selecting only necessary fields for tasks
    
    const subscription = client.models.Task.observeQuery({
      filter: { projectId: { eq: projectId } },
      selectionSet: ['id', 'name', 'content', 'status', 'projectId', 'createdAt', 'updatedAt'],
      authMode: connectionMode
    }).subscribe({
      next: ({ items, isSynced }) => {
        setTasks([...items] as unknown as Task[]);
        setLoading(!isSynced);
        setError(null);
      },
      error: (err) => {
        console.error("Error fetching tasks:", err);
        setError("Failed to load tasks");
        setLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [projectId, ownerKey]);

  const createTask = async (taskData: {
    name: string;
    content: string;
    status: string;
  }) => {
    if (!projectId) throw new Error("Project ID is required");
    const connectionMode = ownerKey ? "identityPool" : "userPool";

    try {
      const result = await client.models.Task.create({
        ...taskData,
        projectId,
      } as unknown as Parameters<typeof client.models.Task.create>[0],
      {authMode: connectionMode});
      return result.data;
    } catch (err) {
      console.error("Error creating task:", err);
      throw new Error("Failed to create task");
    }
  };

  const updateTask = async (taskId: string, updates: Partial<Task>) => {
    const connectionMode = ownerKey ? "identityPool" : "userPool";

    try {
      const result = await client.models.Task.update({
        id: taskId,
        ...updates,
      } as unknown as Parameters<typeof client.models.Task.update>[0],
      {authMode: connectionMode});
      return result.data;
    } catch (err) {
      console.error("Error updating task:", err);
      throw new Error("Failed to update task");
    }
  };
  
  const deleteTask = async (taskId: string) => {
    const connectionMode = ownerKey ? "identityPool" : "userPool";

    try {
      await client.models.Task.delete({ id: taskId },
        {authMode: connectionMode});
    } catch (err) {
      console.error("Error deleting task:", err);
      throw new Error("Failed to delete task");
    }
  };

  return { tasks, loading, error, createTask, updateTask, deleteTask };
};

export const useTask = (taskId: string | undefined) => {
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      setLoading(false);
      return;
    }

    const subscription = client.models.Task.observeQuery({
      filter: { id: { eq: taskId } },
      selectionSet: ['id', 'name', 'content', 'status', 'projectId', 'createdAt', 'updatedAt'],
      authMode: "userPool",
    }).subscribe({
      next: ({ items, isSynced }) => {
        if (items.length > 0) {
          setTask(items[0] as unknown as Task);
        }
        setLoading(!isSynced);
        setError(null);
      },
      error: (err) => {
        console.error("Error fetching task:", err);
        setError("Failed to load task");
        setLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [taskId]);

  return { task, loading, error };
};

// Optimized hook for getting just task counts without full task data
export const useProjectTaskCounts = (projectId: string | undefined) => {
  const [taskCounts, setTaskCounts] = useState({
    todo: 0,
    inProgress: 0,
    done: 0,
    total: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    // Only fetch status field for counting
    const subscription = client.models.Task.observeQuery({
      filter: { projectId: { eq: projectId } },
      selectionSet: ['id', 'status'],
      authMode: "userPool",      
    }).subscribe({
      next: ({ items, isSynced }) => {
        const counts = items.reduce((acc, task) => {
          const taskItem = task as unknown as Task;
          switch (taskItem.status) {
            case 'CREATED':
              acc.todo++;
              break;
            case 'IN_PROGRESS':
              acc.inProgress++;
              break;
            case 'COMPLETED':
              acc.done++;
              break;
          }
          acc.total++;
          return acc;
        }, { todo: 0, inProgress: 0, done: 0, total: 0 });

        setTaskCounts(counts);
        setLoading(!isSynced);
        setError(null);
      },
      error: (err) => {
        console.error("Error fetching task counts:", err);
        setError("Failed to load task counts");
        setLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [projectId]);

  return { taskCounts, loading, error };
};


export const useAgentRuns = (projectId: string | undefined, ownerKey: string | undefined) => {
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    const connectionMode = ownerKey ? "identityPool" : "userPool";

    const subscription = client.models.AgentRun.observeQuery({
      filter: { projectId: { eq: projectId } },
      selectionSet: [
        'projectId', 'agentId', 'agentName', 'createdAt', 'updatedAt',
        'state.status', 'state.messageCount', 'state.cycleCount',
        'state.inputTokens', 'state.outputTokens', 'state.totalTokens',
        'state.latency', 'state.cycleDuration', 'state.createdAt'
      ],
      authMode: connectionMode
    }).subscribe({
      next: ({ items, isSynced }) => {
        setAgentRuns([...items] as unknown as AgentRun[]);
        setLoading(!isSynced);
        setError(null);
      },
      error: (err) => {
        console.error("Error fetching agent runs:", err);
        setError("Failed to load agent runs");
        setLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [projectId, ownerKey]);

  return { agentRuns, loading, error  };
};

export const useAgentTransitions = (projectId: string | undefined, ownerKey: string | undefined) => {
  const [agentTransitions, setAgentTransitions] = useState<AgentTransition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    const connectionMode = ownerKey ? "identityPool" : "userPool";

    const subscription = client.models.AgentTransition.observeQuery({
      filter: { projectId: { eq: projectId } },
      selectionSet: ['projectId', 'transitionId', 'sourceAgentId', 'targetAgentId', 'createdAt', 'updatedAt'],
      authMode: connectionMode
    }).subscribe({
      next: ({ items, isSynced }) => {
        setAgentTransitions([...items] as unknown as AgentTransition[]);
        setLoading(!isSynced);
        setError(null);
      },
      error: (err) => {
        console.error("Error fetching agent transitions:", err);
        setError("Failed to load agent transitions");
        setLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [projectId, ownerKey]);

  return { agentTransitions, loading, error  };
};

export const useAgents = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const subscription = client.models.Agent.observeQuery({
      authMode: "userPool"
    }).subscribe({
      next: ({ items, isSynced }) => {
        setAgents([...items] as unknown as Agent[]);
        setLoading(!isSynced);
        setError(null);
      },
      error: (err) => {
        console.error("Error fetching agents:", err);
        setError(getErrorMessage(err));
        setLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, []);

  const createAgent = async (agentData: Partial<Agent>) => {
    try {
      const result = await client.models.Agent.create(
        agentData as Parameters<typeof client.models.Agent.create>[0],
        { authMode: "userPool" }
      );
      return result.data;
    } catch (err) {
      console.error("Error creating agent:", err);
      throw new Error(getErrorMessage(err));
    }
  };

  const updateAgent = async (id: string, agentData: Partial<Agent>) => {
    try {
      const result = await client.models.Agent.update(
        { id, ...agentData } as Parameters<typeof client.models.Agent.update>[0],
        { authMode: "userPool" }
      );
      return result.data;
    } catch (err) {
      console.error("Error updating agent:", err);
      throw new Error(getErrorMessage(err));
    }
  };

  const deleteAgent = async (id: string) => {
    try {
      await client.models.Agent.delete(
        { id },
        { authMode: "userPool" }
      );
    } catch (err) {
      console.error("Error deleting agent:", err);
      throw new Error(getErrorMessage(err));
    }
  };

  return { agents, loading, error, createAgent, updateAgent, deleteAgent };
};

export const useQuests = () => {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const subscription = client.models.Quest.observeQuery({
      authMode: "userPool"
    }).subscribe({
      next: ({ items, isSynced }) => {
        setQuests([...items] as unknown as Quest[]);
        setLoading(!isSynced);
        setError(null);
      },
      error: (err) => {
        console.error("Error fetching quests:", err);
        setError(getErrorMessage(err));
        setLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, []);

  const createQuest = async (questData: Partial<Quest>) => {
    try {
      const result = await client.models.Quest.create(
        questData as Parameters<typeof client.models.Quest.create>[0],
        { authMode: "userPool" }
      );
      return result.data;
    } catch (err) {
      console.error("Error creating quest:", err);
      throw new Error(getErrorMessage(err));
    }
  };

  const updateQuest = async (id: string, questData: Partial<Quest>) => {
    try {
      const result = await client.models.Quest.update(
        { id, ...questData } as Parameters<typeof client.models.Quest.update>[0],
        { authMode: "userPool" }
      );
      return result.data;
    } catch (err) {
      console.error("Error updating quest:", err);
      throw new Error(getErrorMessage(err));
    }
  };

  const deleteQuest = async (id: string) => {
    try {
      await client.models.Quest.delete(
        { id },
        { authMode: "userPool" }
      );
    } catch (err) {
      console.error("Error deleting quest:", err);
      throw new Error(getErrorMessage(err));
    }
  };

  return { quests, loading, error, createQuest, updateQuest, deleteQuest };
};

export const useProjectMessage = (projectId: string | undefined, ownerKey: string | undefined) => {
  const [messages, setMessages] = useState<Schema['AgentMessage']['type'][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    const connectionMode = ownerKey ? "identityPool" : "userPool";

    const subscription = client.models.AgentMessage.observeQuery({
      filter: { projectId: { eq: projectId } },
      selectionSet: ['projectId', 'messageId', 'agentId', 'role', 'text', 'createdAt', 'updatedAt'],
      authMode: connectionMode
    }).subscribe({
      next: ({ items, isSynced }) => {
        setMessages([...items] as unknown as Schema['AgentMessage']['type'][]);
        setLoading(!isSynced);
        setError(null);
      },
      error: (err) => {
        console.error("Error fetching messages:", err);
        setError("Failed to load messages");
        setLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [projectId, ownerKey]);

  return { messages, loading, error };
};

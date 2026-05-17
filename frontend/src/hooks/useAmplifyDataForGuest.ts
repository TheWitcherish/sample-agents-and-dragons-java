import { useEffect, useState } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";
import type { Project, Agent } from "../types";
import { getErrorMessage } from './useErrorHandler';

const client = generateClient<Schema>();

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
    const connectionMode = "identityPool";

    const subscription = client.models.Project.observeQuery({
      filter: { id: { eq: projectId } },
      authMode: connectionMode,
      selectionSet: ['id', 'name', 'teamName', 'status', 'agents']
    }).subscribe({
      next: async ({ items, isSynced }) => {
        if (items.length > 0) {
          const projectData = items[0] as unknown as Project;
          setProject(projectData);

          if (projectData.agents && projectData.agents.length > 0) {
            try {
              const agentPromises = projectData.agents.map(agentId =>
                client.models.Agent.get({ id: agentId }, { 
                  authMode: connectionMode,
                  selectionSet: ['id', 'name', 'role', 'avatar']
                })
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


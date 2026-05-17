import { useState, useEffect, useRef } from 'react';
import type { LeaderboardEntry, LiveRun } from '../types/leaderboard';
import type { Schema } from '../../amplify/data/resource';
import { processProjects } from '../utils/leaderboardScoring';
import { generateClient } from 'aws-amplify/data';

const client = generateClient<Schema>();

export function useLeaderboard(fromDate: Date | null, toDate: Date | null) {
  const [topProjects, setTopProjects] = useState<LeaderboardEntry[]>([]);
  const [liveRuns, setLiveRuns] = useState<LiveRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Schema['Project']['type'][]>([]);
  const [runs, setRuns] = useState<Schema['AgentRun']['type'][]>([]);
  const [agents, setAgents] = useState<Schema['Agent']['type'][]>([]);
  const processIdRef = useRef(0);

  // Stabilize on ISO strings so the effect only re-runs when the actual date value changes
  const fromISO = fromDate?.toISOString() ?? '';
  const toISO = toDate?.toISOString() ?? '';

  // Fetch agents once — they rarely change and don't need a subscription
  useEffect(() => {
    client.models.Agent.list({ authMode: 'userPool' }).then(({ data }) => {
      setAgents(data || []);
    });
  }, []);

  useEffect(() => {
    setProjects([]);
    setRuns([]);
    setLoading(true);
    
    const filter = fromISO && toISO ? {
      createdAt: { ge: fromISO, le: toISO }
    } : undefined;

    const projectSub = client.models.Project.observeQuery({
      filter,
      authMode: 'userPool'
    }).subscribe({
      next: ({ items, isSynced }) => {
        setProjects(items);
        setLoading(!isSynced);
      }
    });
    
    const runSub = client.models.AgentRun.observeQuery({
      authMode: 'userPool'
    }).subscribe({
      next: ({ items }) => setRuns(items)
    });

    return () => {
      projectSub.unsubscribe();
      runSub.unsubscribe();
    };
  }, [fromISO, toISO]);

  useEffect(() => {
    // Wait until all three data sources have loaded
    if (projects.length === 0 || runs.length === 0 || agents.length === 0) return;

    // Use an incrementing ID so only the latest call writes results
    const currentId = ++processIdRef.current;
    
    processProjects(projects, runs, agents).then(processed => {
      if (currentId !== processIdRef.current) return; // stale, skip
      setTopProjects(processed.top);
      setLiveRuns(processed.live);
    });
  }, [projects, runs, agents]);

  return { topProjects, liveRuns, loading };
}

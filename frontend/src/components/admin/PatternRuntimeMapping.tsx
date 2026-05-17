import React, { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';
import LoadingSpinner from '../common/LoadingSpinner';
import styles from './PatternRuntimeMapping.module.css';

const client = generateClient<Schema>();

interface PatternRuntimeMappingProps {
  agentRuntimes: Array<{
    agentRuntimeId: string;
    agentRuntimeName: string;
    agentRuntimeArn: string;
    status: string;
  }>;
}

const AGENT_PATTERNS = ['mono', 'hierarchical', 'swarm', 'graph'];

const PatternRuntimeMapping: React.FC<PatternRuntimeMappingProps> = ({ agentRuntimes }) => {
  const [mappings, setMappings] = useState<Array<{
    id: string;
    agentsPattern: string;
    runtimeName: string;
    runtimeArn: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    loadMappings();
  }, []);

  const loadMappings = async () => {
    try {
      const result = await client.models.AgentsPatternRuntime.list({ authMode: 'userPool' });
      setMappings(result.data || []);
    } catch (error) {
      console.error('Failed to load pattern-runtime mappings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMappingChange = async (pattern: string, runtimeArn: string) => {
    setSaving(pattern);
    try {
      const runtime = agentRuntimes.find(r => r.agentRuntimeArn === runtimeArn);
      if (!runtime) return;

      // Check if mapping exists
      const existingMapping = mappings.find(m => m.agentsPattern === pattern);
      
      if (existingMapping) {
        // Update existing mapping
        await client.models.AgentsPatternRuntime.update({
          id: existingMapping.id,
          runtimeArn,
          runtimeName: runtime.agentRuntimeName
        } as unknown as Parameters<typeof client.models.AgentsPatternRuntime.update>[0], { authMode: 'userPool' });
      } else {
        // Create new mapping
        await client.models.AgentsPatternRuntime.create({
          agentsPattern: pattern,
          runtimeArn,
          runtimeName: runtime.agentRuntimeName
        } as unknown as Parameters<typeof client.models.AgentsPatternRuntime.create>[0], { authMode: 'userPool' });
      }

      await loadMappings();
    } catch (error) {
      console.error('Failed to save pattern-runtime mapping:', error);
    } finally {
      setSaving(null);
    }
  };

  const getCurrentMapping = (pattern: string) => {
    return mappings.find(m => m.agentsPattern === pattern)?.runtimeArn || '';
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const readyRuntimes = agentRuntimes.filter(r => r.status === 'READY');

  return (
    <div className={styles.patternRuntimeMapping}>
      <h3>Agent Pattern to Runtime Mapping</h3>
      <p className={styles.description}>
        Configure which AgentCore runtime should handle each agent pattern.
      </p>
      
      <div className={styles.mappingGrid}>
        {AGENT_PATTERNS.map(pattern => (
          <div key={pattern} className={styles.mappingRow}>
            <div className={styles.patternInfo}>
              <span className={styles.patternName}>{pattern}</span>
              <span className={styles.patternDescription}>
                {getPatternDescription(pattern)}
              </span>
            </div>
            
            <div className={styles.runtimeSelect}>
              <select
                value={getCurrentMapping(pattern)}
                onChange={(e) => handleMappingChange(pattern, e.target.value)}
                disabled={saving === pattern || readyRuntimes.length === 0}
                className={styles.select}
              >
                <option value="">Select Runtime...</option>
                {readyRuntimes.map(runtime => (
                  <option key={runtime.agentRuntimeId} value={runtime.agentRuntimeArn}>
                    {runtime.agentRuntimeName}
                  </option>
                ))}
              </select>
              {saving === pattern && <LoadingSpinner />}
            </div>
          </div>
        ))}
      </div>

      {readyRuntimes.length === 0 && (
        <div className={styles.noRuntimes}>
          <p>No ready agent runtimes available. Deploy agent runtimes first.</p>
        </div>
      )}
    </div>
  );
};

const getPatternDescription = (pattern: string): string => {
  switch (pattern) {
    case 'mono':
      return 'Single agent handles all tasks';
    case 'hierarchical':
      return 'Agents organized in hierarchy with delegation';
    case 'swarm':
      return 'Collaborative agents working together';
    case 'graph':
      return 'Structured workflow with defined steps';
    default:
      return '';
  }
};

export default PatternRuntimeMapping;
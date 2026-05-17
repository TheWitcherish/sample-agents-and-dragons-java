import { describe, it, expect } from 'vitest';
import { AGENT_PATTERN_RULES, validateAgentSelection } from '../agentPatternRules';
import type { TeamPattern } from '../../types';

describe('AGENT_PATTERN_RULES', () => {
  it('defines rules for all four patterns', () => {
    const patterns: TeamPattern[] = ['mono', 'hierarchical', 'graph', 'swarm'];
    patterns.forEach(p => {
      expect(AGENT_PATTERN_RULES[p]).toBeDefined();
      expect(AGENT_PATTERN_RULES[p].generateConnections).toBeTypeOf('function');
    });
  });

  describe('mono', () => {
    it('limits to 1 agent', () => {
      expect(AGENT_PATTERN_RULES.mono.maxAgents).toBe(1);
    });

    it('generates no connections', () => {
      const connections = AGENT_PATTERN_RULES.mono.generateConnections(['a1'], 'a1');
      expect(connections).toEqual([]);
    });
  });

  describe('hierarchical', () => {
    it('requires a primary agent', () => {
      expect(AGENT_PATTERN_RULES.hierarchical.primaryAgentRequired).toBe(true);
    });

    it('generates connections from primary to all others', () => {
      const connections = AGENT_PATTERN_RULES.hierarchical.generateConnections(
        ['leader', 'w1', 'w2'],
        'leader'
      );
      expect(connections).toEqual([
        { source: 'leader', target: 'w1', description: 'Hierarchical delegation' },
        { source: 'leader', target: 'w2', description: 'Hierarchical delegation' },
      ]);
    });

    it('uses first agent as fallback when primaryAgent is empty', () => {
      const connections = AGENT_PATTERN_RULES.hierarchical.generateConnections(
        ['a', 'b', 'c'],
        ''
      );
      expect(connections).toHaveLength(2);
      expect(connections.every(c => c.source === 'a')).toBe(true);
    });

    it('returns empty connections for single agent', () => {
      const connections = AGENT_PATTERN_RULES.hierarchical.generateConnections(['a'], 'a');
      expect(connections).toEqual([]);
    });
  });

  describe('graph', () => {
    it('generates sequential connections with primary first', () => {
      const connections = AGENT_PATTERN_RULES.graph.generateConnections(
        ['a', 'b', 'c'],
        'b'
      );
      // b is primary, so order = [b, a, c]
      expect(connections).toEqual([
        { source: 'b', target: 'a', description: 'Sequential flow' },
        { source: 'a', target: 'c', description: 'Sequential flow' },
      ]);
    });

    it('returns empty for single agent', () => {
      const connections = AGENT_PATTERN_RULES.graph.generateConnections(['a'], 'a');
      expect(connections).toEqual([]);
    });
  });

  describe('swarm', () => {
    it('generates no connections', () => {
      const connections = AGENT_PATTERN_RULES.swarm.generateConnections(['a', 'b', 'c'], 'a');
      expect(connections).toEqual([]);
    });
  });
});

describe('validateAgentSelection', () => {
  it('validates a valid mono selection', () => {
    const result = validateAgentSelection('mono', ['a1'], 'a1');
    expect(result).toEqual({ isValid: true });
  });

  it('rejects mono with too many agents', () => {
    const result = validateAgentSelection('mono', ['a1', 'a2'], 'a1');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Maximum 1');
  });

  it('rejects when primary agent is required but missing', () => {
    const result = validateAgentSelection('hierarchical', ['a1', 'a2'], '');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Primary agent must be selected');
  });

  it('rejects when primary agent is not in selected agents', () => {
    const result = validateAgentSelection('hierarchical', ['a1', 'a2'], 'a3');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Primary agent must be in selected agents');
  });

  it('validates a valid hierarchical selection', () => {
    const result = validateAgentSelection('hierarchical', ['a1', 'a2', 'a3'], 'a1');
    expect(result).toEqual({ isValid: true });
  });

  it('validates a valid graph selection', () => {
    const result = validateAgentSelection('graph', ['a1', 'a2'], 'a1');
    expect(result).toEqual({ isValid: true });
  });

  it('validates a valid swarm selection', () => {
    const result = validateAgentSelection('swarm', ['a1', 'a2', 'a3'], 'a1');
    expect(result).toEqual({ isValid: true });
  });
});

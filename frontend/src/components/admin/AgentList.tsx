import React, { useState, forwardRef, useImperativeHandle, useMemo } from 'react';
import styles from './AgentList.module.css';
import type { Agent } from '../../types';

// Color palettes for badges
const MODEL_COLORS: Record<string, string> = {
  'Claude 3.5 Sonnet': '#805ad5',
  'Claude 3 Opus': '#d53f8c',
  'Claude 3 Haiku': '#00b5d8',
  'GPT-4': '#38a169',
  'GPT-4 Turbo': '#2f855a',
  'Mistral': '#dd6b20',
};

const ROLE_COLORS: Record<string, string> = {
  'coordinator': '#3182ce',
  'researcher': '#805ad5',
  'writer': '#d53f8c',
  'analyst': '#dd6b20',
  'developer': '#38a169',
  'reviewer': '#00b5d8',
  'planner': '#e53e3e',
  'executor': '#2f855a',
};

const getModelColor = (model: string): string => {
  return MODEL_COLORS[model] || `hsl(${Math.abs(hashString(model)) % 360}, 60%, 45%)`;
};

const getRoleColor = (role: string): string => {
  const lowerRole = role.toLowerCase();
  return ROLE_COLORS[lowerRole] || `hsl(${Math.abs(hashString(role)) % 360}, 55%, 50%)`;
};

const hashString = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
};

interface AgentListProps {
  agents: Agent[];
  onCreate?: (data: Partial<Agent>) => Promise<unknown>;
  onUpdate?: (id: string, data: Partial<Agent>) => Promise<unknown>;
  onDelete?: (id: string) => Promise<void>;
}

export interface AgentListRef {
  openCreateModal: () => void;
}

interface FiltersProps {
  modelFilter: string;
  roleFilter: string;
  onModelFilterChange: (value: string) => void;
  onRoleFilterChange: (value: string) => void;
  uniqueModels: string[];
  uniqueRoles: string[];
}

export const AgentFilters: React.FC<FiltersProps> = ({
  modelFilter,
  roleFilter,
  onModelFilterChange,
  onRoleFilterChange,
  uniqueModels,
  uniqueRoles
}) => (
  <div className={styles.filtersContainer}>
    <select
      className={styles.filterSelect}
      value={modelFilter}
      onChange={(e) => onModelFilterChange(e.target.value)}
    >
      <option value="">All Models</option>
      {uniqueModels.map(model => (
        <option key={model} value={model}>{model}</option>
      ))}
    </select>
    <select
      className={styles.filterSelect}
      value={roleFilter}
      onChange={(e) => onRoleFilterChange(e.target.value)}
    >
      <option value="">All Roles</option>
      {uniqueRoles.map(role => (
        <option key={role} value={role}>{role}</option>
      ))}
    </select>
  </div>
);

const AgentList = forwardRef<AgentListRef, AgentListProps & { modelFilter?: string; roleFilter?: string }>(
  ({ agents, onCreate, onUpdate, onDelete, modelFilter = '', roleFilter = '' }, ref) => {
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editData, setEditData] = useState<Partial<Agent>>({});

  // Sort and filter agents
  const sortedAndFilteredAgents = useMemo(() => {
    return [...agents]
      .filter(agent => {
        if (modelFilter && agent.modelDisplayName !== modelFilter) return false;
        if (roleFilter && agent.role !== roleFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name);
        if (nameCompare !== 0) return nameCompare;
        return (a.role || '').localeCompare(b.role || '');
      });
  }, [agents, modelFilter, roleFilter]);

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setIsCreating(false);
    setEditData(agent);
  };

  const handleCreate = () => {
    setIsCreating(true);
    setEditingAgent(null);
    setEditData({
      name: '',
      role: '',
      model: '',
      modelDisplayName: '',
      prompt: '',
      avatar: '',
      cost: 1,
      tools: [],
      skills: [],
      compatiblePatterns: [],
      roleDisplayName: '',
      speed: 50,
      precision: 50,
      frugality: 50
    });
  };

  const handleSave = async () => {
    if (isCreating && onCreate) {
      await onCreate(editData);
    } else if (onUpdate && editingAgent) {
      await onUpdate(editingAgent.id, editData);
    }
    setEditingAgent(null);
    setIsCreating(false);
    setEditData({});
  };

  const handleCancel = () => {
    setEditingAgent(null);
    setIsCreating(false);
    setEditData({});
  };

  const handleDelete = async (id: string) => {
    if (onDelete && confirm('Are you sure you want to delete this agent?')) {
      await onDelete(id);
    }
  };

  useImperativeHandle(ref, () => ({
    openCreateModal: handleCreate
  }));

  return (
    <>
      <div className={styles.agentListContainer}>
        {sortedAndFilteredAgents.map((agent) => {
          const modelColor = agent.modelDisplayName ? getModelColor(agent.modelDisplayName) : undefined;
          return (
          <div 
            key={agent.id} 
            className={styles.agentCard}
            style={modelColor ? { borderLeftColor: modelColor } : undefined}
          >
            <img
              src={agent.avatar || '/avatars/default.png'}
              alt={agent.name}
              className={styles.agentAvatar}
              onError={(e) => { (e.target as HTMLImageElement).src = '/avatars/default.png'; }}
            />
            
            <div className={styles.agentInfo}>
              <div className={styles.agentNameRow}>
                {agent.role && (
                  <span 
                    className={styles.roleBadge}
                    style={{ background: getRoleColor(agent.role) }}
                  >
                    {agent.role}
                  </span>
                )}
                {agent.modelDisplayName && (
                  <span 
                    className={styles.modelBadge}
                    style={{ background: getModelColor(agent.modelDisplayName) }}
                  >
                    {agent.modelDisplayName}
                  </span>
                )}
                {agent.cost !== undefined && (
                  <span className={styles.costBadge}>{agent.cost}💎</span>
                )}
                <h3 className={styles.agentName}>{agent.name}</h3>
              </div>
              <p className={styles.agentPrompt}>{agent.prompt || 'No prompt defined'}</p>
            </div>

            <div className={styles.agentStats}>
              <div className={styles.statItem} title="Speed">
                <span className={styles.statIcon}>⚡</span>
                <div className={styles.statBar}>
                  <div className={styles.statFill} style={{ width: `${agent.speed || 0}%`, background: '#38a169' }} />
                </div>
              </div>
              <div className={styles.statItem} title="Precision">
                <span className={styles.statIcon}>🎯</span>
                <div className={styles.statBar}>
                  <div className={styles.statFill} style={{ width: `${agent.precision || 0}%`, background: '#3182ce' }} />
                </div>
              </div>
              <div className={styles.statItem} title="Frugality">
                <span className={styles.statIcon}>💰</span>
                <div className={styles.statBar}>
                  <div className={styles.statFill} style={{ width: `${agent.frugality || 0}%`, background: '#805ad5' }} />
                </div>
              </div>
            </div>

            <div className={styles.agentMeta}>
              {agent.compatiblePatterns && agent.compatiblePatterns.length > 0 && (
                <div className={styles.patternTags}>
                  {agent.compatiblePatterns.slice(0, 3).map(p => (
                    <span key={p} className={styles.patternTag}>{p}</span>
                  ))}
                </div>
              )}
              {agent.skills && agent.skills.length > 0 && (
                <div className={styles.skillTags}>
                  {agent.skills.slice(0, 3).map(s => (
                    <span key={s} className={styles.skillTag}>{s}</span>
                  ))}
                </div>
              )}
              {agent.tools && agent.tools.length > 0 && (
                <span className={styles.toolCount} title={agent.tools.join(', ')}>
                  🔧{agent.tools.length}
                </span>
              )}
            </div>

            <div className={styles.agentActions}>
              <button className={styles.actionBtn} onClick={() => handleEdit(agent)}>
                Edit
              </button>
              <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={() => handleDelete(agent.id)}>
                Delete
              </button>
            </div>
          </div>
        )})}
      </div>

      {(editingAgent || isCreating) && (
        <div
          onClick={handleCancel}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="fantasy-card"
            style={{
              maxWidth: '600px',
              width: '90%',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#f4a261', margin: 0 }}>{isCreating ? 'Create New Agent' : 'Edit Agent'}</h2>
              <button
                onClick={handleCancel}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#f4a261',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0',
                  lineHeight: '1'
                }}
              >
                ×
              </button>
            </div>

            <div className="fantasy-form-group">
              <label className="fantasy-form-label">Name</label>
              <input
                className="fantasy-form-input"
                value={editData.name || ''}
                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
              />
            </div>

            <div className="fantasy-form-group">
              <label className="fantasy-form-label">Role</label>
              <input
                className="fantasy-form-input"
                value={editData.role || ''}
                onChange={(e) => setEditData({ ...editData, role: e.target.value })}
              />
            </div>

            <div className="fantasy-form-group">
              <label className="fantasy-form-label">Role Display Name</label>
              <input
                className="fantasy-form-input"
                value={editData.roleDisplayName || ''}
                onChange={(e) => setEditData({ ...editData, roleDisplayName: e.target.value })}
              />
            </div>

            <div className="fantasy-form-group">
              <label className="fantasy-form-label">Model ID</label>
              <input
                className="fantasy-form-input"
                value={editData.model || ''}
                onChange={(e) => setEditData({ ...editData, model: e.target.value })}
              />
            </div>

            <div className="fantasy-form-group">
              <label className="fantasy-form-label">Model Display Name</label>
              <input
                className="fantasy-form-input"
                value={editData.modelDisplayName || ''}
                onChange={(e) => setEditData({ ...editData, modelDisplayName: e.target.value })}
              />
            </div>

            <div className="fantasy-form-group">
              <label className="fantasy-form-label">Avatar URL</label>
              <input
                className="fantasy-form-input"
                value={editData.avatar || ''}
                onChange={(e) => setEditData({ ...editData, avatar: e.target.value })}
              />
            </div>

            <div className="fantasy-form-group">
              <label className="fantasy-form-label">Cost (credits)</label>
              <input
                className="fantasy-form-input"
                type="number"
                value={editData.cost || 0}
                onChange={(e) => setEditData({ ...editData, cost: parseInt(e.target.value) })}
              />
            </div>

            <div className="fantasy-form-group">
              <label className="fantasy-form-label">Speed (0-100)</label>
              <input
                className="fantasy-form-input"
                type="number"
                min="0"
                max="100"
                value={editData.speed || 50}
                onChange={(e) => setEditData({ ...editData, speed: parseInt(e.target.value) })}
              />
            </div>

            <div className="fantasy-form-group">
              <label className="fantasy-form-label">Precision (0-100)</label>
              <input
                className="fantasy-form-input"
                type="number"
                min="0"
                max="100"
                value={editData.precision || 50}
                onChange={(e) => setEditData({ ...editData, precision: parseInt(e.target.value) })}
              />
            </div>

            <div className="fantasy-form-group">
              <label className="fantasy-form-label">Frugality (0-100)</label>
              <input
                className="fantasy-form-input"
                type="number"
                min="0"
                max="100"
                value={editData.frugality || 50}
                onChange={(e) => setEditData({ ...editData, frugality: parseInt(e.target.value) })}
              />
            </div>

            <div className="fantasy-form-group">
              <label className="fantasy-form-label">Prompt</label>
              <textarea
                className="fantasy-form-input"
                value={editData.prompt || ''}
                onChange={(e) => setEditData({ ...editData, prompt: e.target.value })}
                rows={4}
              />
            </div>

            <div className="fantasy-form-group">
              <label className="fantasy-form-label">Tools (comma-separated)</label>
              <input
                className="fantasy-form-input"
                value={editData.tools?.join(', ') || ''}
                onChange={(e) => setEditData({ ...editData, tools: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
              />
            </div>

            <div className="fantasy-form-group">
              <label className="fantasy-form-label">Skills (comma-separated)</label>
              <input
                className="fantasy-form-input"
                value={editData.skills?.join(', ') || ''}
                onChange={(e) => setEditData({ ...editData, skills: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              />
            </div>

            <div className="fantasy-form-group">
              <label className="fantasy-form-label">Compatible Patterns (comma-separated)</label>
              <input
                className="fantasy-form-input"
                value={editData.compatiblePatterns?.join(', ') || ''}
                onChange={(e) => setEditData({ ...editData, compatiblePatterns: e.target.value.split(',').map(p => p.trim()).filter(Boolean) })}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button className={styles.actionBtn} onClick={handleSave}>Save</button>
              <button className={styles.actionBtn} onClick={handleCancel}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

AgentList.displayName = 'AgentList';

export default AgentList;
export type { AgentListProps };

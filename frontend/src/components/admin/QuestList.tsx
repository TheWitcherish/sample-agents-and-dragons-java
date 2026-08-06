import React, { useState, forwardRef, useImperativeHandle } from 'react';
import styles from './PatternRuntimeMapping.module.css';
import FantasyButton from '../common/FantasyButton';

interface Quest {
  id: string;
  name?: string;
  prompt?: string;
  mandatoryAgentRoles?: string[];
  authorizedAgentList?: string[];
  authorizedPatternList?: Array<{ name?: string; runtime?: string }>;
  teamDirectionSamples?: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface QuestListProps {
  quests: Quest[];
  onCreate?: (data: Partial<Quest>) => Promise<unknown>;
  onUpdate?: (id: string, data: Partial<Quest>) => Promise<unknown>;
  onDelete?: (id: string) => Promise<void>;
}

export interface QuestListRef {
  openCreateModal: () => void;
}

const QuestList = forwardRef<QuestListRef, QuestListProps>(({ quests, onCreate, onUpdate, onDelete }, ref) => {
  const [editingQuest, setEditingQuest] = useState<Quest | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editData, setEditData] = useState<Partial<Quest>>({});

  const handleEdit = (quest: Quest) => {
    setEditingQuest(quest);
    setIsCreating(false);
    setEditData(quest);
  };

  const handleCreate = () => {
    setIsCreating(true);
    setEditingQuest(null);
    setEditData({
      name: '',
      prompt: '',
      mandatoryAgentRoles: [],
      authorizedAgentList: [],
      authorizedPatternList: [],
      teamDirectionSamples: []
    });
  };

  const handleSave = async () => {
    if (isCreating && onCreate) {
      await onCreate(editData);
    } else if (onUpdate && editingQuest) {
      await onUpdate(editingQuest.id, editData);
    }
    setEditingQuest(null);
    setIsCreating(false);
    setEditData({});
  };

  const handleCancel = () => {
    setEditingQuest(null);
    setIsCreating(false);
    setEditData({});
  };

  const handleDelete = async (id: string) => {
    if (onDelete && confirm('Are you sure you want to delete this quest?')) {
      await onDelete(id);
    }
  };

  useImperativeHandle(ref, () => ({
    openCreateModal: handleCreate
  }));

  return (
    <>
      <div className={styles.patternRuntimeMapping}>
        <div className={styles.mappingGrid}>
          {quests.map((quest) => (
            <div key={quest.id} className={styles.mappingRow}>
              <div className={styles.patternInfo} style={{ flexDirection: 'column', gap: '8px', color: '#000' }}>
                <div><strong>Name:</strong> {quest.name}</div>
                <div><strong>Prompt:</strong> {quest.prompt}</div>
                <div><strong>Mandatory Agent Roles:</strong> {quest.mandatoryAgentRoles?.join(', ') || 'None'}</div>
                <div><strong>Authorized Agent List:</strong> {quest.authorizedAgentList?.join(', ') || 'None'}</div>
                <div><strong>Authorized Pattern List:</strong> {quest.authorizedPatternList?.map(p => typeof p === 'object' ? p.name : p).join(', ') || 'None'}</div>
                <div><strong>Team Direction Samples:</strong> {quest.teamDirectionSamples?.join(', ') || 'None'}</div>
                <div><strong>Created:</strong> {quest.createdAt ? new Date(quest.createdAt).toLocaleString() : 'N/A'}</div>
                <div><strong>Updated:</strong> {quest.updatedAt ? new Date(quest.updatedAt).toLocaleString() : 'N/A'}</div>
              </div>
              <div className={styles.runtimeSelect} style={{ flexDirection: 'column', gap: '8px' }}>
                <FantasyButton onClick={() => handleEdit(quest)}>Edit</FantasyButton>
                <FantasyButton onClick={() => handleDelete(quest.id)}>Delete</FantasyButton>
              </div>
            </div>
          ))}
        </div>
      </div>

      {(editingQuest || isCreating) && (
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
              <h2 style={{ color: '#f4a261', margin: 0 }}>{isCreating ? 'Create New Quest' : 'Edit Quest'}</h2>
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
              <label className="fantasy-form-label">Prompt</label>
              <textarea
                className="fantasy-form-input"
                value={editData.prompt || ''}
                onChange={(e) => setEditData({ ...editData, prompt: e.target.value })}
                rows={6}
              />
            </div>

            <div className="fantasy-form-group">
              <label className="fantasy-form-label">Mandatory Agent Roles (comma-separated)</label>
              <input
                className="fantasy-form-input"
                value={editData.mandatoryAgentRoles?.join(', ') || ''}
                onChange={(e) => setEditData({ ...editData, mandatoryAgentRoles: e.target.value.split(',').map(r => r.trim()).filter(Boolean) })}
              />
            </div>

            <div className="fantasy-form-group">
              <label className="fantasy-form-label">Authorized Agent List (comma-separated)</label>
              <input
                className="fantasy-form-input"
                value={editData.authorizedAgentList?.join(', ') || ''}
                onChange={(e) => setEditData({ ...editData, authorizedAgentList: e.target.value.split(',').map(a => a.trim()).filter(Boolean) })}
              />
            </div>

            <div className="fantasy-form-group">
              <label className="fantasy-form-label">Authorized Pattern List</label>
              <div style={{ border: '1px solid #2a9d8f', borderRadius: '5px', padding: '10px', background: 'rgba(26, 26, 46, 0.5)' }}>
                {editData.authorizedPatternList?.map((pattern, index) => (
                  <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                    <input
                      className="fantasy-form-input"
                      placeholder="Pattern name"
                      value={pattern?.name || ''}
                      onChange={(e) => {
                        const newList = [...(editData.authorizedPatternList || [])];
                        newList[index] = { ...newList[index], name: e.target.value };
                        setEditData({ ...editData, authorizedPatternList: newList });
                      }}
                      style={{ flex: 1 }}
                    />
                    <input
                      className="fantasy-form-input"
                      placeholder="Runtime"
                      value={pattern?.runtime || ''}
                      onChange={(e) => {
                        const newList = [...(editData.authorizedPatternList || [])];
                        newList[index] = { ...newList[index], runtime: e.target.value };
                        setEditData({ ...editData, authorizedPatternList: newList });
                      }}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newList = editData.authorizedPatternList?.filter((_, i) => i !== index) || [];
                        setEditData({ ...editData, authorizedPatternList: newList });
                      }}
                      style={{ background: '#e63946', color: 'white', border: 'none', borderRadius: '3px', padding: '5px 10px', cursor: 'pointer' }}
                    >
                      Remove
                    </button>
                  </div>
                )) || []}
                <button
                  type="button"
                  onClick={() => {
                    const newList = [...(editData.authorizedPatternList || []), { name: '', runtime: '' }];
                    setEditData({ ...editData, authorizedPatternList: newList });
                  }}
                  style={{ background: '#2a9d8f', color: 'white', border: 'none', borderRadius: '3px', padding: '5px 10px', cursor: 'pointer' }}
                >
                  Add Pattern
                </button>
              </div>
            </div>

            <div className="fantasy-form-group">
              <label className="fantasy-form-label">Team Direction Samples (comma-separated)</label>
              <input
                className="fantasy-form-input"
                value={editData.teamDirectionSamples?.join(', ') || ''}
                onChange={(e) => setEditData({ ...editData, teamDirectionSamples: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <FantasyButton onClick={handleSave}>Save</FantasyButton>
              <FantasyButton onClick={handleCancel}>Cancel</FantasyButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

QuestList.displayName = 'QuestList';

export default QuestList;
export type { QuestListProps };

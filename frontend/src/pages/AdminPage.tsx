import { useNavigate } from "react-router-dom";
import { useState, useRef, useMemo } from "react";

import { useAgentRuntimes } from "../hooks/useAgentRuntimes";
import { useAgents, useQuests } from "../hooks/useAmplifyData";
import AgentRuntimeCard from "../components/admin/AgentRuntimeCard";
import PatternRuntimeMapping from "../components/admin/PatternRuntimeMapping";
import AgentList, { type AgentListRef, AgentFilters } from "../components/admin/AgentList";
import QuestList, { type QuestListRef } from "../components/admin/QuestList";
import LoadingSpinner from "../components/common/LoadingSpinner";
import FantasyButton from "../components/common/FantasyButton";
import { agentsInitialData, questsInitialData } from "../utils/initData";


const AdminPage = () => {
  const { agentRuntimes, loading, error } = useAgentRuntimes();
  const { agents, loading: agentsLoading, createAgent, updateAgent, deleteAgent } = useAgents();
  const { quests, loading: questsLoading, createQuest, updateQuest, deleteQuest } = useQuests();
  const navigate = useNavigate();

  const [loadingAgents, setLoadingAgents] = useState(false);
  const [loadingQuests, setLoadingQuests] = useState(false);
  const [uploadMode, setUploadMode] = useState<'erase' | 'update'>('update');
  const [uploading, setUploading] = useState(false);
  const [modelFilter, setModelFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const agentListRef = useRef<AgentListRef>(null);
  const questListRef = useRef<QuestListRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get unique models and roles for filters
  const uniqueModels = useMemo(() => 
    [...new Set(agents.map(a => a.modelDisplayName).filter(Boolean))].sort() as string[],
    [agents]
  );
  const uniqueRoles = useMemo(() => 
    [...new Set(agents.map(a => a.role).filter(Boolean))].sort() as string[],
    [agents]
  );



  const handleLoadAgents = async () => {
    setLoadingAgents(true);
    try {
      for (const agentData of agentsInitialData) {
        await createAgent(agentData);
      }
      console.log('Agents loaded successfully');
    } catch (error) {
      console.error('Failed to load agents:', error);
    } finally {
      setLoadingAgents(false);
    }
  };

  const handleLoadQuests = async () => {
    setLoadingQuests(true);
    try {
      for (const questData of questsInitialData) {
        await createQuest(questData);
      }
      console.log('Quests loaded successfully');
    } catch (error) {
      console.error('Failed to load quests:', error);
    } finally {
      setLoadingQuests(false);
    }
  };

  const handleDownloadConfiguration = () => {
    const configuration = {
      agents: agents.map(agent => ({
        // Core properties
        name: agent.name,
        prompt: agent.prompt,
        model: agent.model,
        tools: agent.tools,
        role: agent.role,
        
        // Display properties
        avatar: agent.avatar,
        roleDisplayName: agent.roleDisplayName,
        skills: agent.skills,
        modelDisplayName: agent.modelDisplayName,
        speed: agent.speed,
        precision: agent.precision,
        frugality: agent.frugality,
        
        // Filtering properties
        compatiblePatterns: agent.compatiblePatterns,
        cost: agent.cost,
        
        // Automatic properties (read-only)
        id: agent.id,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt
      })),
      quests: quests.map(quest => ({
        // Core properties
        name: quest.name,
        prompt: quest.prompt,
        
        // Filtering properties
        mandatoryAgentRoles: quest.mandatoryAgentRoles,
        authorizedAgentList: quest.authorizedAgentList,
        authorizedPatternList: quest.authorizedPatternList,
        
        // Display properties
        teamDirectionSamples: quest.teamDirectionSamples,
        
        // Automatic properties (read-only)
        id: quest.id,
        createdAt: quest.createdAt,
        updatedAt: quest.updatedAt
      }))
    };
    
    const dataStr = JSON.stringify(configuration, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agents-quests-config-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleUploadConfiguration = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const text = await file.text();
      const config = JSON.parse(text);
      
      if (uploadMode === 'erase') {
        // Delete all existing agents and quests
        await Promise.all(agents.map(agent => deleteAgent(agent.id)));
        await Promise.all(quests.map(quest => deleteQuest(quest.id)));
        
        // Create new ones
        if (config.agents) {
          for (const agentData of config.agents) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...cleanData } = agentData;
            await createAgent(cleanData);
          }
        }
        if (config.quests) {
          for (const questData of config.quests) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...cleanData } = questData;
            await createQuest(cleanData);
          }
        }
      } else {
        // Update existing mode
        if (config.agents) {
          for (const agentData of config.agents) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...cleanData } = agentData;
            const existing = agents.find(a => a.name === agentData.name);
            if (existing) {
              await updateAgent(existing.id, cleanData);
            } else {
              await createAgent(cleanData);
            }
          }
        }
        if (config.quests) {
          for (const questData of config.quests) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...cleanData } = questData;
            const existing = quests.find(q => q.name === questData.name);
            if (existing) {
              await updateQuest(existing.id, cleanData);
            } else {
              await createQuest(cleanData);
            }
          }
        }
      }
      
      console.log('Configuration uploaded successfully');
    } catch (error) {
      console.error('Failed to upload configuration:', error);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };



  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>Error</h2>
        <p>Sorry, this page is not currently available.</p>
      </div>      
    );
  }

  return (
    <div className="fantasy-main-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: '1400px', marginBottom: '20px' }}>
        <FantasyButton onClick={() => navigate('/')}>← Back</FantasyButton>
        <h1 className="fantasy-page-title" style={{ margin: 0 }}>⚙️ Admin Panel ⚙️</h1>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select 
            value={uploadMode} 
            onChange={(e) => setUploadMode(e.target.value as 'erase' | 'update')}
            style={{ 
              padding: '8px', 
              borderRadius: '5px', 
              border: '2px solid #2a9d8f', 
              background: 'rgba(26, 26, 46, 0.8)', 
              color: '#f4a261' 
            }}
          >
            <option value="update">Update existing</option>
            <option value="erase">Erase existing</option>
          </select>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleUploadConfiguration}
            style={{ display: 'none' }}
          />
          <FantasyButton 
            onClick={() => fileInputRef.current?.click()} 
            disabled={uploading}
            size="small"
          >
            {uploading ? 'Uploading...' : '📁 Upload'}
          </FantasyButton>
          <FantasyButton onClick={handleDownloadConfiguration} size="small">
            📥 Download
          </FantasyButton>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', width: '100%' }}>


        {agentRuntimes.length > 0 && (
          <div style={{ marginBottom: '30px' }}>
            <PatternRuntimeMapping agentRuntimes={agentRuntimes} />
          </div>
        )}

        {agentRuntimes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', background: 'rgba(26, 26, 46, 0.8)', borderRadius: '10px', border: '2px solid #2a9d8f', marginBottom: '30px' }}>
            <h2 style={{ color: '#f4a261' }}>No Agent Runtimes</h2>
            <p>No agent runtimes found in your account.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '30px' }}>
            {agentRuntimes.map((agentRuntime) => (
              <AgentRuntimeCard 
                key={agentRuntime.agentRuntimeId} 
                agentRuntime={agentRuntime}
              />
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h2 className="fantasy-form-label" style={{ marginBottom: 0 }}>Agents</h2>
            <AgentFilters
              modelFilter={modelFilter}
              roleFilter={roleFilter}
              onModelFilterChange={setModelFilter}
              onRoleFilterChange={setRoleFilter}
              uniqueModels={uniqueModels}
              uniqueRoles={uniqueRoles}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <FantasyButton onClick={() => agentListRef.current?.openCreateModal()}>
              Create New Agent
            </FantasyButton>
            <FantasyButton onClick={handleLoadAgents} disabled={loadingAgents}>
              {loadingAgents ? 'Loading...' : 'Load Initial Data'}
            </FantasyButton>
          </div>
        </div>
        {agentsLoading ? (
          <LoadingSpinner />
        ) : agents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', background: 'rgba(26, 26, 46, 0.8)', borderRadius: '10px', border: '2px solid #2a9d8f', marginBottom: '30px' }}>
            <p>No agents found.</p>
          </div>
        ) : (
          <div style={{ marginBottom: '30px' }}>
            <AgentList ref={agentListRef} agents={agents} onCreate={createAgent} onUpdate={updateAgent} onDelete={deleteAgent} modelFilter={modelFilter} roleFilter={roleFilter} />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2 className="fantasy-form-label" style={{ marginBottom: 0 }}>Quests</h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <FantasyButton onClick={() => questListRef.current?.openCreateModal()}>
              Create New Quest
            </FantasyButton>
            <FantasyButton onClick={handleLoadQuests} disabled={loadingQuests}>
              {loadingQuests ? 'Loading...' : 'Load Initial Data'}
            </FantasyButton>
          </div>
        </div>
        {questsLoading ? (
          <LoadingSpinner />
        ) : quests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', background: 'rgba(26, 26, 46, 0.8)', borderRadius: '10px', border: '2px solid #2a9d8f' }}>
            <p>No quests found.</p>
          </div>
        ) : (
          <QuestList ref={questListRef} quests={quests} onCreate={createQuest} onUpdate={updateQuest} onDelete={deleteQuest} />
        )}
      </div>
    </div>
  );
};

export default AdminPage;
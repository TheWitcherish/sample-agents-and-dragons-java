import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects } from '../hooks/useAmplifyData';
import { useAgentRuntime } from '../hooks/useAgentRuntime';
import { useToastContext } from '../contexts/ToastContext';
import FantasyButton from '../components/common/FantasyButton';
import type { TeamPattern, AgentConnection, AgentVisualPosition, Project } from '../types';

const DirectionsPage: React.FC = () => {
  const navigate = useNavigate();
  const { createProject } = useProjects();
  const { invokeAgentRuntime } = useAgentRuntime();
  const toast = useToastContext();
  const [directions, setDirections] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [samples, setSamples] = useState<string[]>([]);

  useEffect(() => {
    const quest = JSON.parse(sessionStorage.getItem('selectedQuest') || '{}');
    if (quest.teamDirectionSamples) {
      setSamples(quest.teamDirectionSamples);
    }
  }, []);

  const handleSampleClick = (sample: string) => {
    setDirections(prev => prev ? `${prev}\n${sample}` : sample);
    setShowModal(false);
  };

  const handleComplete = async () => {
    const quest = JSON.parse(sessionStorage.getItem('selectedQuest') || '{}');
    const teamData = JSON.parse(sessionStorage.getItem('teamData') || '{}');
    
    if (!quest.id || !teamData.teamPattern) {
      toast.error('Missing data', 'Please start from the beginning.');
      navigate('/');
      return;
    }

    setLoading(true);
    try {
      const generatedOwnerKey = `owner_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const project = await createProject({
        ownerKey: generatedOwnerKey,
        name: quest.name,
        prompt: directions.trim() ? `${quest.prompt}\n\nAdditional directions: ${directions}` : quest.prompt,
        teamName: teamData.teamName,
        teamPattern: teamData.teamPattern as TeamPattern,
        teamEntrypoint: teamData.entryPointAgentId || teamData.selectedAgents[0]?.id || '',
        agents: teamData.selectedAgents.map((a: { id: string }) => a.id),
        agentsConnections: teamData.connections as AgentConnection[],
        agentsVisualPositions: teamData.visualPositions as AgentVisualPosition[],
      });

      if (project) {
        sessionStorage.setItem('createdProject', JSON.stringify(project));
        sessionStorage.setItem('ownerKey', generatedOwnerKey);
        
        toast.success('Project created!', `"${quest.name}" is ready.`);
        
        await invokeAgentRuntime(project as Project);
        toast.success('Project running!', 'Your AI team is now active.');
        
        navigate(`/qrcode/${project.id}`);
      }
    } catch (err) {
      console.error('Failed to create project:', err);
      toast.error('Failed to create project', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fantasy-main-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: '1200px', marginBottom: '20px' }}>
        <FantasyButton onClick={() => navigate(-1)}>← Back</FantasyButton>
        <h1 className="fantasy-page-title" style={{ margin: 0 }}>📝 Team Directions 📝</h1>
        <FantasyButton onClick={handleComplete} disabled={loading}>
          {loading ? 'Creating...' : 'Next →'}
        </FantasyButton>
      </div>
      
      <div style={{ maxWidth: '1200px', width: '100%' }}>
        <div className="fantasy-form-group">
          <label className="fantasy-form-label">
            Add any special instructions or requirements for your team:
          </label>
          <textarea
            value={directions}
            onChange={(e) => setDirections(e.target.value)}
            placeholder="Enter additional directions for your AI team..."
            style={{
              width: '100%',
              height: '200px',
              padding: '20px',
              border: '2px solid #2a9d8f',
              borderRadius: '10px',
              background: 'rgba(26, 26, 46, 0.8)',
              color: '#f4f1de',
              fontFamily: 'Cinzel, serif',
              fontSize: '1rem',
              resize: 'vertical'
            }}
          />
          {samples.length > 0 && (
            <div style={{ marginTop: '10px', textAlign: 'center' }}>
              <button
                onClick={() => setShowModal(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#e76f51',
                  cursor: 'pointer',
                  fontSize: '1.4rem',
                  textDecoration: 'underline',
                  fontFamily: 'Cinzel, serif',
                  fontWeight: 'bold'
                }}
              >
                No ideas? Try these examples...
              </button>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div
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
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: 'rgba(26, 26, 46, 0.95)',
              border: '2px solid #2a9d8f',
              borderRadius: '15px',
              padding: '30px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: '#f4f1de', fontFamily: 'Cinzel, serif', marginBottom: '20px', textAlign: 'center' }}>
              💡 Direction Suggestions
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {samples.map((sample, index) => (
                <button
                  key={index}
                  onClick={() => handleSampleClick(sample)}
                  style={{
                    padding: '15px 20px',
                    background: 'rgba(42, 157, 143, 0.2)',
                    border: '2px solid #2a9d8f',
                    borderRadius: '10px',
                    color: '#f4f1de',
                    fontFamily: 'Cinzel, serif',
                    fontSize: '1rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(42, 157, 143, 0.4)';
                    e.currentTarget.style.transform = 'translateX(5px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(42, 157, 143, 0.2)';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  {sample}
                </button>
              ))}
            </div>
            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <FantasyButton onClick={() => setShowModal(false)}>Close</FantasyButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DirectionsPage;

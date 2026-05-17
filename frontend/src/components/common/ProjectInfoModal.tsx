import React from 'react';
import QRCode from 'react-qr-code';
import type { Agent, Project } from '../../types';

interface ProjectInfoModalProps {
  project: Project;
  agents: Agent[];
  onClose: () => void;
}

const ProjectInfoModal: React.FC<ProjectInfoModalProps> = ({ project, agents, onClose }) => {
  if (!project) return null;

  console.log('Project data:', project);
  console.log('Team prompt:', project.teamPrompt);
  
  const entryPointAgent = agents.find(a => a.id === project.teamEntrypoint);

  return (
    <div
      onClick={onClose}
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
          maxHeight: '80vh',
          overflowY: 'auto'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
          <div>
            <h2 style={{ color: '#f4a261', margin: 0 }}>⚔️ {project.name}</h2>
            <div style={{ fontSize: '1rem', marginTop: '5px', color: '#2a9d8f' }}>Team "{project.teamName}"</div>
          </div>
          <button
            onClick={onClose}
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
        
        <div style={{ marginBottom: '15px' }}>
          <strong style={{ color: '#f4a261' }}>Quest Prompt:</strong>
          <div style={{ marginTop: '5px', padding: '10px', background: 'rgba(26, 26, 46, 0.5)', borderRadius: '5px', fontSize: '0.9rem' }}>
            {project.prompt}
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <strong style={{ color: '#f4a261' }}>Team Pattern:</strong> {project.teamPattern}
        </div>

        <div style={{ marginBottom: '15px' }}>
          <strong style={{ color: '#f4a261' }}>Team Prompt:</strong>
          <div style={{ marginTop: '5px', padding: '10px', background: 'rgba(26, 26, 46, 0.5)', borderRadius: '5px', fontSize: '0.9rem' }}>
            {project.teamPrompt || 'No team prompt specified'}
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <strong style={{ color: '#f4a261' }}>Entry Point Agent:</strong>
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {entryPointAgent?.avatar && (
              <img src={entryPointAgent.avatar} alt={entryPointAgent.name} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
            )}
            <div>
              <div style={{ fontWeight: '600', color: '#f4a261' }}>{entryPointAgent?.name || 'Unknown Agent'}</div>
              <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>{entryPointAgent?.roleDisplayName || entryPointAgent?.role}</div>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <strong style={{ color: '#f4a261' }}>Team Agents ({agents.length}):</strong>
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {agents.map((agent) => (
              <div key={agent.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', background: 'rgba(42, 157, 143, 0.2)', borderRadius: '8px' }}>
                {agent.avatar ? (
                  <img src={agent.avatar} alt={agent.name} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ fontSize: '1.5rem' }}>🤖</div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{agent.name}</div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>{agent.roleDisplayName || agent.role}</div>
                </div>
                {agent.id === project.teamEntrypoint && (
                  <div style={{ fontSize: '1.2rem', color: '#FFD700' }}>👑</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '15px', borderTop: '2px solid #2a9d8f' }}>
          <strong style={{ color: '#f4a261', marginBottom: '10px' }}>📱 Mobile Access</strong>
          <div style={{ background: 'white', padding: '15px', borderRadius: '10px' }}>
            <QRCode value={`${window.location.origin}/project/${project.id}/mobile?ownerKey=${sessionStorage.getItem('ownerKey') || ''}`} size={150} />
          </div>
          <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#f4a261', marginTop: '10px' }}>
            Scan to follow on mobile
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProjectInfoModal;
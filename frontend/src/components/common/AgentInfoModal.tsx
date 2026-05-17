import React from 'react';
import type { Agent } from '../../types';

interface AgentInfoModalProps {
  agent: Agent | null;
  onClose: () => void;
}

const AgentInfoModal: React.FC<AgentInfoModalProps> = ({ agent, onClose }) => {
  if (!agent) return null;

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
          maxWidth: '500px',
          width: '90%',
          maxHeight: '80vh',
          overflowY: 'auto'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            {agent.avatar ? (
              <img src={agent.avatar} alt={agent.name} style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div style={{ fontSize: '3rem' }}>🤖</div>
            )}
            <div>
              <h2 style={{ color: '#f4a261', margin: 0 }}>{agent.name}</h2>
              <div style={{ fontSize: '1rem', marginTop: '5px' }}>{agent.roleDisplayName || agent.role}</div>
            </div>
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
          <strong style={{ color: '#f4a261' }}>Performance:</strong>
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚡</span>
              <span style={{ fontSize: '0.9rem', width: '80px' }}>Speed</span>
              <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.2)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${agent.speed || 0}%`, height: '100%', background: '#fbbf24', borderRadius: '4px' }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🎯</span>
              <span style={{ fontSize: '0.9rem', width: '80px' }}>Precision</span>
              <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.2)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${agent.precision || 0}%`, height: '100%', background: '#10b981', borderRadius: '4px' }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>💰</span>
              <span style={{ fontSize: '0.9rem', width: '80px' }}>Frugality</span>
              <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.2)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${agent.frugality || 0}%`, height: '100%', background: '#3b82f6', borderRadius: '4px' }} />
              </div>
            </div>
          </div>
        </div>
        <div style={{ marginBottom: '15px' }}>
          <strong style={{ color: '#f4a261' }}>Cost:</strong> 💎 {agent.cost}
        </div>
        <div style={{ marginBottom: '15px' }}>
          <strong style={{ color: '#f4a261' }}>Model:</strong> {agent.modelDisplayName || agent.model}
        </div>
        <div style={{ marginBottom: '15px' }}>
          <strong style={{ color: '#f4a261' }}>Prompt:</strong>
          <div style={{ marginTop: '5px', padding: '10px', background: 'rgba(26, 26, 46, 0.5)', borderRadius: '5px', fontSize: '0.9rem' }}>
            {agent.prompt}
          </div>
        </div>
        {agent.skills && agent.skills.length > 0 && (
          <div style={{ marginBottom: '15px' }}>
            <strong style={{ color: '#f4a261' }}>Skills:</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
              {agent.skills.map((skill, idx) => (
                <span
                  key={idx}
                  style={{
                    padding: '4px 10px',
                    background: 'rgba(42, 157, 143, 0.3)',
                    border: '1px solid #2a9d8f',
                    borderRadius: '12px',
                    fontSize: '0.85rem'
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}
        {agent.compatiblePatterns && agent.compatiblePatterns.length > 0 && (
          <div>
            <strong style={{ color: '#f4a261' }}>Compatible Patterns:</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
              {agent.compatiblePatterns.map((pattern, idx) => (
                <span
                  key={idx}
                  style={{
                    padding: '4px 10px',
                    background: 'rgba(244, 162, 97, 0.3)',
                    border: '1px solid #f4a261',
                    borderRadius: '12px',
                    fontSize: '0.85rem'
                  }}
                >
                  {pattern}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentInfoModal;
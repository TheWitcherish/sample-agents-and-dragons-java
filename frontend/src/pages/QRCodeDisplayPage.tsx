import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { useProject } from '../hooks/useAmplifyData';
import FantasyButton from '../components/common/FantasyButton';
import LoadingSpinner from '../components/common/LoadingSpinner';
import type { ProjectStatus } from '../types';

const QRCodeDisplayPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const ownerKey = sessionStorage.getItem('ownerKey') || '';
  const cachedProject = JSON.parse(sessionStorage.getItem('createdProject') || '{}');
  const { project: liveProject } = useProject(projectId, ownerKey);
  
  const project = liveProject || cachedProject;
  
  if (!project.id) {
    return <LoadingSpinner />;
  }
  const url = `${window.location.origin}/project/${project.id}/mobile?ownerKey=${ownerKey}`;

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'IN_PROGRESS': return '#f4a261';
      case 'COMPLETED': return '#4ade80';
      case 'ON_ERROR': return '#ef4444';
      default: return '#f4f1de';
    }
  };

  return (
    <div className="fantasy-main-content">
      <h1 className="fantasy-page-title">🔮 Your Quest Portal 🔮</h1>
      
      <div style={{ marginBottom: '30px' }}>
        <FantasyButton onClick={() => navigate(`/project/${projectId}/run?ownerKey=${ownerKey}`)}>
          Follow Your Team Adventure →
        </FantasyButton>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', maxWidth: '1400px', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '15px', marginBottom: '20px' }}>
            <QRCode value={url} size={200} />
          </div>
          <p style={{ textAlign: 'center', fontSize: '0.9rem', color: '#f4a261' }}>
            Scan to follow your adventure
          </p>
        </div>

        <div className="fantasy-card">
          <h2 style={{ color: '#f4a261', marginBottom: '15px' }}>Quest Details</h2>
          <div style={{ marginBottom: '15px' }}>
            <strong style={{ color: '#f4a261' }}>Name:</strong> {project.name}
          </div>
          <div style={{ marginBottom: '15px' }}>
            <strong style={{ color: '#f4a261' }}>Team:</strong> {project.teamName || 'Unnamed Team'}
          </div>
          <div style={{ marginBottom: '15px' }}>
            <strong style={{ color: '#f4a261' }}>Pattern:</strong> {project.teamPattern}
          </div>
          <div style={{ marginBottom: '15px' }}>
            <strong style={{ color: '#f4a261' }}>Status:</strong>
            <span style={{ 
              marginLeft: '10px',
              padding: '4px 12px', 
              borderRadius: '12px', 
              background: 'rgba(26, 26, 46, 0.5)',
              border: `2px solid ${getStatusColor(project.status)}`,
              color: getStatusColor(project.status),
              fontSize: '0.85rem',
              fontWeight: '600'
            }}>
              {project.status}
            </span>
          </div>
          <div style={{ marginBottom: '15px' }}>
            <strong style={{ color: '#f4a261' }}>URL:</strong>
            <div style={{ 
              fontSize: '0.8rem', 
              wordBreak: 'break-all', 
              background: 'rgba(26, 26, 46, 0.5)', 
              padding: '10px', 
              borderRadius: '5px',
              marginTop: '5px'
            }}>
              {url}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRCodeDisplayPage;

import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useProjectSubscription } from '../hooks/useAmplifyDataForGuest';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { getUrl } from 'aws-amplify/storage';
import { FaGift } from 'react-icons/fa';

const MobileProjectRun: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const ownerKey = searchParams.get('ownerKey') || sessionStorage.getItem('ownerKey') || '';
  const { project, agents, loading } = useProjectSubscription(projectId, ownerKey);
  const [showModal, setShowModal] = useState(false);
  const [resultUrl, setResultUrl] = useState<string>('');

  if (loading) return <LoadingSpinner />;

  const openResult = async () => {
    try {
      const url = await getUrl({ 
        path: `apps/${projectId}/index.html`,
        options: { validateObjectExistence: true }
      });
      setResultUrl(url.url.toString());
    } catch (error) {
      if (error instanceof Error && (error.name === 'NotFound' || error.message?.includes('NotFound'))) {
        setResultUrl('');
      }
    }
    setShowModal(true);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: `
        linear-gradient(135deg, rgba(26, 26, 46, 0.8) 0%, rgba(22, 33, 62, 0.8) 50%, rgba(15, 52, 96, 0.8) 100%),
        url('/fantasy_background.png') center/cover no-repeat fixed
      `,
      padding: '20px',
      fontFamily: "'Cinzel', serif",
      color: '#f4f1de'
    }}>
      {/* Header */}
      <div style={{
        textAlign: 'center',
        marginBottom: '25px',
        padding: '20px',
        background: 'rgba(45, 27, 105, 0.6)',
        borderRadius: '15px',
        border: '2px solid #f4a261'
      }}>
        <div style={{ fontSize: '0.9rem', color: '#f4a261', marginBottom: '8px' }}>
          Team "{project?.teamName || 'Team'}"
        </div>
        <h1 style={{
          fontSize: '1.5rem',
          margin: '0 0 15px 0',
          color: '#f4a261',
          textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)'
        }}>
          ⚔️ {project?.name || 'Quest'} ⚔️
        </h1>
        
        {/* Status & Metrics */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '15px',
          flexWrap: 'wrap',
          fontSize: '0.9rem'
        }}>
          <div style={{
            padding: '6px 12px',
            background: project?.status === 'COMPLETED' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(244, 162, 97, 0.2)',
            borderRadius: '12px',
            border: `1px solid ${project?.status === 'COMPLETED' ? '#4ade80' : '#f4a261'}`,
            color: project?.status === 'COMPLETED' ? '#4ade80' : '#f4a261',
            fontWeight: '600'
          }}>
            {project?.status || 'RUNNING'}
          </div>
        </div>
        
        {project?.status === 'COMPLETED' && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={openResult}
              style={{
                marginTop: '15px',
                background: 'linear-gradient(135deg, #2a9d8f 0%, #264653 100%)',
                border: '2px solid #f4a261',
                borderRadius: '8px',
                color: '#f4f1de',
                cursor: 'pointer',
                padding: '10px 20px',
                fontSize: '1rem',
                fontWeight: 'bold',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <FaGift style={{ fontSize: '1.1rem', color: '#ffd700' }} />
              Open quest final result
            </button>
          </div>
        )}
      </div>

      {/* Agents */}
      <div style={{ marginBottom: '25px' }}>
        <h2 style={{
          fontSize: '1.2rem',
          color: '#f4a261',
          marginBottom: '15px',
          textAlign: 'center'
        }}>
          🛡️ Your Team
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px'
        }}>
          {agents.map(agent => (
            <div key={agent.id} style={{
              background: 'rgba(42, 157, 143, 0.2)',
              border: '2px solid #2a9d8f',
              borderRadius: '12px',
              padding: '12px',
              textAlign: 'center'
            }}>
              {agent.avatar && (
                <img 
                  src={agent.avatar} 
                  alt={agent.name}
                  style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '50%',
                    marginBottom: '8px',
                    border: '2px solid #f4a261'
                  }}
                />
              )}
              <div style={{
                fontSize: '0.85rem',
                fontWeight: '600',
                color: '#f4f1de',
                marginBottom: '4px'
              }}>
                {agent.name}
              </div>
              <div style={{
                fontSize: '0.7rem',
                color: '#2a9d8f'
              }}>
                {agent.role}
              </div>
            </div>
          ))}
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
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              width: '90%',
              height: '90%',
              background: '#fff',
              borderRadius: '10px',
              overflow: 'hidden',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowModal(false)}
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: '#e76f51',
                border: 'none',
                borderRadius: '5px',
                color: '#fff',
                cursor: 'pointer',
                padding: '8px 16px',
                fontSize: '1rem',
                fontWeight: 'bold',
                zIndex: 1001,
              }}
            >
              ✕ Close
            </button>
            {resultUrl ? (
              <iframe
                src={resultUrl}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
                title="Project Result"
              />
            ) : (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                fontSize: '1.5rem',
                color: '#264653',
                textAlign: 'center',
                padding: '40px',
                gap: '30px'
              }}>
                <img 
                  src="/quest-failed.png" 
                  alt="Quest Failed" 
                  style={{ maxWidth: '400px', width: '100%', borderRadius: '10px' }}
                />
                <div>Unfortunately it seems that the team did not succeed to finalize the quest</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileProjectRun;

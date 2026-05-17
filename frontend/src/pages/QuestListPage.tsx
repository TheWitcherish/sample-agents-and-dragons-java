import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects } from '../hooks/useAmplifyData';
import { useAgentRuntime } from '../hooks/useAgentRuntime';
import { useToastContext } from '../contexts/ToastContext';
import FantasyButton from '../components/common/FantasyButton';
import LoadingSpinner from '../components/common/LoadingSpinner';
import type { ProjectStatus, Project } from '../types';

const QuestListPage: React.FC = () => {
  const navigate = useNavigate();
  const { projects, loading, deleteProject, cancelProject } = useProjects();
  const { invokeAgentRuntime } = useAgentRuntime();
  const toast = useToastContext();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'date'>('date');
  const [teamNameFilter, setTeamNameFilter] = useState<string>('');
  const [launchingProjectId, setLaunchingProjectId] = useState<string | null>(null);

  const filteredProjects = statusFilter === 'all'
    ? projects
    : projects.filter(p => p.status === statusFilter);

  const teamFilteredProjects = !teamNameFilter
    ? filteredProjects
    : filteredProjects.filter(p => (p.teamName || '').toLowerCase().includes(teamNameFilter.toLowerCase()));

  const sortedProjects = [...teamFilteredProjects].sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'IN_PROGRESS': return '#f4a261';
      case 'COMPLETED': return '#4ade80';
      case 'ON_ERROR': return '#ef4444';
      default: return '#f4f1de';
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="fantasy-main-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: '1000px', marginBottom: '20px' }}>
        <FantasyButton onClick={() => navigate('/')}>← Back</FantasyButton>
        <h1 className="fantasy-page-title" style={{ margin: 0 }}>📜 Quest Archive 📜</h1>
        <div style={{ width: '120px' }}></div>
      </div>
      
      <div style={{ maxWidth: '1000px', width: '100%' }}>
        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
          <div className="fantasy-form-group" style={{ flex: 1 }}>
            <label className="fantasy-form-label">Filter by Status</label>
            <select 
              className="fantasy-form-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Quests</option>
              <option value="CREATED">Created</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="ON_ERROR">On Error</option>
            </select>
          </div>
          
          <div className="fantasy-form-group" style={{ flex: 1 }}>
            <label className="fantasy-form-label">Sort By</label>
            <select 
              className="fantasy-form-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'date')}
            >
              <option value="date">Creation Date</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
          <div className="fantasy-form-group" style={{ flex: 1 }}>
            <label className="fantasy-form-label">Filter by Team Name</label>
            <input 
              className="fantasy-form-input"
              type="text"
              placeholder="Enter team name..."
              value={teamNameFilter}
              onChange={(e) => setTeamNameFilter(e.target.value)}
            />
          </div>
          
          <div className="fantasy-form-group" style={{ flex: 1 }}>
            <label className="fantasy-form-label">Quick Filter</label>
            <select 
              className="fantasy-form-select"
              value={teamNameFilter === '[Samples]' ? 'samples' : ''}
              onChange={(e) => setTeamNameFilter(e.target.value === 'samples' ? '[Samples]' : '')}
            >
              <option value="">All Teams</option>
              <option value="samples">[Samples] Teams</option>
            </select>
          </div>
        </div>

        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
          {sortedProjects.map((project) => (
            <div key={project.id} className="fantasy-card" style={{ marginBottom: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ color: '#f4a261', marginBottom: '10px', fontSize: '1.5rem' }}>
                    {project.teamName || 'Unnamed Team'}
                  </h3>
                  <div style={{ marginBottom: '10px', fontSize: '0.95rem' }}>
                    <strong>Quest:</strong> {project.name}
                  </div>
                  <p style={{ marginBottom: '10px', fontSize: '0.95rem' }}>
                    {project.prompt}
                  </p>
                  <div style={{ display: 'flex', gap: '15px', fontSize: '0.85rem' }}>
                    <span>Team organization: {project.teamPattern}</span>
                    <span>Created: {new Date(project.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                    <button
                      onClick={() => {
                        sessionStorage.setItem('createdProject', JSON.stringify(project));
                        sessionStorage.setItem('ownerKey', project.ownerKey || '');
                        navigate(`/project/${project.id}/run?ownerKey=${project.ownerKey || ''}`);
                      }}
                      style={{
                        padding: '8px 16px',
                        background: 'linear-gradient(45deg, #2a9d8f 0%, #1a7a6f 100%)',
                        border: '2px solid #f4a261',
                        borderRadius: '8px',
                        color: '#f4f1de',
                        fontFamily: 'Cinzel, serif',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      🔍 View
                    </button>
                    {project.status === 'CREATED' && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          setLaunchingProjectId(project.id);
                          try {
                            console.log(`Launching project: ${project.id}`);
                            await invokeAgentRuntime(project as Project);
                            toast.success('Project launched!', 'Your AI team is now active.');
                            sessionStorage.setItem('createdProject', JSON.stringify(project));
                            sessionStorage.setItem('ownerKey', project.ownerKey || '');
                            navigate(`/qrcode/${project.id}`);
                          } catch (err) {
                            console.error('Failed to launch project:', err);
                            const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
                            console.error('Error details:', errorMessage);
                            toast.error('Failed to launch', errorMessage);
                          } finally {
                            setLaunchingProjectId(null);
                          }
                        }}
                        disabled={launchingProjectId === project.id}
                        style={{
                          padding: '8px 16px',
                          background: launchingProjectId === project.id 
                            ? 'linear-gradient(45deg, #666 0%, #555 100%)'
                            : 'linear-gradient(45deg, #f4a261 0%, #e76f51 100%)',
                          border: '2px solid #f4a261',
                          borderRadius: '8px',
                          color: '#f4f1de',
                          fontFamily: 'Cinzel, serif',
                          fontSize: '0.85rem',
                          cursor: launchingProjectId === project.id ? 'not-allowed' : 'pointer',
                          transition: 'all 0.3s ease',
                          opacity: launchingProjectId === project.id ? 0.6 : 1
                        }}
                      >
                        {launchingProjectId === project.id ? '⏳ Launching...' : '🚀 Launch'}
                      </button>
                    )}
                    {project.status === 'IN_PROGRESS' && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (window.confirm(`Cancel running quest "${project.name}"?`)) {
                            try {
                              await cancelProject(project.id);
                              toast.success('Quest cancelled', 'The runtime execution has been aborted.');
                            } catch (err) {
                              console.error('Failed to cancel project:', err);
                              const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
                              toast.error('Failed to cancel', errorMessage);
                            }
                          }
                        }}
                        style={{
                          padding: '8px 16px',
                          background: 'linear-gradient(45deg, #e76f51 0%, #c44536 100%)',
                          border: '2px solid #f4a261',
                          borderRadius: '8px',
                          color: '#f4f1de',
                          fontFamily: 'Cinzel, serif',
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          transition: 'all 0.3s ease'
                        }}
                      >
                        ⛔ Cancel
                      </button>
                    )}
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete quest "${project.name}"?`)) {
                          try {
                            console.log(`Deleting project: ${project.id}`);
                            await deleteProject(project.id);
                            toast.success('Quest deleted', 'The quest has been removed.');
                          } catch (err) {
                            console.error('Failed to delete project:', err);
                            const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
                            console.error('Error details:', errorMessage);
                            toast.error('Failed to delete', errorMessage);
                          }
                        }
                      }}
                      style={{
                        padding: '8px 16px',
                        background: 'linear-gradient(45deg, #ef4444 0%, #dc2626 100%)',
                        border: '2px solid #f4a261',
                        borderRadius: '8px',
                        color: '#f4f1de',
                        fontFamily: 'Cinzel, serif',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
                <div style={{ 
                  padding: '8px 16px', 
                  borderRadius: '20px', 
                  background: 'rgba(26, 26, 46, 0.5)',
                  border: `2px solid ${getStatusColor(project.status)}`,
                  color: getStatusColor(project.status),
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  whiteSpace: 'nowrap'
                }}>
                  {project.status}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default QuestListPage;

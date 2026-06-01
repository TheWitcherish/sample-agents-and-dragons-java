import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useProjectTasks, useProjectMessage, useProjectSubscription, useAgentRuns, useAgentTransitions } from '../hooks/useAmplifyData';
import { ProjectNetworkGraph } from '../components/agent-network/ProjectNetworkGraph';
import LoadingSpinner from '../components/common/LoadingSpinner';
import AgentInfoModal from '../components/common/AgentInfoModal';
import ProjectInfoModal from '../components/common/ProjectInfoModal';
import type { AgentRun, Agent } from '../types';
import type { Schema } from '../../amplify/data/resource';
import { generateClient } from 'aws-amplify/data';
import { PiCoins } from 'react-icons/pi';
import { LuTimer } from 'react-icons/lu';
import { RiExpandRightFill, RiExpandLeftFill } from 'react-icons/ri';
import { FaGift } from 'react-icons/fa';
import { IoPlaySkipBackSharp, IoPlaySkipForward, IoPlayCircle, IoPauseCircle } from 'react-icons/io5';
import { getUrl } from 'aws-amplify/storage';

const ProjectRunPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();

  const ownerKey = searchParams.get('ownerKey') || sessionStorage.getItem('ownerKey') || '';
  const { project, agents, loading: projectLoading } = useProjectSubscription(projectId, ownerKey);
  const { tasks } = useProjectTasks(projectId, undefined);
  const { messages } = useProjectMessage(projectId, undefined);
  const { agentRuns } = useAgentRuns(projectId, undefined);
  const { agentTransitions } = useAgentTransitions(projectId, undefined);

  const [logExpanded, setLogExpanded] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [resultUrl, setResultUrl] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState('1x');
  const [modalAgent, setModalAgent] = useState<Agent | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);

  const [cancelling, setCancelling] = useState(false);

  const handleCancelProject = useCallback(async () => {
    if (!projectId || cancelling) return;
    if (!window.confirm('Cancel this running quest? The runtime execution will be aborted.')) return;
    setCancelling(true);
    try {
      const dataClient = generateClient<Schema>();
      await dataClient.models.Project.update({
        id: projectId,
        status: 'ABORTED',
      } as Parameters<typeof dataClient.models.Project.update>[0], { authMode: 'userPool' });
    } catch (err) {
      console.error('Failed to cancel project:', err);
    } finally {
      setCancelling(false);
    }
  }, [projectId, cancelling]);

  const logContainerRef = React.useRef<HTMLDivElement>(null);

  const projectDuration = project?.createdAt && project?.updatedAt
    ? Math.ceil((new Date(project.updatedAt).getTime() - new Date(project.createdAt).getTime()) / 1000)
    : 300;

  useEffect(() => {
    if (project?.status === 'COMPLETED' && projectDuration > 0) {
      setCurrentTime(projectDuration);
    }
  }, [project?.status, projectDuration]);

  useEffect(() => {
    if (!isPlaying) return;

    const speed = parseFloat(playbackSpeed);
    const interval = setInterval(() => {
      setCurrentTime(prev => {
        const next = prev + speed;
        if (next >= projectDuration) {
          setIsPlaying(false);
          return projectDuration;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, projectDuration]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const currentTimestamp = useMemo(() => project?.createdAt
    ? new Date(project.createdAt).getTime() + (currentTime * 1000)
    : Date.now(), [project?.createdAt, currentTime]);

  const filteredTasks = useMemo(() => project?.status === 'COMPLETED'
    ? tasks.filter(t => new Date(t.createdAt).getTime() <= currentTimestamp)
    : tasks, [tasks, project?.status, currentTimestamp]);

  const filteredMessages = useMemo(() => project?.status === 'COMPLETED'
    ? messages.filter(m => new Date(m.createdAt).getTime() <= currentTimestamp)
    : messages, [messages, project?.status, currentTimestamp]);

  const filteredAgentRuns = useMemo(() => project?.status === 'COMPLETED'
    ? agentRuns.map(run => ({
        ...run,
        state: run.state?.filter(s => new Date(s.createdAt).getTime() <= currentTimestamp) || []
      })).filter(r => r.state.length > 0)
    : agentRuns, [agentRuns, project?.status, currentTimestamp]);

  const filteredAgentTransitions = useMemo(() => project?.status === 'COMPLETED'
    ? agentTransitions.filter(t => new Date(t.createdAt).getTime() <= currentTimestamp)
    : agentTransitions, [agentTransitions, project?.status, currentTimestamp]);

  const logItems = useMemo(() => [
    ...filteredTasks.map(t => ({ type: 'task' as const, data: t, createdAt: t.createdAt })),
    ...filteredMessages.map(m => ({ type: 'message' as const, data: m, createdAt: m.createdAt }))
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
  [filteredTasks, filteredMessages]);

  const filteredLogItems = useMemo(() => logItems.filter(item => {
    if (item.type === 'message' && item.data.text?.includes('Handoff Message:')) {
      return false;
    }
    return true;
  }), [logItems]);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [filteredLogItems.length, autoScroll]);

  if (!projectId) {
    return <LoadingSpinner />;
  }

  // Show spinner only while the core project data is loading
  // Other data (tasks, messages, agent runs) will appear progressively
  if (projectLoading) {
    return <LoadingSpinner />;
  }

  const getTaskIcon = (status: string) => {
    switch (status) {
      case 'IN_PROGRESS': return '⚙️';
      case 'COMPLETED': return '✅';
      case 'ON_ERROR': return '❌';
      default: return '📋';
    }
  };

  const getTaskColor = (status: string) => {
    switch (status) {
      case 'IN_PROGRESS': return '#f4a261';
      case 'COMPLETED': return '#4ade80';
      case 'ON_ERROR': return '#ef4444';
      default: return '#f4f1de';
    }
  };

  const totalTokens = (runs: AgentRun[]) => {
    return runs.reduce((acc, run) => {
      const lastState = run.state?.[run.state.length - 1];
      if (lastState) {
        return acc + lastState.totalTokens;
      }
      return acc;
    }, 0);
  };

  const totalLatency = (runs: AgentRun[]) => {
    return runs.reduce((acc, run) => {
      const lastState = run.state?.[run.state.length - 1];
      if (lastState) {
        return acc + lastState.latency;
      }
      return acc;
    }, 0);
  };

  const formatLatency = (latency: number) => {
    if (latency < 1000) {
      return `${latency}ms`;
    } else if (latency < 60000) {
      return `${(latency / 1000).toFixed(2)}s`;
    } else {
      const minutes = Math.floor(latency / 60000);
      const seconds = ((latency % 60000) / 1000).toFixed(0);
      return `${minutes} min ${seconds.padStart(2, '0')}s`;
    }
  };

  return (
    <div className="fantasy-main-content">
      <style>
        {`
          input[type="range"]:focus {
            outline: none;
          }
          button:focus {
            outline: none;
          }
          .fantasy-message-text {
            word-wrap: break-word;
            overflow-wrap: break-word;
            max-width: 100%;
          }
          .fantasy-message-text ul,
          .fantasy-message-text ol {
            margin: 0.5em 0;
            padding-left: 1.5em;
          }
          .fantasy-message-text li {
            margin: 0.25em 0;
          }
          .react-flow__edge-text {
            fill: #000000 !important;
          }
          .react-flow__edge-textbg {
            fill: #ffffff !important;
          }
        `}
      </style>
      <div style={{ width: '100%', maxWidth: '1400px', marginBottom: '20px', position: 'relative', display: 'flex', alignItems: 'center', gap: '20px' }}>
        {project?.status === 'COMPLETED' && (
          <div style={{
            background: 'transparent',
            border: 'none',
            borderRadius: '15px',
            padding: '5px 15px',
            minWidth: '350px',
            boxShadow: '0 8px 16px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2px'
            }}>
              {/* Timeline Slider */}
              <div style={{ position: 'relative', paddingTop: '20px', paddingLeft: '10px', paddingRight: '10px' }}>
                <input
                  type="range"
                  min="0"
                  max={projectDuration}
                  value={currentTime}
                  onChange={(e) => setCurrentTime(Number(e.target.value))}
                  style={{
                    width: '100%',
                    cursor: 'pointer',
                    accentColor: '#e76f51',
                    height: '8px'
                  }}
                />
                <div style={{
                  position: 'absolute',
                  top: '5px',
                  left: `calc(10px + (100% - 20px) * ${currentTime / projectDuration})`,
                  transform: 'translateX(-50%)',
                  fontSize: '0.85rem',
                  color: '#ffd700',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)'
                }}>
                  {formatTime(currentTime)}
                </div>
              </div>

              {/* Controls */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', marginTop: '-5px' }}>
                {/* Skip to Start */}
                <button
                  onClick={() => setCurrentTime(0)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ffd700',
                    cursor: 'pointer',
                    fontSize: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '5px'
                  }}
                >
                  <IoPlaySkipBackSharp />
                </button>

                {/* Play/Pause */}
                <button
                  onClick={() => {
                    if (currentTime >= projectDuration) {
                      setCurrentTime(0);
                    }
                    setIsPlaying(!isPlaying);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#e76f51',
                    cursor: 'pointer',
                    fontSize: '3rem',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '5px',
                    filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))'
                  }}
                >
                  {isPlaying ? <IoPauseCircle /> : <IoPlayCircle />}
                </button>

                {/* Skip to End */}
                <button
                  onClick={() => setCurrentTime(projectDuration)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ffd700',
                    cursor: 'pointer',
                    fontSize: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '5px'
                  }}
                >
                  <IoPlaySkipForward />
                </button>

                {/* Speed Selector */}
                <select
                  className="video-player-speed-select"
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(e.target.value)}
                  style={{
                    position: 'absolute',
                    right: 0,
                    background: 'linear-gradient(135deg, #264653 0%, #2a9d8f 100%)',
                    border: '2px solid #f4a261',
                    borderRadius: '8px',
                    color: '#ffd700',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontFamily: 'Arial, sans-serif',
                    fontWeight: 'bold',
                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)'
                  }}
                >
                  <option value="1x">1x</option>
                  <option value="2x">2x</option>
                  <option value="4x">4x</option>
                  <option value="10x">10x</option>
                </select>
              </div>
            </div>
          </div>
        )}

        <div style={{ flex: 1, textAlign: 'center' }}>
          <div 
            style={{ fontSize: '1.2rem', color: '#f4a261', cursor: 'pointer' }}
            onClick={() => setShowProjectModal(true)}
          >
            Team "{project?.teamName || 'Team'}" {project?.status === 'COMPLETED' ? 'completed quest' : 'is running quest'}
          </div>
          <h1 
            className="fantasy-page-title" 
            style={{ margin: 0, fontSize: '1.4rem', marginTop: '5px', cursor: 'pointer' }}
            onClick={() => setShowProjectModal(true)}
          >
            ⚔️ {project?.name || 'Loading...'} ⚔️
          </h1>
        </div>
        {project?.status === 'COMPLETED' && (
          <button
            onClick={async () => {
              try {
                const url = await getUrl({ 
                  path: `apps/${projectId}/index.html`,
                  options: {
                    validateObjectExistence: true
                  }
                });
                setResultUrl(url.url.toString());
              } catch (error) {
                if (error instanceof Error && (error.name === 'NotFound' || error.message?.includes('NotFound'))) {
                  setResultUrl('');
                }
              }
              setShowModal(true);
            }}
            style={{
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
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, #f4a261 0%, #e76f51 100%)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, #2a9d8f 0%, #264653 100%)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <FaGift style={{ marginRight: '8px', fontSize: '1.1rem', color: '#ffd700' }} />
            Open quest final result
          </button>
        )}
        {project?.status === 'IN_PROGRESS' && (
          <button
            onClick={handleCancelProject}
            disabled={cancelling}
            style={{
              background: cancelling
                ? 'linear-gradient(135deg, #666 0%, #555 100%)'
                : 'linear-gradient(135deg, #e76f51 0%, #c44536 100%)',
              border: '2px solid #f4a261',
              borderRadius: '8px',
              color: '#f4f1de',
              cursor: cancelling ? 'not-allowed' : 'pointer',
              padding: '10px 20px',
              fontSize: '1rem',
              fontWeight: 'bold',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              opacity: cancelling ? 0.6 : 1,
            }}
          >
            ⛔ {cancelling ? 'Cancelling...' : 'Cancel Quest'}
          </button>
        )}
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: logExpanded ? '1fr' : '400px 1fr', gap: '30px', width: '100%', maxWidth: '1400px' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="fantasy-form-label" style={{ marginBottom: 0 }}>Adventure Log</div>
              <button
                onClick={() => setLogExpanded(!logExpanded)}
                style={{
                  background: 'rgba(42, 157, 143, 0.3)',
                  border: '1px solid #2a9d8f',
                  borderRadius: '5px',
                  color: '#f4a261',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  fontSize: '1.2rem',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                {logExpanded ? <RiExpandLeftFill /> : <RiExpandRightFill />}
              </button>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.85rem', color: '#f4a261', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  style={{ accentColor: '#2a9d8f' }}
                />
                Auto-scroll
              </label>
            </div>

          </div>
          <div 
            ref={logContainerRef}
            style={{ 
              height: '500px', 
              overflowY: 'auto', 
              background: 'rgba(26, 26, 46, 0.8)',
              border: '2px solid #2a9d8f',
              borderRadius: '10px',
              padding: '15px'
            }}>
            {filteredLogItems.map((item) => (
              item.type === 'task' ? (
                <div 
                  key={`task-${item.data.id}`}
                  style={{
                    marginBottom: '15px',
                    padding: '12px',
                    background: 'rgba(42, 157, 143, 0.2)',
                    borderRadius: '8px',
                    borderLeft: `4px solid ${getTaskColor(item.data.status || 'CREATED')}`
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    marginBottom: '5px',
                    fontSize: '0.9rem'
                  }}>
                    <span>{getTaskIcon(item.data.status || 'CREATED')}</span>
                    <span style={{ fontWeight: 'bold', color: '#f4a261' }}>
                      {item.data.name || 'Task'}
                    </span>
                    <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                      {new Date(item.data.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div style={{ color: getTaskColor(item.data.status || 'CREATED'), fontSize: '0.9rem' }}>
                    {item.data.content}
                  </div>
                </div>
              ) : (() => {
                const agent = agents.find(a => a.id === item.data.agentId);
                return (
                  <div 
                    key={`message-${item.data.messageId}`}
                    style={{
                      marginBottom: '15px',
                      padding: '12px',
                      background: 'rgba(244, 162, 97, 0.2)',
                      borderRadius: '8px',
                      borderLeft: '4px solid #e76f51'
                    }}
                  >
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px',
                      marginBottom: '5px',
                      fontSize: '0.9rem'
                    }}>
                      <span style={{ fontWeight: 'bold', color: item.data.role === 'user' ? '#3b82f6' : '#e76f51' }}>
                        {item.data.role === 'user' ? 'To: ' : 'From: '}
                      </span>
                      {agent?.avatar && (
                        <img 
                          src={agent.avatar} 
                          alt={agent.name}
                          style={{ width: '24px', height: '24px', borderRadius: '50%' }}
                        />
                      )}
                      <span style={{ fontWeight: 'bold', color: item.data.role === 'user' ? '#3b82f6' : '#e76f51' }}>
                        {agent?.name || item.data.role || 'Agent'}
                      </span>
                      <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                        {new Date(item.data.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="fantasy-message-text" style={{ color: '#f4f1de', fontSize: '0.9rem' }}>
                      <ReactMarkdown>{item.data.text}</ReactMarkdown>
                    </div>
                  </div>
                );
              })()
            ))}
          </div>
        </div>

        {!logExpanded && <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px', fontSize: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#f4a261' }}>
              <PiCoins style={{ fontSize: '1.2rem' }}/>
              <span>{totalTokens(filteredAgentRuns).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#f4a261' }}>
              <LuTimer style={{ fontSize: '1.2rem' }}/>
              <span>{formatLatency(totalLatency(filteredAgentRuns))}</span>
            </div>
            <div style={{ marginLeft: 'auto', padding: '4px 12px', background: 'rgba(42, 157, 143, 0.3)', borderRadius: '12px', fontSize: '0.9rem', color: '#2a9d8f', fontWeight: '600' }}>
              {project?.status || 'CREATED'}
            </div>
          </div>
          <ProjectNetworkGraph 
            projectId={projectId}
            standalone={false}
            project={project}
            agents={agents}
            filteredAgentRuns={filteredAgentRuns as unknown as Schema['AgentRun']['type'][]}
            filteredAgentTransitions={filteredAgentTransitions as unknown as Schema['AgentTransition']['type'][]}
            onAgentClick={(agent: Agent) => setModalAgent(agent)}
            containerStyle={{ 
              height: '500px', 
              border: '2px solid #2a9d8f', 
              borderRadius: '10px', 
              background: 'rgba(26, 26, 46, 0.5)' 
            }}
          />
        </div>}
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
      
      <AgentInfoModal agent={modalAgent} onClose={() => setModalAgent(null)} />
      {showProjectModal && <ProjectInfoModal project={project} agents={agents} onClose={() => setShowProjectModal(false)} />}
    </div>
  );
};

export default ProjectRunPage;

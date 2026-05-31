import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReactFlow, addEdge, useNodesState, useEdgesState, Controls, Background, MarkerType, type NodeChange, type Connection, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FaCrown } from 'react-icons/fa';
import { useAgents, useProjects } from '../hooks/useAmplifyData';
import FantasyButton from '../components/common/FantasyButton';
import LoadingSpinner from '../components/common/LoadingSpinner';
import AgentInfoModal from '../components/common/AgentInfoModal';
import ButtonEdge from '../components/team/ButtonEdge';
import { getPatternGuides } from '../config/patternGuides';
import type { Agent, TeamPattern, AgentConnection } from '../types';
import AnnotationNode from '../components/agent-network/NetworkGraph/AnnotationNode';
import { generateRandomTeamName } from '../utils/teamNameGenerator';

const edgeTypes = {
  button: ButtonEdge,
};

const nodeTypes = {
  annotation: AnnotationNode,
};

const TeamAssemblyPage: React.FC = () => {
  const navigate = useNavigate();
  const quest = JSON.parse(sessionStorage.getItem('selectedQuest') || '{}');
  const { agents, loading } = useAgents();
  const { checkTeamNameExists } = useProjects();
  const reactFlowInstance = useRef<{ fitView: (options?: { padding?: number; duration?: number }) => void } | null>(null);
  const [teamPattern, setTeamPattern] = useState<TeamPattern | ''>('');
  const [teamName, setTeamName] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('name');
  const [selectedAgents, setSelectedAgents] = useState<Agent[]>([]);
  const [modalAgent, setModalAgent] = useState<Agent | null>(null);
  const [agentPositions, setAgentPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [showGuides, setShowGuides] = useState(true);
  const [entryPointAgentId, setEntryPointAgentId] = useState<string | null>(null);
  const [showMissingModal, setShowMissingModal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [lastClickedNode, setLastClickedNode] = useState<{id: string, timestamp: number} | null>(null);
  const [teamNameExists, setTeamNameExists] = useState(false);
  const MAX_GEMS = 10;
  const gemsUsed = selectedAgents.reduce((sum, agent) => sum + agent.cost, 0);

  const createNodes = useCallback((agentsList: Agent[]) => agentsList.map((agent, index) => {
    const savedPosition = agentPositions.get(agent.id);
    const isEntryPoint = entryPointAgentId === agent.id;
    return {
    id: agent.id,
    type: 'default',
    position: savedPosition || { x: 100 + (index % 3) * 200, y: 100 + Math.floor(index / 3) * 120 },
    data: { 
      label: (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative', cursor: 'pointer' }}>
          {agent.avatar && (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <img 
                src={agent.avatar} 
                alt={agent.name} 
                style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setModalAgent(agent);
                }}
              />
            </div>
          )}
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{agent.name}</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', opacity: 0.8 }}>{agent.roleDisplayName || agent.role}</div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '4px' }}>
              <span style={{ background: 'linear-gradient(135deg, #edf2f7 0%, #e2e8f0 100%)', color: '#4a5568', padding: '0.25rem 0.5rem', borderRadius: '12px', fontSize: '0.625rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '2px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)', border: '1px solid rgba(0, 0, 0, 0.05)' }}>{agent.speed || 0}% ⚡</span>
              <span style={{ background: 'linear-gradient(135deg, #edf2f7 0%, #e2e8f0 100%)', color: '#4a5568', padding: '0.25rem 0.5rem', borderRadius: '12px', fontSize: '0.625rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '2px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)', border: '1px solid rgba(0, 0, 0, 0.05)' }}>{agent.precision || 0}% 🎯</span>
              <span style={{ background: 'linear-gradient(135deg, #edf2f7 0%, #e2e8f0 100%)', color: '#4a5568', padding: '0.25rem 0.5rem', borderRadius: '12px', fontSize: '0.625rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '2px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)', border: '1px solid rgba(0, 0, 0, 0.05)' }}>{agent.frugality || 0}% 💰</span>
              <span style={{ background: 'linear-gradient(135deg, #edf2f7 0%, #e2e8f0 100%)', color: '#4a5568', padding: '0.25rem 0.5rem', borderRadius: '12px', fontSize: '0.625rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '2px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)', border: '1px solid rgba(0, 0, 0, 0.05)' }}>{agent.cost || 0} 💎</span>
            </div>
          </div>
          <FaCrown
            onClick={(e) => {
              e.stopPropagation();
              setEntryPointAgentId(agent.id === entryPointAgentId ? null : agent.id);
            }}
            style={{
              position: 'absolute',
              top: '-8px',
              right: '-8px',
              fontSize: '1.2rem',
              color: isEntryPoint ? '#FFD700' : '#666',
              cursor: 'pointer',
              filter: isEntryPoint ? 'drop-shadow(0 0 4px #FFD700)' : 'none',
              transition: 'all 0.3s ease'
            }}
          />
        </div>
      )
    },
    style: {
      background: 'linear-gradient(135deg, #1e6b5c 0%, #2a9d8f 100%)',
      color: '#f4f1de',
      border: isEntryPoint ? '3px solid #FFD700' : '2px solid #f4a261',
      borderRadius: '10px',
      fontFamily: 'Cinzel, serif',
      fontWeight: '600',
      padding: '10px',
      minWidth: '120px',
      //maxWidth: '320px',
      width: 'auto',
      fontSize: '1.1rem',
      boxShadow: isEntryPoint ? '0 0 10px rgba(255, 215, 0, 0.5)' : '0 4px 8px rgba(0, 0, 0, 0.2)'
    }
  };
  }), [agentPositions, entryPointAgentId]);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    changes.forEach((change) => {
      if (change.type === 'position' && 'dragging' in change && change.dragging === false && change.id && !change.id.startsWith('guide-') && 'position' in change && change.position) {
        setAgentPositions(positions => new Map(positions).set(change.id, change.position!));
      }
    });
    onNodesChange(changes);
  }, [onNodesChange]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (params.source?.startsWith('guide-') || params.target?.startsWith('guide-')) return;
      setEdges((eds) => addEdge({
        ...params,
        type: 'button',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#f4a261', width: 15, height: 15, },
        style: { stroke: '#f4a261', strokeWidth: 3 },
      }, eds));
    },
    [setEdges]
  );

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.id.startsWith('guide-')) return;
    const now = Date.now();
    if (lastClickedNode && now - lastClickedNode.timestamp < 3000 && lastClickedNode.id !== node.id) {
      setEdges((eds) => addEdge({
        id: `${lastClickedNode.id}-${node.id}`,
        source: lastClickedNode.id,
        target: node.id,
        type: 'button',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#f4a261', width: 15, height: 15 },
        style: { stroke: '#f4a261', strokeWidth: 3 },
      }, eds));
      setLastClickedNode(null);
    } else {
      setLastClickedNode({ id: node.id, timestamp: now });
    }
  }, [lastClickedNode, setEdges]);

  React.useEffect(() => {
    const agentNodes = createNodes(selectedAgents);
    const guides = (teamPattern && showGuides) ? getPatternGuides(teamPattern) : { nodes: [], edges: [] };
    setNodes([...guides.nodes, ...agentNodes]);
    setEdges((eds) => {
      const userEdges = eds.filter(e => !e.id.startsWith('guide-edge-'));
      return [...guides.edges, ...userEdges];
    });
    if (guides.nodes.length > 0 && reactFlowInstance.current) {
      setTimeout(() => reactFlowInstance.current?.fitView({ padding: 0.02, duration: 400 }), 50);
    }
  }, [selectedAgents, teamPattern, showGuides, entryPointAgentId, setNodes, setEdges, createNodes]);



  const toggleAgent = (agent: Agent) => {
    setSelectedAgents(prev => {
      const isSelected = prev.find(a => a.id === agent.id);
      if (isSelected) {
        setAgentPositions(positions => {
          const newPositions = new Map(positions);
          newPositions.delete(agent.id);
          return newPositions;
        });
        if (teamPattern === 'mono') {
          setEntryPointAgentId(null);
        } else if (entryPointAgentId === agent.id) {
          setEntryPointAgentId(null);
        }
        return prev.filter(a => a.id !== agent.id);
      } else {
        if (gemsUsed + agent.cost > MAX_GEMS) return prev;
        
        if (teamPattern === 'mono') {
          const guides = getPatternGuides(teamPattern);
          const guideNodes = guides.nodes.filter(g => !g.id.startsWith('guide-label'));
          const firstGuide = guideNodes[0];
          const newPositions = new Map();
          if (firstGuide) {
            newPositions.set(agent.id, {
              x: firstGuide.position.x,
              y: firstGuide.position.y
            });
          }
          setAgentPositions(newPositions);
          setEntryPointAgentId(agent.id);
          return [agent];
        }
        
        const guides = teamPattern ? getPatternGuides(teamPattern) : { nodes: [], edges: [] };
        const guideNodes = guides.nodes.filter(g => !g.id.startsWith('guide-label'));
        const occupiedGuideIds = new Set(prev.map(a => {
          const pos = agentPositions.get(a.id);
          if (!pos) return null;
          const guide = guideNodes.find(g => Math.abs(g.position.x - pos.x) < 5 && Math.abs(g.position.y - pos.y) < 5);
          return guide?.id;
        }).filter(Boolean));
        const emptyGuide = guideNodes.find(g => !occupiedGuideIds.has(g.id));
        
        if (emptyGuide) {
          const adjustedPosition = {
            x: emptyGuide.position.x,
            y: emptyGuide.position.y
          };
          setAgentPositions(positions => new Map(positions).set(agent.id, adjustedPosition));
        }
        return [...prev, agent];
      }
    });
  };

  const mandatoryRolesMet = () => {
    if (!quest.mandatoryAgentRoles || quest.mandatoryAgentRoles.length === 0) return true;
    const selectedRoles = selectedAgents.map(a => a.role);
    return quest.mandatoryAgentRoles.every((role: string) => selectedRoles.includes(role));
  };

  const handleSubmit = async () => {
    if (!teamPattern || !teamName || selectedAgents.length === 0 || !entryPointAgentId || !mandatoryRolesMet()) {
      setTeamNameExists(false);
      setShowMissingModal(true);
      return;
    }
    
    const exists = await checkTeamNameExists(teamName);
    if (exists) {
      setTeamNameExists(true);
      setShowMissingModal(true);
      return;
    }
    setTeamNameExists(false);
    
    const connections: AgentConnection[] = edges
      .filter(edge => !edge.id.startsWith('guide-edge-'))
      .map(edge => ({
        source: edge.source,
        target: edge.target,
        description: `Connection from ${edge.source} to ${edge.target}`
      }));
    
    const visualPositions = selectedAgents
      .map(agent => {
        const position = agentPositions.get(agent.id);
        return position ? { agentId: agent.id, x: position.x, y: position.y } : null;
      })
      .filter(Boolean);
    
    sessionStorage.setItem('teamData', JSON.stringify({
      teamPattern,
      teamName,
      selectedAgents,
      connections,
      entryPointAgentId,
      visualPositions
    }));
    
    navigate('/directions');
  };

  const filteredAgents = agents
    .filter(a => !teamPattern || a.compatiblePatterns?.includes(teamPattern))
    .filter(a => roleFilter === 'all' || a.role === roleFilter)
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'speed') return (b.speed || 0) - (a.speed || 0);
      if (sortBy === 'precision') return (b.precision || 0) - (a.precision || 0);
      if (sortBy === 'frugality') return (b.frugality || 0) - (a.frugality || 0);
      return 0;
    });

  const availableRoles = ['all', ...Array.from(new Set(agents.map(a => a.role).filter(Boolean))).sort()];



  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="fantasy-main-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: '1400px', marginBottom: '20px' }}>
        <FantasyButton onClick={() => navigate('/quest-selection')}>← Back</FantasyButton>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <label className="fantasy-form-label" style={{ margin: 0, whiteSpace: 'nowrap', fontSize: '1.2rem' }}>🛡️ Team Name:</label>
          <input 
            type="text"
            className="fantasy-form-input"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Enter your team name..."
            style={{ minWidth: '350px' }}
          />
          <button
            onClick={async () => {
              let name = generateRandomTeamName();
              let attempts = 0;
              while (await checkTeamNameExists(name) && attempts < 10) {
                name = generateRandomTeamName();
                attempts++;
              }
              setTeamName(name);
            }}
            style={{
              background: 'transparent',
              border: '2px solid #2a9d8f',
              borderRadius: '8px',
              color: '#f4a261',
              cursor: 'pointer',
              fontSize: '1.2rem',
              padding: '10px 14px'
            }}
          >
            🎲
          </button>
        </div>
        <FantasyButton onClick={handleSubmit}>
          Next →
        </FantasyButton>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '30px', width: '100%', maxWidth: '1400px' }}>
        <div>
          <div className="fantasy-form-group">
            <label className="fantasy-form-label">Team Pattern</label>
            <select 
              className="fantasy-form-select"
              value={teamPattern}
              onChange={(e) => setTeamPattern(e.target.value as TeamPattern)}
            >
              <option value="">Select pattern...</option>
              <option value="mono">Mono</option>
              <option value="graph">Graph</option>
              <option value="orchestrator">Orchestrator</option>
              <option value="swarm">Swarm</option>
            </select>
          </div>



          {teamPattern && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div className="fantasy-form-label" style={{ margin: 0 }}>Available Agents</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select 
                    className="fantasy-form-select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    style={{ width: '110px', padding: '5px 10px', fontSize: '0.85rem' }}
                  >
                    <option value="name">Sort: Name</option>
                    <option value="speed">Sort: Speed</option>
                    <option value="precision">Sort: Precision</option>
                    <option value="frugality">Sort: Frugality</option>
                  </select>
                  <select 
                    className="fantasy-form-select"
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    style={{ width: '120px', padding: '5px 10px', fontSize: '0.85rem' }}
                  >
                    <option value="all">All roles</option>
                    {availableRoles.slice(1).map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div
                ref={scrollRef}
                style={{
                  maxHeight: '400px', 
                  overflowY: 'auto',
                  scrollbarWidth: 'thin',
                  scrollbarColor: '#f4a261 rgba(42, 157, 143, 0.2)',
                  paddingRight: '10px'
                }}
                className="custom-scrollbar"
              >
                {filteredAgents.map((agent) => {
              const isSelected = selectedAgents.find(a => a.id === agent.id);
              const canAfford = gemsUsed + agent.cost <= MAX_GEMS;
              const isDisabled = !isSelected && !canAfford;
              return (
                <div 
                  key={agent.id}
                  onClick={() => !isDisabled && toggleAgent(agent as Agent)}
                  style={{
                    background: isSelected ? 'rgba(244, 162, 97, 0.3)' : 'rgba(42, 157, 143, 0.2)',
                    border: `2px solid ${isSelected ? '#f4a261' : '#2a9d8f'}`,
                    borderRadius: '10px',
                    padding: '12px',
                    marginBottom: '10px',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    transition: 'all 0.3s ease',
                    position: 'relative',
                    opacity: isDisabled ? 0.5 : 1
                  }}
                >
                  <div style={{ position: 'absolute', top: '4px', right: '8px', fontSize: '0.85rem', fontWeight: '600', color: '#f4a261' }}>
                    💎 {agent.cost}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    {agent.avatar ? (
                      <img src={agent.avatar} alt={agent.name} style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <div style={{ fontSize: '2rem', flexShrink: 0 }}>🤖</div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', color: '#f4a261', fontSize: '0.95rem' }}>{agent.name}</div>
                      <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>{agent.roleDisplayName || agent.role}</div>
                      {isSelected && <div style={{ color: '#f4a261', fontSize: '0.8rem', marginTop: '3px' }}>✓ Selected</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginRight: '8px', width: '60px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '0.7rem' }}>⚡</span>
                        <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${agent.speed || 0}%`, height: '100%', background: '#fbbf24', borderRadius: '2px' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '0.7rem' }}>🎯</span>
                        <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${agent.precision || 0}%`, height: '100%', background: '#10b981', borderRadius: '2px' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '0.7rem' }}>💰</span>
                        <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${agent.frugality || 0}%`, height: '100%', background: '#3b82f6', borderRadius: '2px' }} />
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setModalAgent(agent as Agent);
                      }}
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        border: '2px solid #f4a261',
                        background: 'rgba(26, 26, 46, 0.8)',
                        color: '#f4a261',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        flexShrink: 0
                      }}
                    >
                      i
                    </button>
                  </div>
                </div>
              );
                })}
              </div>
              <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                  width: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                  background: rgba(42, 157, 143, 0.2);
                  border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                  background: #f4a261;
                  border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                  background: #e09145;
                }
                .react-flow__handle {
                  width: 12px !important;
                  height: 8px !important;
                  border: 1px solid #f4a261 !important;
                  border-radius: 4px !important;
                  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 25%, #ffffff 50%, #cbd5e1 75%, #94a3b8 100%) !important;
                  box-shadow: inset 0 1px 2px rgba(255,255,255,0.8), inset 0 -1px 2px rgba(0,0,0,0.2) !important;
                  display: ${teamPattern === 'mono' || teamPattern === 'swarm' ? 'none' : 'block'} !important;
                }
                .react-flow__node[data-id^="guide-"] .react-flow__handle {
                  width: 6px !important;
                  height: 6px !important;
                  border: 1px solid #f4a261 !important;
                }
              `}</style>
            </>
          )}
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ fontSize: '1rem', fontWeight: '600', color: gemsUsed > MAX_GEMS ? '#ef4444' : '#f4a261' }}>
              💎 Gems used: {gemsUsed} / {MAX_GEMS}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showGuides}
                onChange={(e) => setShowGuides(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Show pattern guidance
            </label>
          </div>
          <div style={{ height: '500px', border: '2px solid #2a9d8f', borderRadius: '10px', background: 'rgba(26, 26, 46, 0.5)' }}>
          <ReactFlow
            nodeTypes={nodeTypes}
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            edgeTypes={edgeTypes}
            onInit={(instance) => { reactFlowInstance.current = instance; }}
            fitView
          >
            <Controls />
            <Background />
          </ReactFlow>
        </div>
        </div>
      </div>

      {showMissingModal && (
        <div
          onClick={() => setShowMissingModal(false)}
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
              maxWidth: '450px',
              width: '90%',
              textAlign: 'center'
            }}
          >
            <h2 style={{ color: '#f4a261', marginBottom: '20px' }}>⚠️ Missing Elements</h2>
            <p style={{ marginBottom: '20px', fontSize: '1rem' }}>Please complete the following before continuing:</p>
            <div style={{ textAlign: 'left', marginBottom: '25px' }}>
              {!teamPattern && (
                <div style={{ padding: '10px', marginBottom: '10px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', borderRadius: '8px' }}>
                  ❌ Select a team pattern
                </div>
              )}
              {!teamName && (
                <div style={{ padding: '10px', marginBottom: '10px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', borderRadius: '8px' }}>
                  ❌ Enter a team name
                </div>
              )}
              {selectedAgents.length === 0 && (
                <div style={{ padding: '10px', marginBottom: '10px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', borderRadius: '8px' }}>
                  ❌ Select at least one agent
                </div>
              )}
              {selectedAgents.length > 0 && !entryPointAgentId && (
                <div style={{ padding: '10px', marginBottom: '10px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', borderRadius: '8px' }}>
                  ❌ Define an entry point (click the crown icon on an agent)
                </div>
              )}
              {selectedAgents.length > 0 && !mandatoryRolesMet() && (
                <div style={{ padding: '10px', marginBottom: '10px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', borderRadius: '8px' }}>
                  ❌ Missing an agent with the role type: {quest.mandatoryAgentRoles?.filter((role: string) => !selectedAgents.map(a => a.role).includes(role)).join(', ')}
                </div>
              )}
              {teamNameExists && (
                <div style={{ padding: '10px', marginBottom: '10px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', borderRadius: '8px' }}>
                  ❌ Team name already exists, please choose another name
                </div>
              )}
            </div>
            <FantasyButton onClick={() => setShowMissingModal(false)}>
              OK
            </FantasyButton>
          </div>
        </div>
      )}

      <AgentInfoModal agent={modalAgent} onClose={() => setModalAgent(null)} />
    </div>
  );
};

export default TeamAssemblyPage;

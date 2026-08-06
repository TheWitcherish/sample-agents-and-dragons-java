import React, { useEffect, useRef, useCallback } from 'react';
import { ReactFlow, useNodesState, useEdgesState, Controls, Background, MarkerType, Position, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAgentRuns, useAgentTransitions, useProjectSubscription } from '../../hooks/useAmplifyData';
import AgentNode from './NetworkGraph/AgentNode';
import CustomEdge from './CustomEdge';
import type { Schema } from '../../../amplify/data/resource';
import type { Agent, Project } from '../../types';

type AgentRun = Schema['AgentRun']['type'];
type AgentTransition = Schema['AgentTransition']['type'];

const nodeTypes = {
  agentNode: AgentNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

interface ProjectNetworkGraphProps {
  projectId: string;
  containerStyle?: React.CSSProperties;
  filteredAgentRuns?: AgentRun[];
  filteredAgentTransitions?: AgentTransition[];
  project?: Project | null;
  agents?: Agent[];
  /** When true (default), the component fetches its own data. Set to false when parent provides all data via props. */
  standalone?: boolean;
  onAgentClick?: (agent: Agent) => void;
}

export const ProjectNetworkGraph: React.FC<ProjectNetworkGraphProps> = ({
  projectId,
  containerStyle,
  filteredAgentRuns: propFilteredRuns,
  filteredAgentTransitions: propFilteredTransitions,
  project: propProject,
  agents: propAgents,
  standalone = true,
  onAgentClick
}) => {
  // Only subscribe when in standalone mode (no parent providing data)
  const { project: hookProject, agents: hookAgents } = useProjectSubscription(
    standalone ? projectId : undefined, undefined
  );
  const { agentRuns: hookAgentRuns } = useAgentRuns(
    standalone ? projectId : undefined, undefined
  );
  const { agentTransitions: hookAgentTransitions } = useAgentTransitions(
    standalone ? projectId : undefined, undefined
  );
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowInstance = useRef<{ fitView: (options?: { padding?: number; duration?: number }) => void } | null>(null);

  const project = propProject ?? hookProject;
  const agents = propAgents ?? hookAgents;
  const agentRuns = propFilteredRuns ?? hookAgentRuns;
  const agentTransitions = propFilteredTransitions ?? hookAgentTransitions;

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (onAgentClick && (node.data as Record<string, unknown>).agent) {
      onAgentClick((node.data as Record<string, unknown>).agent as Agent);
    }
  }, [onAgentClick]);

  useEffect(() => {
    if (agentRuns.length > 0 && project) {
      const savedPositions = project.agentsVisualPositions || [];

      const nodesWithPositions = agentRuns.map((agentRun, index) => {
        const agent = agents.find(a => a.id === agentRun.agentId);
        const savedPosition = savedPositions.find(p => p.agentId === agentRun.agentId);
        
        const position = savedPosition 
          ? { x: savedPosition.x, y: savedPosition.y }
          : {
              x: 100 + (index % 3) * 200,
              y: 100 + Math.floor(index / 3) * 120
            };
        
        return { agentRun, agent, position };
      });

      const minY = Math.min(...nodesWithPositions.map(n => n.position.y));
      const maxY = Math.max(...nodesWithPositions.map(n => n.position.y));
      const minX = Math.min(...nodesWithPositions.map(n => n.position.x));
      const maxX = Math.max(...nodesWithPositions.map(n => n.position.x));

      const nodesData = nodesWithPositions.map(({ agentRun, agent, position }) => {
        const agentState = agentRun.state?.[agentRun.state.length - 1];
        
        let handlePosition = Position.Top;
        let targetPosition = Position.Top;
        let sourcePosition = Position.Bottom;
        
        if (project.teamPattern === 'orchestrator') {
          if (agentRun.agentId === project.teamEntrypoint) {
            targetPosition = Position.Bottom;
            sourcePosition = Position.Bottom;
          } else {
            targetPosition = Position.Top;
            sourcePosition = Position.Top;
          }
        }
        else if (project.teamPattern === 'graph') {
          targetPosition = Position.Top;
          sourcePosition = Position.Bottom;
        } else {
          if (position.y === minY) handlePosition = Position.Bottom;
          else if (position.x === minX) handlePosition = Position.Right;
          else if (position.x === maxX) handlePosition = Position.Left;
          else if (position.y === maxY) handlePosition = Position.Top;
          targetPosition = handlePosition;
          sourcePosition = handlePosition;
        }

        return {
          id: agentRun.agentId,
          type: 'agentNode',
          position,
          data: {
            label: agent?.name || agentRun.agentName || 'Unknown Agent',
            role: agent?.roleDisplayName || agent?.role,
            avatar: agent?.avatar,
            agentState: agentState,
            handlePosition: handlePosition,
            targetPosition: targetPosition,
            sourcePosition: sourcePosition,
            agent: agent,
            onAgentClick: onAgentClick,
          },
        };
      });

      const allStopped = agentRuns.every(run => {
        const status = run.state?.[run.state.length - 1]?.status;
        return status === 'STOPPED' || status === 'READY';
      });
      const sortedTransitions = [...agentTransitions].sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      // Fix orchestrator pattern transitions
      const correctedTransitions = project.teamPattern === 'orchestrator'
        ? sortedTransitions.flatMap(transition => {
            const entrypoint = project.teamEntrypoint;
            if (transition.sourceAgentId !== entrypoint && transition.targetAgentId !== entrypoint) {
              return [
                { ...transition, transitionId: `${transition.transitionId}_to_entry`, targetAgentId: entrypoint } as AgentTransition,
                { ...transition, transitionId: `${transition.transitionId}_from_entry`, sourceAgentId: entrypoint } as AgentTransition
              ];
            }
            return [transition];
          })
        : sortedTransitions;

      const edgesData = correctedTransitions.map((transition, index) => ({
        id: transition.transitionId,
        source: transition.sourceAgentId || '',
        target: transition.targetAgentId || '',
        type: 'custom',
        data: {
          label: String(index + 1),
          isActive: index === sortedTransitions.length - 1 && !allStopped,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 15,
          height: 15,
          color: index === sortedTransitions.length - 1 ? '#FF0072' : '#888888',
        },
        animated: index === sortedTransitions.length - 1 && !allStopped,
        style: {
          strokeWidth: 2,
          stroke: index === sortedTransitions.length - 1 ? '#FF0072' : '#888888',
        },
      }));

      setNodes(nodesData);
      setEdges(edgesData);
      
      if (reactFlowInstance.current) {
        setTimeout(() => reactFlowInstance.current?.fitView({ padding: 0.02, duration: 400 }), 50);
      }
    }
  }, [agentRuns, agentTransitions, project, agents, onAgentClick, setNodes, setEdges]);

  return (
    <div style={containerStyle || { height: '100%', width: '100%' }}>
      <ReactFlow
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onInit={(instance) => { reactFlowInstance.current = instance; }}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Controls position="top-left" showInteractive={false} />
        <Background />
      </ReactFlow>
    </div>
  );
};

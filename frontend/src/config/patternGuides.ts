import type { Node, Edge } from '@xyflow/react';
import type { TeamPattern } from '../types';

const guideNodeStyle = {
  background: 'transparent',
  border: '2px dashed rgba(244, 162, 97, 0.5)',
  borderRadius: '10px',
  color: 'rgba(244, 162, 97, 0.5)',
  fontFamily: 'Cinzel, serif',
  fontSize: '2rem',
  padding: '15px',
  minWidth: '310px',
  minHeight: '90px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center' as const,
};

const guideEdgeStyle = {
  stroke: 'rgba(244, 162, 97, 0.5)',
  strokeDasharray: '5,5',
  strokeWidth: 2,
};

const labelNodeStyle = {
  background: 'rgba(244, 162, 97, 0.15)',
  //border: '2px solid rgba(244, 162, 97, 0.5)',
  borderRadius: '10px',
  color: '#f4a261',
  fontFamily: 'Cinzel, serif',
  fontSize: '1.4rem',
  fontWeight: '600',
  padding: '16px 20px',
  minWidth: '600px',
  maxWidth: '600px',
  textAlign: 'center' as const,
};

export const getPatternGuides = (pattern: TeamPattern): { nodes: Node[]; edges: Edge[] } => {
  switch (pattern) {
    case 'mono':
      return {
        nodes: [
          {
            id: 'guide-label',
            type: 'annotation',
            position: { x: 260, y: 20 },
            data: { label: 'A single agent in charge of everything' },
            style: labelNodeStyle,
            selectable: false,
            draggable: false,
            connectable: false,
          },
          {
            id: 'guide-1',
            type: 'default',
            position: { x: 400, y: 150 },
            data: { label: '?' },
            style: guideNodeStyle,
            selectable: false,
            draggable: false,
          },
        ],
        edges: [],
      };

    case 'orchestrator':
      return {
        nodes: [
          {
            id: 'guide-label',
            type: 'annotation',
            position: { x: 260, y: 10 },
            data: { label: 'A coordinator agent organizing work of specialized agents' },
            style: labelNodeStyle,
            selectable: false,
            draggable: false,
            connectable: false,
          },
          {
            id: 'guide-1',
            type: 'default',
            position: { x: 400, y: 140 },
            data: { label: '?' },
            style: guideNodeStyle,
            selectable: false,
            draggable: false,
          },
          {
            id: 'guide-2',
            type: 'default',
            position: { x: 150, y: 310 },
            data: { label: '?' },
            style: guideNodeStyle,
            selectable: false,
            draggable: false,
          },
          {
            id: 'guide-3',
            type: 'default',
            position: { x: 400, y: 450 },
            data: { label: '?' },
            style: guideNodeStyle,
            selectable: false,
            draggable: false,
          },
          {
            id: 'guide-4',
            type: 'default',
            position: { x: 650, y: 310 },
            data: { label: '?' },
            style: guideNodeStyle,
            selectable: false,
            draggable: false,
          },
        ],
        edges: [
          {
            id: 'guide-edge-1',
            source: 'guide-1',
            target: 'guide-2',
            style: guideEdgeStyle,
            selectable: false,
          },
          {
            id: 'guide-edge-2',
            source: 'guide-1',
            target: 'guide-3',
            style: guideEdgeStyle,
            selectable: false,
          },
          {
            id: 'guide-edge-3',
            source: 'guide-1',
            target: 'guide-4',
            style: guideEdgeStyle,
            selectable: false,
          },
        ],
      };

    case 'graph':
      return {
        nodes: [
          {
            id: 'guide-label',
            type: 'annotation',
            position: { x: 260, y: 10 },
            data: { label: 'A directed graph of agents predefining possible agent transitions' },
            style: labelNodeStyle,
            selectable: false,
            draggable: false,
            connectable: false,
          },
          {
            id: 'guide-1',
            type: 'default',
            position: { x: 400, y: 130 },
            data: { label: '?' },
            style: guideNodeStyle,
            selectable: false,
            draggable: false,
          },
          {
            id: 'guide-2',
            type: 'default',
            position: { x: 400, y: 280 },
            data: { label: '?' },
            style: guideNodeStyle,
            selectable: false,
            draggable: false,
          },
          {
            id: 'guide-3',
            type: 'default',
            position: { x: 400, y: 430 },
            data: { label: '?' },
            style: guideNodeStyle,
            selectable: false,
            draggable: false,
          },
        ],
        edges: [
          {
            id: 'guide-edge-1',
            source: 'guide-1',
            target: 'guide-2',
            style: guideEdgeStyle,
            selectable: false,
          },
          {
            id: 'guide-edge-2',
            source: 'guide-2',
            target: 'guide-3',
            style: guideEdgeStyle,
            selectable: false,
          },
        ],
      };

    case 'swarm': {
      const agentCount = 4;
      const radiusX = 240;
      const radiusY = 120;
      const centerX = 400;
      const centerY = 220;
      return {
        nodes: [
          {
            id: 'guide-label',
            type: 'annotation',
            position: { x: 180, y: -20 },
            data: { label: 'A self organizing group of agents' },
            style: labelNodeStyle,
            selectable: false,
            draggable: false,
            connectable: false,
          },
          ...Array.from({ length: agentCount }, (_, i) => {
            const angle = (i * 2 * Math.PI) / agentCount;
            return {
              id: `guide-${i + 1}`,
              type: 'default',
              position: {
                x: centerX - radiusX * Math.cos(angle) - 70,
                y: centerY - radiusY * Math.sin(angle) - 20,
              },
              data: { label: '?' },
              style: guideNodeStyle,
              selectable: false,
              draggable: false,
            };
          })
        ],
        edges: [],
      };
    }

    default:
      return { nodes: [], edges: [] };
  }
};

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AgentNode from '../AgentNode';

// Mock React Flow Handle component
vi.mock('@xyflow/react', () => ({
  Handle: ({ type, position }: { type: string; position: string }) => (
    <div data-testid={`handle-${type}`} data-position={position} />
  ),
}));

// Mock icon libraries
vi.mock('react-icons/ai', () => ({
  AiOutlineMail: () => <span data-testid="icon-mail" />,
}));
vi.mock('react-icons/si', () => ({
  SiMlflow: () => <span data-testid="icon-cycle" />,
}));
vi.mock('react-icons/pi', () => ({
  PiCoins: () => <span data-testid="icon-tokens" />,
}));
vi.mock('react-icons/lu', () => ({
  LuTimer: () => <span data-testid="icon-timer" />,
}));

// Mock animation components
vi.mock('../ThinkingAnimation', () => ({ default: () => <div data-testid="thinking-anim" /> }));
vi.mock('../WorkingAnimation', () => ({ default: () => <div data-testid="working-anim" /> }));
vi.mock('../UsingToolAnimation', () => ({ default: () => <div data-testid="using-tool-anim" /> }));

// Mock CSS modules
vi.mock('../AgentNode.module.css', () => ({
  default: {
    container: 'container',
    avatarContainer: 'avatarContainer',
    avatar: 'avatar',
    label: 'label',
    role: 'role',
    model: 'model',
    agentStats: 'agentStats',
    stat: 'stat',
    handle: 'handle',
    handleSource: 'handleSource',
    smallBubble: 'smallBubble',
    smallBubble2: 'smallBubble2',
    statusBubble: 'statusBubble',
  },
}));

const baseData = {
  label: 'Agent Alpha',
};

describe('AgentNode', () => {
  it('renders the agent label', () => {
    render(<AgentNode data={baseData} isConnectable={true} />);
    expect(screen.getByText('Agent Alpha')).toBeInTheDocument();
  });

  it('renders role when provided', () => {
    render(<AgentNode data={{ ...baseData, role: 'Coder' }} isConnectable={true} />);
    expect(screen.getByText('Coder')).toBeInTheDocument();
  });

  it('does not render role when not provided', () => {
    render(<AgentNode data={baseData} isConnectable={true} />);
    expect(screen.queryByText('Coder')).not.toBeInTheDocument();
  });

  it('renders model when provided', () => {
    render(<AgentNode data={{ ...baseData, model: 'Claude 3 Haiku' }} isConnectable={true} />);
    expect(screen.getByText('Claude 3 Haiku')).toBeInTheDocument();
  });

  it('renders avatar image when provided', () => {
    render(<AgentNode data={{ ...baseData, avatar: '/img/agent.png' }} isConnectable={true} />);
    const img = screen.getByAltText('Agent Alpha');
    expect(img).toHaveAttribute('src', '/img/agent.png');
  });

  it('does not render avatar when not provided', () => {
    render(<AgentNode data={baseData} isConnectable={true} />);
    expect(screen.queryByAltText('Agent Alpha')).not.toBeInTheDocument();
  });

  it('renders agent stats when agentState is provided', () => {
    const agentState = {
      status: 'WORKING',
      totalTokens: 1500,
      messageCount: 10,
      cycleCount: 3,
      latency: 2500,
    };
    render(<AgentNode data={{ ...baseData, agentState }} isConnectable={true} />);
    expect(screen.getByText('1500')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2.50s')).toBeInTheDocument();
  });

  it('does not render stats when agentState is absent', () => {
    render(<AgentNode data={baseData} isConnectable={true} />);
    expect(screen.queryByTestId('icon-tokens')).not.toBeInTheDocument();
  });

  it('shows WorkingAnimation for WORKING status', () => {
    const data = {
      ...baseData,
      avatar: '/img/a.png',
      agentState: { status: 'WORKING', totalTokens: 0, messageCount: 0, cycleCount: 0, latency: 0 },
    };
    render(<AgentNode data={data} isConnectable={true} />);
    expect(screen.getByTestId('working-anim')).toBeInTheDocument();
  });

  it('shows ThinkingAnimation for THINKING status', () => {
    const data = {
      ...baseData,
      avatar: '/img/a.png',
      agentState: { status: 'THINKING', totalTokens: 0, messageCount: 0, cycleCount: 0, latency: 0 },
    };
    render(<AgentNode data={data} isConnectable={true} />);
    expect(screen.getByTestId('thinking-anim')).toBeInTheDocument();
  });

  it('shows UsingToolAnimation for USING_TOOL status', () => {
    const data = {
      ...baseData,
      avatar: '/img/a.png',
      agentState: { status: 'USING_TOOL', totalTokens: 0, messageCount: 0, cycleCount: 0, latency: 0 },
    };
    render(<AgentNode data={data} isConnectable={true} />);
    expect(screen.getByTestId('using-tool-anim')).toBeInTheDocument();
  });

  it('does not show animation bubbles for READY status', () => {
    const data = {
      ...baseData,
      avatar: '/img/a.png',
      agentState: { status: 'READY', totalTokens: 0, messageCount: 0, cycleCount: 0, latency: 0 },
    };
    render(<AgentNode data={data} isConnectable={true} />);
    expect(screen.queryByTestId('working-anim')).not.toBeInTheDocument();
    expect(screen.queryByTestId('thinking-anim')).not.toBeInTheDocument();
  });

  it('does not show animation bubbles for STOPPED status', () => {
    const data = {
      ...baseData,
      avatar: '/img/a.png',
      agentState: { status: 'STOPPED', totalTokens: 0, messageCount: 0, cycleCount: 0, latency: 0 },
    };
    render(<AgentNode data={data} isConnectable={true} />);
    expect(screen.queryByTestId('working-anim')).not.toBeInTheDocument();
  });

  it('renders source and target handles', () => {
    render(<AgentNode data={baseData} isConnectable={true} />);
    expect(screen.getByTestId('handle-source')).toBeInTheDocument();
    expect(screen.getByTestId('handle-target')).toBeInTheDocument();
  });

  it('formats latency in milliseconds', () => {
    const data = {
      ...baseData,
      agentState: { status: 'WORKING', totalTokens: 0, messageCount: 0, cycleCount: 0, latency: 500 },
    };
    render(<AgentNode data={data} isConnectable={true} />);
    expect(screen.getByText('500ms')).toBeInTheDocument();
  });

  it('formats latency in minutes', () => {
    const data = {
      ...baseData,
      agentState: { status: 'WORKING', totalTokens: 0, messageCount: 0, cycleCount: 0, latency: 125000 },
    };
    render(<AgentNode data={data} isConnectable={true} />);
    expect(screen.getByText('2 min 05s')).toBeInTheDocument();
  });
});

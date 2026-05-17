import { render, type RenderOptions } from '@testing-library/react'
import { type ReactElement } from 'react'
import { vi } from 'vitest'
import { ToastProvider } from '../contexts/ToastContext'
import ErrorBoundary from '../components/common/ErrorBoundary'

// Custom render function that includes providers
// eslint-disable-next-line react-refresh/only-export-components
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <ErrorBoundary>
      <ToastProvider>
        {children}
      </ToastProvider>
    </ErrorBoundary>
  )
}

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options })

// Re-export everything
// eslint-disable-next-line react-refresh/only-export-components
export * from '@testing-library/react'
export { customRender as render }

// Mock data factories
export const createMockProject = (overrides = {}) => ({
  id: 'test-project-id',
  name: 'Test Project',
  prompt: 'Test project description',
  agentsPattern: 'mono',
  status: 'active',
  url: '',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  ...overrides,
})

export const createMockTask = (overrides: Record<string, unknown> = {}) => ({
  id: 'test-task-id',
  name: 'Test Task',
  content: 'Test task content',
  status: 'CREATED' as const,
  projectId: 'test-project-id',
  sessionId: 'test-session-id',
  createdBy: 'test-agent',
  assignee: 'test-agent',
  result: null as string | null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  ...overrides,
})

export const createMockAgentEvent = (overrides = {}) => ({
  id: 'test-event-id',
  agentName: 'Test Agent',
  callerAgentId: 'caller-id',
  callerAgentName: 'Caller Agent',
  message: 'Test message',
  projectId: 'test-project-id',
  taskId: 'test-task-id',
  startTime: 1640995200,
  endTime: 1640995260,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  ...overrides,
})

// Test helpers
export const waitForLoadingToFinish = () => 
  new Promise(resolve => setTimeout(resolve, 0))

export const mockConsoleError = () => {
  const originalError = console.error
  console.error = vi.fn()
  return () => {
    console.error = originalError
  }
}
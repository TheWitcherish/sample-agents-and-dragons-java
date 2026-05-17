import '@testing-library/jest-dom'
import { vi } from 'vitest'
import './mocks/server'

// Global type declarations for test helpers
declare global {
  // eslint-disable-next-line no-var
  var setMockError: (simulate: boolean) => void
  // eslint-disable-next-line no-var
  var setMockNetworkError: (simulate: boolean) => void
}

// Mock AWS Amplify with proper data simulation
const getInitialMockProjects = () => [
  {
    id: '1',
    name: 'Test Project 1',
    prompt: 'Build a web application',
    agentsPattern: 'mono',
    status: 'active',
    url: 'https://example.com/project1',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    name: 'Test Project 2',
    prompt: 'Create a mobile app',
    agentsPattern: 'orchestrator',
    status: 'completed',
    url: 'https://example.com/project2',
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  },
]

const getInitialMockTasks = () => [
  {
    id: '1',
    name: 'Setup project structure',
    content: 'Initialize the project with basic structure',
    status: 'done',
    projectId: '1',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    name: 'Implement authentication',
    content: 'Add user authentication system',
    status: 'in-progress',
    projectId: '1',
    createdAt: '2024-01-01T01:00:00Z',
    updatedAt: '2024-01-01T01:00:00Z',
  },
]

let mockProjects = getInitialMockProjects()
let mockTasks = getInitialMockTasks()

// Reset mock data and error flags before each test
beforeEach(() => {
  mockProjects = getInitialMockProjects()
  mockTasks = getInitialMockTasks()
  shouldSimulateError = false
  shouldSimulateNetworkError = false
})

// Global error simulation flags
let shouldSimulateError = false
let shouldSimulateNetworkError = false

// Helper to set error simulation
global.setMockError = (simulate: boolean) => {
  shouldSimulateError = simulate
}

global.setMockNetworkError = (simulate: boolean) => {
  shouldSimulateNetworkError = simulate
}

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(() => ({
    models: {
      Project: {
        observeQuery: vi.fn(() => ({
          subscribe: vi.fn((callbacks) => {
            // Simulate async data loading
            setTimeout(() => {
              if (shouldSimulateNetworkError) {
                callbacks.error(new Error('Network error'))
                return
              }
              if (shouldSimulateError) {
                callbacks.error(new Error('GraphQL error'))
                return
              }
              callbacks.next({
                items: mockProjects,
                isSynced: true,
              })
            }, 0)
            return {
              unsubscribe: vi.fn(),
            }
          }),
        })),
        create: vi.fn(async (input) => {
          if (shouldSimulateError) {
            throw new Error('Failed to create project')
          }
          const newProject = {
            id: Date.now().toString(),
            ...input,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          mockProjects.push(newProject)
          return { data: newProject }
        }),
        update: vi.fn(async (input) => {
          if (shouldSimulateError) {
            throw new Error('Failed to update project')
          }
          const projectIndex = mockProjects.findIndex(p => p.id === input.id)
          if (projectIndex !== -1) {
            mockProjects[projectIndex] = {
              ...mockProjects[projectIndex],
              ...input,
              updatedAt: new Date().toISOString(),
            }
            return { data: mockProjects[projectIndex] }
          }
          throw new Error('Project not found')
        }),
        delete: vi.fn(async (input) => {
          if (shouldSimulateError) {
            throw new Error('Failed to delete project')
          }
          const projectIndex = mockProjects.findIndex(p => p.id === input.id)
          if (projectIndex !== -1) {
            const deletedProject = mockProjects.splice(projectIndex, 1)[0]
            return { data: deletedProject }
          }
          throw new Error('Project not found')
        }),
        get: vi.fn(async (input) => {
          if (shouldSimulateError) {
            throw new Error('Failed to get project')
          }
          const project = mockProjects.find(p => p.id === input.id)
          return { data: project || null }
        }),
        list: vi.fn(async (filter) => {
          if (shouldSimulateError) {
            throw new Error('Failed to list projects')
          }
          const filteredProjects = mockProjects
          if (filter?.filter) {
            // Apply filters if needed
          }
          return { data: filteredProjects }
        }),
      },
      Task: {
        observeQuery: vi.fn((options) => ({
          subscribe: vi.fn((callbacks) => {
            // Simulate async data loading with filtering
            setTimeout(() => {
              if (shouldSimulateNetworkError) {
                callbacks.error(new Error('Network error'))
                return
              }
              if (shouldSimulateError) {
                callbacks.error(new Error('GraphQL error'))
                return
              }
              let filteredTasks = mockTasks
              if (options?.filter?.projectId?.eq) {
                filteredTasks = mockTasks.filter(task => task.projectId === options.filter.projectId.eq)
              }
              callbacks.next({
                items: filteredTasks,
                isSynced: true,
              })
            }, 0)
            return {
              unsubscribe: vi.fn(),
            }
          }),
        })),
        create: vi.fn(async (input) => {
          if (shouldSimulateError) {
            throw new Error('Failed to create task')
          }
          const newTask = {
            id: Date.now().toString(),
            ...input,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          mockTasks.push(newTask)
          return { data: newTask }
        }),
        update: vi.fn(async (input) => {
          if (shouldSimulateError) {
            throw new Error('Failed to update task')
          }
          const taskIndex = mockTasks.findIndex(t => t.id === input.id)
          if (taskIndex !== -1) {
            mockTasks[taskIndex] = {
              ...mockTasks[taskIndex],
              ...input,
              updatedAt: new Date().toISOString(),
            }
            return { data: mockTasks[taskIndex] }
          }
          throw new Error('Task not found')
        }),
        delete: vi.fn(async (input) => {
          if (shouldSimulateError) {
            throw new Error('Failed to delete task')
          }
          const taskIndex = mockTasks.findIndex(t => t.id === input.id)
          if (taskIndex !== -1) {
            const deletedTask = mockTasks.splice(taskIndex, 1)[0]
            return { data: deletedTask }
          }
          throw new Error('Task not found')
        }),
        get: vi.fn(async (input) => {
          if (shouldSimulateError) {
            throw new Error('Failed to get task')
          }
          const task = mockTasks.find(t => t.id === input.id)
          return { data: task || null }
        }),
        list: vi.fn(async (filter) => {
          if (shouldSimulateError) {
            throw new Error('Failed to list tasks')
          }
          let filteredTasks = mockTasks
          if (filter?.filter?.projectId?.eq) {
            filteredTasks = mockTasks.filter(task => task.projectId === filter.filter.projectId.eq)
          }
          return { data: filteredTasks }
        }),
      },
      AgentEvent: {
        observeQuery: vi.fn(() => ({
          subscribe: vi.fn((callbacks) => {
            setTimeout(() => {
              if (shouldSimulateNetworkError) {
                callbacks.error(new Error('Network error'))
                return
              }
              if (shouldSimulateError) {
                callbacks.error(new Error('GraphQL error'))
                return
              }
              callbacks.next({
                items: [],
                isSynced: true,
              })
            }, 0)
            return {
              unsubscribe: vi.fn(),
            }
          }),
        })),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        get: vi.fn(),
        list: vi.fn(),
      },
    },
  })),
}))

// Mock AWS SDK
vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: vi.fn(() => ({
    send: vi.fn().mockResolvedValue({
      StatusCode: 202,
      Payload: JSON.stringify({
        statusCode: 200,
        body: JSON.stringify({
          message: 'Lambda function invoked successfully',
          requestId: 'mock-request-id',
        }),
      }),
    }),
  })),
  InvokeCommand: vi.fn((params) => ({ input: params })),
}))

// Mock AWS Amplify Auth
vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn(() => Promise.resolve({
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
      sessionToken: 'test',
    },
  })),
}))

// Mock AWS Amplify UI React
vi.mock('@aws-amplify/ui-react', () => ({
  Authenticator: ({ children }: { children: React.ReactNode }) => children,
  useAuthenticator: () => ({
    signOut: vi.fn(),
  }),
}))

// Mock React Router
vi.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }: { children: React.ReactNode }) => children,
  Routes: ({ children }: { children: React.ReactNode }) => children,
  Route: () => null,
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: 'test-id' }),
}))

// Mock React DnD
vi.mock('react-dnd/dist/hooks', () => ({
  useDrag: () => [{ isDragging: false }, vi.fn()],
  useDrop: () => [{ isOver: false }, vi.fn()],
}))

vi.mock('react-dnd/dist/core', () => ({
  DndProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('react-dnd-html5-backend', () => ({
  HTML5Backend: {},
}))

// Global test utilities
global.ResizeObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
import { renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import { useProjects } from '../useAmplifyData'

// Mock AWS Amplify
vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(() => ({
    models: {
      Project: {
        observeQuery: vi.fn(() => ({
          subscribe: vi.fn((callbacks) => {
            // Simulate initial loading state, then data
            setTimeout(() => {
              callbacks.next({
                items: [
                  {
                    id: '1',
                    name: 'Test Project',
                    prompt: 'Test prompt',
                    agentsPattern: 'mono',
                    status: 'active',
                    url: '',
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-01T00:00:00Z',
                  }
                ],
                isSynced: true,
              })
            }, 0)
            
            return {
              unsubscribe: vi.fn(),
            }
          }),
        })),
        create: vi.fn(),
        delete: vi.fn(),
      },
      Task: {
        observeQuery: vi.fn(() => ({
          subscribe: vi.fn(() => ({
            unsubscribe: vi.fn(),
          })),
        })),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
  })),
}))

// Mock AWS SDK
vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: vi.fn(() => ({
    send: vi.fn(),
  })),
  InvokeCommand: vi.fn(),
}))

// Mock Amplify auth
vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn(() => Promise.resolve({
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
      sessionToken: 'test',
    },
  })),
}))

// Mock amplify outputs
vi.mock('../../amplify_outputs.json', () => ({
  default: {
    custom: {
      aws_region: 'us-east-1',
    },
  },
}))

describe('useAmplifyData', () => {
  describe('useProjects', () => {
    it('should initialize with loading state', () => {
      const { result } = renderHook(() => useProjects())
      
      expect(result.current.projects).toEqual([])
      expect(result.current.loading).toBe(true)
      expect(result.current.error).toBeNull()
    })

    it('should provide createProject function', () => {
      const { result } = renderHook(() => useProjects())
      
      expect(typeof result.current.createProject).toBe('function')
    })



    it('should provide deleteProject function', () => {
      const { result } = renderHook(() => useProjects())
      
      expect(typeof result.current.deleteProject).toBe('function')
    })
  })
})
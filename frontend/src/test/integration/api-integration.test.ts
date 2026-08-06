import { describe, it, expect, vi, beforeEach } from 'vitest'
import { server } from '../mocks/server'
import { graphql, http, HttpResponse } from 'msw'

// Mock the amplify outputs
vi.mock('../../../amplify_outputs.json', () => ({
  default: {
    custom: {
      aws_region: 'us-east-1',
      function_name: 'test-function',
    },
    data: {
      url: 'https://test-api.appsync-api.us-east-1.amazonaws.com/graphql',
      api_key: 'test-api-key',
      aws_region: 'us-east-1',
    },
  },
}))

describe('API Integration Tests with MSW', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GraphQL API Integration', () => {
    it('should handle GraphQL query requests through MSW', async () => {
      // Test that MSW intercepts GraphQL queries
      const response = await fetch('https://test-api.appsync-api.us-east-1.amazonaws.com/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query ListProjects {
              listProjects {
                items {
                  id
                  name
                  agentsPattern
                  status
                }
              }
            }
          `,
        }),
      })

      expect(response.ok).toBe(true)
      const data = await response.json()
      
      expect(data.data.listProjects.items).toHaveLength(2)
      expect(data.data.listProjects.items[0]).toMatchObject({
        id: '1',
        name: 'Test Project 1',
        agentsPattern: 'mono',
        status: 'active',
      })
    })

    it('should handle GraphQL mutation requests through MSW', async () => {
      const response = await fetch('https://test-api.appsync-api.us-east-1.amazonaws.com/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            mutation CreateProject($input: CreateProjectInput!) {
              createProject(input: $input) {
                id
                name
                agentsPattern
                status
              }
            }
          `,
          variables: {
            input: {
              name: 'New Test Project',
              prompt: 'Test prompt',
              agentsPattern: 'orchestrator',
              status: 'active',
              url: '',
            },
          },
        }),
      })

      expect(response.ok).toBe(true)
      const data = await response.json()
      
      expect(data.data.createProject).toMatchObject({
        name: 'New Test Project',
        agentsPattern: 'orchestrator',
        status: 'active',
      })
      expect(data.data.createProject.id).toBeDefined()
    })

    it('should handle GraphQL errors through MSW', async () => {
      // Override the handler to return an error
      server.use(
        graphql.query('ListProjects', () => {
          return HttpResponse.json({
            errors: [{ message: 'Internal server error' }],
          })
        })
      )

      const response = await fetch('https://test-api.appsync-api.us-east-1.amazonaws.com/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query ListProjects {
              listProjects {
                items {
                  id
                  name
                }
              }
            }
          `,
        }),
      })

      expect(response.ok).toBe(true)
      const data = await response.json()
      
      expect(data.errors).toBeDefined()
      expect(data.errors[0].message).toBe('Internal server error')
    })

    it('should handle network errors through MSW', async () => {
      // Override the handler to return a network error
      server.use(
        graphql.query('ListProjects', () => {
          return HttpResponse.error()
        })
      )

      await expect(
        fetch('https://test-api.appsync-api.us-east-1.amazonaws.com/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `
              query ListProjects {
                listProjects {
                  items {
                    id
                    name
                  }
                }
              }
            `,
          }),
        })
      ).rejects.toThrow()
    })
  })

  describe('Lambda Function Integration', () => {
    it('should handle Lambda invocation requests through MSW', async () => {
      const response = await fetch('https://lambda.us-east-1.amazonaws.com/2015-03-31/functions/test-function/invocations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Amz-Invocation-Type': 'Event',
        },
        body: JSON.stringify({
          project: {
            id: '1',
            name: 'Test Project',
            agentsPattern: 'mono',
          },
          api: {
            url: 'https://test-api.appsync-api.us-east-1.amazonaws.com/graphql',
            apiKey: 'test-api-key',
            awsRegion: 'us-east-1',
          },
        }),
      })

      expect(response.ok).toBe(true)
      const data = await response.json()
      
      expect(data.StatusCode).toBe(202)
      expect(JSON.parse(data.Payload)).toMatchObject({
        statusCode: 200,
        body: expect.stringContaining('Lambda function invoked successfully'),
      })
    })

    it('should handle Lambda invocation errors through MSW', async () => {
      // Override the handler to return an error
      server.use(
        http.post('https://lambda.us-east-1.amazonaws.com/2015-03-31/functions/*/invocations', () => {
          return HttpResponse.json(
            { message: 'Function not found' },
            { status: 404 }
          )
        })
      )

      const response = await fetch('https://lambda.us-east-1.amazonaws.com/2015-03-31/functions/test-function/invocations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Amz-Invocation-Type': 'Event',
        },
        body: JSON.stringify({
          project: { id: '1', name: 'Test' },
          api: { url: 'test', apiKey: 'test', awsRegion: 'us-east-1' },
        }),
      })

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.message).toBe('Function not found')
    })
  })

  describe('Authentication Integration', () => {
    it('should handle Cognito authentication requests through MSW', async () => {
      const response = await fetch('https://cognito-idp.us-east-1.amazonaws.com/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
        },
        body: JSON.stringify({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: 'test-client-id',
          AuthParameters: {
            USERNAME: 'testuser',
            PASSWORD: 'testpassword',
          },
        }),
      })

      expect(response.ok).toBe(true)
      const data = await response.json()
      
      expect(data.AuthenticationResult).toBeDefined()
      expect(data.AuthenticationResult.AccessToken).toBe('mock-access-token')
      expect(data.AuthenticationResult.IdToken).toBe('mock-id-token')
      expect(data.AuthenticationResult.TokenType).toBe('Bearer')
    })

    it('should handle Cognito authentication errors through MSW', async () => {
      // Override the handler to return an error
      server.use(
        http.post('https://cognito-idp.us-east-1.amazonaws.com/', () => {
          return HttpResponse.json(
            {
              __type: 'NotAuthorizedException',
              message: 'Incorrect username or password.',
            },
            { status: 400 }
          )
        })
      )

      const response = await fetch('https://cognito-idp.us-east-1.amazonaws.com/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
        },
        body: JSON.stringify({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: 'test-client-id',
          AuthParameters: {
            USERNAME: 'wronguser',
            PASSWORD: 'wrongpassword',
          },
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.__type).toBe('NotAuthorizedException')
      expect(data.message).toBe('Incorrect username or password.')
    })
  })

  describe('Real-time Subscription Simulation', () => {
    it('should simulate real-time updates through periodic polling', async () => {
      let callCount = 0
      
      // Override handler to simulate data changes
      server.use(
        graphql.query('ListProjects', () => {
          callCount++
          const projects = callCount === 1 
            ? [{ id: '1', name: 'Initial Project', status: 'active' }]
            : [
                { id: '1', name: 'Initial Project', status: 'active' },
                { id: '2', name: 'New Project', status: 'active' },
              ]
          
          return HttpResponse.json({
            data: {
              listProjects: {
                items: projects,
                nextToken: null,
              },
            },
          })
        })
      )

      // First call - initial state
      const response1 = await fetch('https://test-api.appsync-api.us-east-1.amazonaws.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'query ListProjects { listProjects { items { id name status } } }',
        }),
      })

      const data1 = await response1.json()
      expect(data1.data.listProjects.items).toHaveLength(1)

      // Second call - simulated real-time update
      const response2 = await fetch('https://test-api.appsync-api.us-east-1.amazonaws.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'query ListProjects { listProjects { items { id name status } } }',
        }),
      })

      const data2 = await response2.json()
      expect(data2.data.listProjects.items).toHaveLength(2)
      expect(data2.data.listProjects.items[1].name).toBe('New Project')
    })

    it('should handle subscription connection errors', async () => {
      // Simulate WebSocket connection failure by returning error for subscription-like requests
      server.use(
        graphql.query('OnCreateProject', () => {
          return HttpResponse.error()
        })
      )

      await expect(
        fetch('https://test-api.appsync-api.us-east-1.amazonaws.com/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'subscription OnCreateProject { onCreateProject { id name } }',
          }),
        })
      ).rejects.toThrow()
    })
  })

  describe('End-to-End API Flow', () => {
    it('should handle complete project creation flow with Lambda invocation', async () => {
      // Step 1: Create project via GraphQL
      const createResponse = await fetch('https://test-api.appsync-api.us-east-1.amazonaws.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation CreateProject($input: CreateProjectInput!) {
              createProject(input: $input) {
                id
                name
                agentsPattern
                status
              }
            }
          `,
          variables: {
            input: {
              name: 'E2E Test Project',
              prompt: 'End-to-end test',
              agentsPattern: 'graph',
              status: 'active',
              url: '',
            },
          },
        }),
      })

      expect(createResponse.ok).toBe(true)
      const createData = await createResponse.json()
      const projectId = createData.data.createProject.id

      // Step 2: Invoke Lambda function
      const lambdaResponse = await fetch('https://lambda.us-east-1.amazonaws.com/2015-03-31/functions/test-function/invocations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Amz-Invocation-Type': 'Event',
        },
        body: JSON.stringify({
          project: createData.data.createProject,
          api: {
            url: 'https://test-api.appsync-api.us-east-1.amazonaws.com/graphql',
            apiKey: 'test-api-key',
            awsRegion: 'us-east-1',
          },
        }),
      })

      expect(lambdaResponse.ok).toBe(true)

      // Step 3: Verify project exists in list
      const listResponse = await fetch('https://test-api.appsync-api.us-east-1.amazonaws.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'query ListProjects { listProjects { items { id name agentsPattern } } }',
        }),
      })

      const listData = await listResponse.json()
      const createdProject = listData.data.listProjects.items.find((p: Record<string, unknown>) => p.id === projectId)

      expect(createdProject).toBeDefined()
      expect(createdProject.name).toBe('E2E Test Project')
      expect(createdProject.agentsPattern).toBe('graph')
    })

    it('should handle error scenarios gracefully in complete flow', async () => {
      // Step 1: Create project successfully
      const createResponse = await fetch('https://test-api.appsync-api.us-east-1.amazonaws.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation CreateProject($input: CreateProjectInput!) {
              createProject(input: $input) {
                id
                name
                status
              }
            }
          `,
          variables: {
            input: {
              name: 'Error Test Project',
              prompt: 'Test error handling',
              agentsPattern: 'mono',
              status: 'active',
              url: '',
            },
          },
        }),
      })

      expect(createResponse.ok).toBe(true)
      const createData = await createResponse.json()

      // Step 2: Lambda invocation fails (but project should still exist)
      server.use(
        http.post('https://lambda.us-east-1.amazonaws.com/2015-03-31/functions/*/invocations', () => {
          return HttpResponse.json(
            { message: 'Lambda error' },
            { status: 500 }
          )
        })
      )

      const lambdaResponse = await fetch('https://lambda.us-east-1.amazonaws.com/2015-03-31/functions/test-function/invocations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Amz-Invocation-Type': 'Event',
        },
        body: JSON.stringify({
          project: createData.data.createProject,
          api: { url: 'test', apiKey: 'test', awsRegion: 'us-east-1' },
        }),
      })

      expect(lambdaResponse.status).toBe(500)

      // Step 3: Project should still exist despite Lambda failure
      const listResponse = await fetch('https://test-api.appsync-api.us-east-1.amazonaws.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'query ListProjects { listProjects { items { id name } } }',
        }),
      })

      const listData = await listResponse.json()
      const createdProject = listData.data.listProjects.items.find(
        (p: Record<string, unknown>) => p.id === createData.data.createProject.id
      )
      
      expect(createdProject).toBeDefined()
      expect(createdProject.name).toBe('Error Test Project')
    })
  })
})
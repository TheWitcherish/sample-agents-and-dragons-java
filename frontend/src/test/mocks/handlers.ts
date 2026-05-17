import { graphql, http, HttpResponse } from 'msw'

// Mock data
const mockProjects = [
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
    agentsPattern: 'hierarchical',
    status: 'completed',
    url: 'https://example.com/project2',
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  },
]

const mockTasks = [
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

const mockAgentEvents = [
  {
    id: '1',
    agentName: 'Senior Developer',
    callerAgentId: 'agent-1',
    callerAgentName: 'Junior Developer',
    message: 'Code review completed',
    projectId: '1',
    taskId: '1',
    startTime: 1704067200,
    endTime: 1704067260,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
]

export const handlers = [
  // GraphQL handlers for AppSync
  graphql.query('ListProjects', () => {
    return HttpResponse.json({
      data: {
        listProjects: {
          items: mockProjects,
          nextToken: null,
        },
      },
    })
  }),

  graphql.mutation('CreateProject', ({ variables }) => {
    const newProject = {
      id: Date.now().toString(),
      ...variables.input,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    mockProjects.push(newProject)
    return HttpResponse.json({
      data: {
        createProject: newProject,
      },
    })
  }),

  graphql.mutation('UpdateProject', ({ variables }) => {
    const projectIndex = mockProjects.findIndex(p => p.id === variables.input.id)
    if (projectIndex !== -1) {
      mockProjects[projectIndex] = {
        ...mockProjects[projectIndex],
        ...variables.input,
        updatedAt: new Date().toISOString(),
      }
      return HttpResponse.json({
        data: {
          updateProject: mockProjects[projectIndex],
        },
      })
    }
    return HttpResponse.json({
      errors: [{ message: 'Project not found' }],
    })
  }),

  graphql.mutation('DeleteProject', ({ variables }) => {
    const projectIndex = mockProjects.findIndex(p => p.id === variables.input.id)
    if (projectIndex !== -1) {
      const deletedProject = mockProjects.splice(projectIndex, 1)[0]
      return HttpResponse.json({
        data: {
          deleteProject: deletedProject,
        },
      })
    }
    return HttpResponse.json({
      errors: [{ message: 'Project not found' }],
    })
  }),

  graphql.query('ListTasks', ({ variables }) => {
    const filteredTasks = variables?.filter?.projectId?.eq 
      ? mockTasks.filter(task => task.projectId === variables.filter.projectId.eq)
      : mockTasks
    
    return HttpResponse.json({
      data: {
        listTasks: {
          items: filteredTasks,
          nextToken: null,
        },
      },
    })
  }),

  graphql.mutation('CreateTask', ({ variables }) => {
    const newTask = {
      id: Date.now().toString(),
      ...variables.input,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    mockTasks.push(newTask)
    return HttpResponse.json({
      data: {
        createTask: newTask,
      },
    })
  }),

  graphql.mutation('UpdateTask', ({ variables }) => {
    const taskIndex = mockTasks.findIndex(t => t.id === variables.input.id)
    if (taskIndex !== -1) {
      mockTasks[taskIndex] = {
        ...mockTasks[taskIndex],
        ...variables.input,
        updatedAt: new Date().toISOString(),
      }
      return HttpResponse.json({
        data: {
          updateTask: mockTasks[taskIndex],
        },
      })
    }
    return HttpResponse.json({
      errors: [{ message: 'Task not found' }],
    })
  }),

  graphql.mutation('DeleteTask', ({ variables }) => {
    const taskIndex = mockTasks.findIndex(t => t.id === variables.input.id)
    if (taskIndex !== -1) {
      const deletedTask = mockTasks.splice(taskIndex, 1)[0]
      return HttpResponse.json({
        data: {
          deleteTask: deletedTask,
        },
      })
    }
    return HttpResponse.json({
      errors: [{ message: 'Task not found' }],
    })
  }),

  graphql.query('ListAgentEvents', ({ variables }) => {
    const filteredEvents = variables?.filter?.projectId?.eq 
      ? mockAgentEvents.filter(event => event.projectId === variables.filter.projectId.eq)
      : mockAgentEvents
    
    return HttpResponse.json({
      data: {
        listAgentEvents: {
          items: filteredEvents,
          nextToken: null,
        },
      },
    })
  }),

  graphql.mutation('CreateAgentEvent', ({ variables }) => {
    const newEvent = {
      id: Date.now().toString(),
      ...variables.input,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    mockAgentEvents.push(newEvent)
    return HttpResponse.json({
      data: {
        createAgentEvent: newEvent,
      },
    })
  }),

  // Note: GraphQL subscriptions are handled by the mocked observeQuery in the test setup
  // Real-time functionality is tested through the observeQuery mock implementation

  // AWS Lambda invocation mock
  http.post('https://lambda.us-east-1.amazonaws.com/2015-03-31/functions/*/invocations', () => {
    return HttpResponse.json({
      StatusCode: 202,
      Payload: JSON.stringify({
        statusCode: 200,
        body: JSON.stringify({
          message: 'Lambda function invoked successfully',
          requestId: 'mock-request-id',
        }),
      }),
    })
  }),

  // AWS Cognito authentication mock
  http.post('https://cognito-idp.us-east-1.amazonaws.com/', ({ request }) => {
    const target = request.headers.get('X-Amz-Target')
    
    if (target === 'AWSCognitoIdentityProviderService.InitiateAuth') {
      return HttpResponse.json({
        AuthenticationResult: {
          AccessToken: 'mock-access-token',
          IdToken: 'mock-id-token',
          RefreshToken: 'mock-refresh-token',
          TokenType: 'Bearer',
          ExpiresIn: 3600,
        },
      })
    }
    
    if (target === 'AWSCognitoIdentityProviderService.GetUser') {
      return HttpResponse.json({
        Username: 'testuser',
        UserAttributes: [
          { Name: 'email', Value: 'test@example.com' },
          { Name: 'email_verified', Value: 'true' },
        ],
      })
    }
    
    return HttpResponse.json({})
  }),

  // AWS STS assume role mock
  http.post('https://sts.amazonaws.com/', () => {
    return HttpResponse.json({
      AssumeRoleResponse: {
        AssumeRoleResult: {
          Credentials: {
            AccessKeyId: 'mock-access-key',
            SecretAccessKey: 'mock-secret-key',
            SessionToken: 'mock-session-token',
            Expiration: new Date(Date.now() + 3600000).toISOString(),
          },
        },
      },
    })
  }),
]

// Export mock data for use in tests
export { mockProjects, mockTasks, mockAgentEvents }
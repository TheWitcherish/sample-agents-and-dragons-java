import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { verifyOwner } from '../functions/verify-owner/resource';
import { manageTasks } from '../functions/manage-tasks/ressource';
import { invokeAgentRuntime } from '../functions/invoke-agent-runtime/resource';

const agenticPatterns = ['mono', 'orchestrator', 'swarm', 'graph'];
const TASK_STATUS = ['CREATED', 'IN_PROGRESS', 'COMPLETED','ABORTED','ON_ERROR'];
const PROJECT_STATUS = ['CREATED', 'IN_PROGRESS', 'COMPLETED','ABORTED','ON_ERROR'];
const AGENT_STATUS = ['READY', 'WORKING', 'THINKING', 'USING_TOOL', 'WAITING', 'STOPPED'];

const schema = a.schema({

  AgenticPattern: a.customType({
    name: a.string().required(),
    runtime: a.string().required(),
  }),

  Quest: a
    .model({

      //core properties
      name: a.string(),
      prompt: a.string(),

      //filtering properties
      mandatoryAgentRoles: a.string().array(),
      authorizedAgentList: a.string().array(),
      authorizedPatternList: a.ref('AgenticPattern').array(),

      //display properties 
      teamDirectionSamples: a.string().array(),
    })
    .authorization((allow) => [
//      allow.guest().to(['read']),
      allow.authenticated().to(['read']),
      allow.group('ADMINS').to(['create', 'read', 'update', 'delete'])
    ]),


  Agent: a
    .model({

      //core properties
      name: a.string(),
      prompt: a.string(),
      model: a.string(),
      tools: a.string().array(),
      role: a.string(),

      //display properties
      avatar: a.string(),
      roleDisplayName: a.string(),
      skills: a.string().array(),
      modelDisplayName: a.string(),
      speed: a.integer(),
      precision: a.integer(),
      frugality: a.integer(),

      //filtering properties
      compatiblePatterns: a.string().array(),
      cost: a.integer(),
    })
    .authorization((allow) => [
//      allow.guest().to(['read']),
      allow.authenticated().to(['read']),
      allow.authenticated('identityPool').to(['read']),
      allow.group('ADMINS').to(['create', 'read', 'update', 'delete'])
    ]),
  
  AgentConnection: a.customType({
    source: a.string().required(),
    target: a.string().required(),
    description: a.string().required(),
  }),

  AgentVisualPosition: a.customType({
    agentId: a.string().required(),
    x: a.float().required(),
    y: a.float().required(),
  }),

  Task: a
    .model({
      name: a.string().required(),
      projectId: a.string(),
      sessionId: a.string().required(),
      content: a.string().required(),
      status: a.enum(TASK_STATUS),
      createdBy: a.string().required(),
      assignee: a.string().required(),
      result: a.string(),
    })
    .authorization((allow) => [
//      allow.guest().to(['read']),
      allow.authenticated().to(['read']),
      allow.authenticated('identityPool').to(['read']),
      allow.group('ADMINS').to(['create', 'read', 'update', 'delete'])
    ]),

  TaskEvent: a
    .model({
      taskId: a.string(),
      sessionId: a.string(),
      newStatus: a.enum(TASK_STATUS),
      newComment: a.string(),
      updatedBy: a.string(),
    })
    
    .authorization((allow) => [
//      allow.guest().to(['read']),
      allow.authenticated().to(['read']),
      allow.group('ADMINS').to(['create', 'read', 'update', 'delete'])
    ]),

  Project: a
    .model({
      ownerKey: a.string().authorization(allow => allow.authenticated()),

      questId: a.string(),
      name: a.string().required(),
      prompt: a.string().required(),

      teamName: a.string(),
      teamPrompt: a.string(),
      teamPattern: a.enum(agenticPatterns),
      teamEntrypoint: a.string().required(),

      agents: a.string().array(),
      agentsConnections: a.ref('AgentConnection').array(),
      agentsVisualPositions: a.ref('AgentVisualPosition').array(),

      url: a.string(),
      status: a.enum(PROJECT_STATUS),
      sessionId: a.string(),
    })
    .authorization((allow) => [
//      allow.guest().to(['read']),
      allow.authenticated().to(['create', 'read', 'update', 'delete']),
      allow.authenticated('identityPool').to(['create', 'read', 'update']),
      allow.group('ADMINS').to(['create', 'read', 'update', 'delete'])
    ]),

  AgentState: a.customType({
    status: a.enum(AGENT_STATUS),
    messageCount: a.integer(),
    cycleCount: a.integer(),
    inputTokens: a.integer(),
    outputTokens: a.integer(),
    totalTokens: a.integer(),
    latency: a.integer(),
    cycleDuration: a.float().array(),
    createdAt: a.datetime().required(),
  }),

  AgentRun: a
    .model({
      projectId: a.string().required(),
      agentId: a.string().required(),
      agentName: a.string(),
      state: a.ref('AgentState').array(),
    })
    .identifier(['projectId', 'agentId'])
    .authorization((allow) => [
//      allow.guest().to(['read']),
      allow.authenticated().to(['read']),
      allow.authenticated('identityPool').to(['read']),
      allow.group('ADMINS').to(['create', 'read', 'update', 'delete'])
    ]),

  AgentTransition: a
    .model({
      projectId: a.string().required(),
      transitionId: a.id().required(),
      sourceAgentId: a.string(),
      targetAgentId: a.string(),
    })
    .identifier(['projectId', 'transitionId'])
    .authorization((allow) => [
//      allow.guest().to(['read']),
      allow.authenticated().to(['read']),
      allow.authenticated('identityPool').to(['read']),
      allow.group('ADMINS').to(['create', 'read', 'update', 'delete'])
    ]),

  AgentMessage: a
    .model({
      projectId: a.string().required(),
      messageId: a.id().required(),
      agentId: a.string(),
      role: a.string(),
      text: a.string(),
    })
    .identifier(['projectId', 'messageId'])
    .authorization((allow) => [
//      allow.guest().to(['read']),
      allow.authenticated().to(['read']),
      allow.authenticated('identityPool').to(['read']),
      allow.group('ADMINS').to(['create', 'read', 'update', 'delete'])
    ]),

  AgentToolUse: a
    .model({
      projectId: a.string().required(),
      toolUseId: a.string().required(),
      agentId: a.string(),
      toolName: a.string(),
      toolInput: a.json(),
      toolOutput: a.json(),
    })
    .identifier(['projectId', 'toolUseId'])
    .authorization((allow) => [
//      allow.guest().to(['read']),
      allow.authenticated().to(['read']),
      allow.group('ADMINS').to(['create', 'read', 'update', 'delete'])
    ]),

  verifyOwner: a
    .query()
    .arguments({
      projectId: a.string(),
      ownerKey: a.string(),
    })
    .returns(a.string())
    .authorization(allow => [
      allow.guest()
    ])
    .handler(a.handler.function(verifyOwner)),

  manageTasks: a
    .query()
    .arguments({
      projectId: a.string(),
      sessionId: a.string(),
      name: a.string(),
      content: a.string(),
      status: a.enum(TASK_STATUS),
      createdBy: a.string(),
      assignee: a.string(),
    })
    .returns(a.string())
    .authorization(allow => [
      allow.group('ADMINS')
    ])
    .handler(a.handler.function(manageTasks)),

  AgentsPatternRuntime: a
    .model({
      agentsPattern: a.string().required(),
      runtimeName: a.string().required(),
      runtimeArn: a.string().required(),
    })
    .authorization((allow) => [
      allow.authenticated().to(['read']),
      allow.group('ADMINS')
    ]),

}).authorization(allow => [
  allow.resource(verifyOwner),
  allow.resource(manageTasks),
  allow.resource(invokeAgentRuntime),
]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'identityPool',
  },
});

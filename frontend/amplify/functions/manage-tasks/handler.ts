import type { Schema } from "../../data/resource"
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend-function/runtime';
import { env } from '$amplify/env/manage-tasks';
import type { Handler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();


export const handler: Handler = async (event, context) => {

  console.log("context",context);
  console.log("event",event);

  const clientContext = context.clientContext as { custom?: Record<string, string> } | undefined;

  console.log("Custom context", clientContext?.custom);

  const sessionId = clientContext?.custom?.bedrockAgentcoreSessionId??"";
  console.log("sessionId", sessionId);

  const bedrockAgentCoreToolName: string = clientContext?.custom?.bedrockAgentCoreToolName??event.tool;
  console.log("bedrockAgentCoreToolName", bedrockAgentCoreToolName);
  const delimiter = "___";
  const toolName = bedrockAgentCoreToolName?.substring(bedrockAgentCoreToolName.lastIndexOf(delimiter) + delimiter.length);
  console.log("toolName", toolName);

  if (toolName == 'create_task') {
  
    const { name, description, createdBy, assignee } = event;
    let projectId = event.projectId;
  
    console.log("createTask", name, description, createdBy, assignee, projectId);
  
    if(!projectId && sessionId) {
      const project = await client.models.Task.list({
        filter: {
          sessionId: {
            eq: sessionId
          }
        }
      });
      if (project.data.length == 0) {
        return({error: "projectId is missing and cannot be found for session "+sessionId});
      }
      projectId = project.data[0].projectId;
    }

    const result = await client.models.Task.create({ 
      name, 
      content: description, 
      projectId,
      sessionId,
      status: 'CREATED',
      createdBy, 
      assignee ,
    });
  
    return result;
  
  }
  else if (toolName == 'update_task') {
  
    const { taskId, newComment, newStatus, updatedBy } = event;
  
    const result = await client.models.TaskEvent.create({
      taskId,
      sessionId,
      newStatus,
      newComment,
      updatedBy,
    });
  
    await client.models.Task.update({
      id: taskId,
      status: newStatus,
      result: newComment
    }); 
  
    return result;
  
  }
  else if (toolName == 'read_task') {
    const { taskId } = event;
    const result = await client.models.Task.get({
      id: taskId,
    });
    return result;
  }
  else if (toolName == 'save_agent_state') {
    const { projectId, agentId, agentName, status, cycleCount, messageCount, inputTokens, outputTokens, totalTokens, latency, cycleDurations} = event;
    const existingAgentRun = await client.models.AgentRun.get({projectId : projectId, agentId : agentId});
    if(existingAgentRun.data) {
      const newState = {
            status,
            cycleCount,
            messageCount,
            inputTokens,
            outputTokens,
            totalTokens,
            latency,
            cycleDurations,
            createdAt: new Date().toISOString(),
          };
      const currentState = existingAgentRun.data.state || [];
      const updatedState = [...currentState, newState];
      const result = await client.models.AgentRun.update({
        projectId: projectId,
        agentId: agentId,
        agentName: agentName,
        state: updatedState,
      });
      return result;
    }
    else {
      const result = await client.models.AgentRun.create({
        projectId,
        agentId,
        agentName,
        state: [
          {
            status,
            cycleCount,
            messageCount,
            inputTokens,
            outputTokens,
            totalTokens,
            createdAt: new Date().toISOString(),
          }
        ]
      });
      return result;
    }
  }
  else if (toolName == 'save_agent_transition') {
    const { projectId, transitionId, sourceAgentId, targetAgentId} = event;
    const result = await client.models.AgentTransition.create({
      projectId,
      transitionId,
      sourceAgentId,
      targetAgentId,
    });
    return result;
  }
  else if (toolName == 'save_project_state') {
    const { projectId, status, url} = event;
    const updateData = {
      id: projectId as string,
      status: status as Parameters<typeof client.models.Project.update>[0]['status'],
      ...(url ? { url: url as string } : {}),
    };
    console.log("save_project_state updateData", JSON.stringify(updateData));
    const result = await client.models.Project.update(updateData, { authMode: 'iam' });
    console.log("save_project_state result", JSON.stringify(result));
    return result;
  }
  else if (toolName == 'save_agent_message') {
    const { projectId, agentId, role, text} = event;
    const result = await client.models.AgentMessage.create({
      projectId,
      messageId: uuidv4(),
      agentId,
      role,
      text,
    });
    return result;
  }
  else {
    console.log("unknown tool", toolName);
    return {error: "unknown tool "+toolName}
  }

}
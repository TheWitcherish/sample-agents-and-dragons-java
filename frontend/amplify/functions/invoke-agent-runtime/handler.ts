import type { Schema } from "../../data/resource"
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend-function/runtime';
import { env } from '$amplify/env/invoke-agent-runtime';
import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from '@aws-sdk/client-bedrock-agentcore';
import { ProjectRequestPayload } from '../../../src/types';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const dataClient = generateClient<Schema>();

const validatePayload = (payload: ProjectRequestPayload): string[] => {
    const errors: string[] = [];
    
    if (!payload.project?.id) errors.push("Missing project.id");
    if (!payload.project?.name) errors.push("Missing project.name");
    if (!payload.project?.prompt) errors.push("Missing project.prompt");
    
    if (!payload.team?.name) errors.push("Missing team.name");
    if (!payload.team?.pattern) errors.push("Missing team.pattern");
    if (!payload.team?.entrypoint) errors.push("Missing team.entrypoint");
    if (!Array.isArray(payload.team?.agents)) errors.push("Missing or invalid team.agents array");
    if (!Array.isArray(payload.team?.connections)) errors.push("Missing or invalid team.connections array");
    
    if (!payload.config?.gateway_url) errors.push("Missing config.gateway_url");
    if (!payload.config?.token) errors.push("Missing config.token");
    if (!payload.config?.s3_bucket_name) errors.push("Missing config.s3_bucket_name");
    
    return errors;
};

export const handler = async (event: { payload: ProjectRequestPayload }) => {
    const startTime = Date.now();
    console.log("[START] invokeAgentRuntime handler");
    console.log(`[INPUT] Event keys: ${Object.keys(event).join(", ")}`);

    try {
        const requestPayload: ProjectRequestPayload = event.payload;
        
        const validationErrors = validatePayload(requestPayload);
        if (validationErrors.length > 0) {
            console.error(`[VALIDATION_ERRORS] ${validationErrors.join("; ")}`);
            throw new Error(`Payload validation failed: ${validationErrors.join("; ")}`);
        }

        console.log(`[PAYLOAD_VALID] Project: ${requestPayload.project.id}, Pattern: ${requestPayload.team.pattern}, Agents: ${requestPayload.team.agents.length}`);
        console.log(`[PAYLOAD_DETAILS] Team name: ${requestPayload.team.name}, Entrypoint: ${requestPayload.team.entrypoint}`);
        console.log(`[PAYLOAD_CONFIG] Gateway: ${requestPayload.config.gateway_url}, Bucket: ${requestPayload.config.s3_bucket_name}`);

        console.log(`[QUERY] Fetching AgentsPatternRuntime for pattern: ${requestPayload.team.pattern}`);
        const { data: patternRuntimes, errors } = await dataClient.models.AgentsPatternRuntime.list({
            filter: { agentsPattern: { eq: requestPayload.team.pattern } }
        });

        if (errors) {
            console.error(`[ERROR] Database query failed: ${JSON.stringify(errors)}`);
            throw new Error(`Database query failed: ${JSON.stringify(errors)}`);
        }

        console.log(`[QUERY_RESULT] Found ${patternRuntimes?.length || 0} runtime(s)`);
        if (patternRuntimes?.length) {
            patternRuntimes.forEach((rt, idx) => {
                console.log(`[RUNTIME_${idx}] Pattern: ${rt.agentsPattern}, Name: ${rt.runtimeName}, ARN: ${rt.runtimeArn}`);
            });
        }

        if (!patternRuntimes || patternRuntimes.length === 0) {
            throw new Error(`No runtime configured for pattern: ${requestPayload.team.pattern}`);
        }

        const agentRuntimeArn = patternRuntimes[0].runtimeArn;
        console.log(`[SELECTED_ARN] ${agentRuntimeArn}`);

        const client = new BedrockAgentCoreClient();
        const payloadStr = JSON.stringify(requestPayload);
        console.log(`[INVOKE] Calling BedrockAgentCore with ARN: ${agentRuntimeArn}`);
        console.log(`[PAYLOAD_SIZE] ${payloadStr.length} bytes`);
        console.log(`[PAYLOAD_STRUCTURE] project: ${Object.keys(requestPayload.project).join(",")}, team: ${Object.keys(requestPayload.team).join(",")}, config: ${Object.keys(requestPayload.config).join(",")}`);

        const command = new InvokeAgentRuntimeCommand({
            agentRuntimeArn,
            runtimeSessionId: `project-${requestPayload.project.id}`,
            payload: payloadStr,
            qualifier: 'DEFAULT'
        });

        console.log(`[INVOKE_COMMAND] Sending command to BedrockAgentCore`);
        const response = await client.send(command);
        console.log(`[RESPONSE] Status: Success, Session ID: ${response.runtimeSessionId}`);

        const responseSessionId = response.runtimeSessionId;

        console.log(`[UPDATE] Updating Project ${requestPayload.project.id} sessionId: ${responseSessionId}`);
        await dataClient.models.Project.update({
            id: requestPayload.project.id,
            sessionId: responseSessionId,
        });

        const duration = Date.now() - startTime;
        console.log(`[SUCCESS] Session launched: ${responseSessionId} (${duration}ms)`);

    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[FAILED] Error after ${duration}ms`);
        console.error(`[ERROR_TYPE] ${error instanceof Error ? error.constructor.name : typeof error}`);
        console.error(`[ERROR_MESSAGE] ${error instanceof Error ? error.message : String(error)}`);
        if (error instanceof Error && error.stack) {
            console.error(`[STACK_TRACE] ${error.stack}`);
        }
        throw error;
    }
}

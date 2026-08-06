import type { Schema } from "../../data/resource"
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend-function/runtime';
import { env } from '$amplify/env/verify-owner';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();

export const handler: Schema["verifyOwner"]["functionHandler"] = async (event) => {
  const { projectId } = event.arguments
  const { ownerKey } = event.arguments
  console.log("verifyOwner",projectId,ownerKey)
  let verified = 'guest';
  if (projectId) {
    const result = await client.models.Project.get({ id: projectId }, { authMode: 'iam' });
    console.log("loaded ownerKey",result?.data?.ownerKey);
    verified = result?.data?.ownerKey == ownerKey ? 'owner' : 'guest'
  }
  console.log("result",verified);
  return verified
}
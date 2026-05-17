import { defineFunction } from '@aws-amplify/backend';

export const manageTasks = defineFunction({
  name: 'manage-tasks',
  timeoutSeconds: 30,
});
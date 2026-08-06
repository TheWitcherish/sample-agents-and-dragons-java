import { defineFunction } from '@aws-amplify/backend';

export const verifyOwner = defineFunction({
  name: 'verify-owner',
  // optionally specify a path to your handler (defaults to "./handler.ts")
  //entry: './handler.ts'
});
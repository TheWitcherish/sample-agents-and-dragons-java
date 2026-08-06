import { Construct } from 'constructs';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';

export interface BedrockGuardrailProps {
  /** Guardrail name (alphanumeric, hyphens, underscores) */
  name: string;
  /** Optional description */
  description?: string;
}

export class BedrockGuardrail extends Construct {
  readonly guardrailId: string;
  readonly guardrailArn: string;
  readonly guardrailVersion: string;

  constructor(scope: Construct, id: string, props: BedrockGuardrailProps) {
    super(scope, id);

    const guardrail = new bedrock.CfnGuardrail(this, 'Guardrail', {
      name: props.name,
      description: props.description ?? 'Content safety guardrail for Agents and Dragons',
      blockedInputMessaging: 'Your request was blocked by our content safety policy. Please rephrase your message.',
      blockedOutputsMessaging: 'The response was blocked by our content safety policy. Please try a different question.',

      // Content filters: block only clearly harmful content
      contentPolicyConfig: {
        filtersConfig: [
          { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'INSULTS', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' },
          { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'VIOLENCE', inputStrength: 'LOW', outputStrength: 'LOW' },
          { type: 'MISCONDUCT', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' },
          { type: 'PROMPT_ATTACK', inputStrength: 'NONE', outputStrength: 'NONE' },
        ],
      },

      // Sensitive info: block critical PII only
      sensitiveInformationPolicyConfig: {
        piiEntitiesConfig: [
          { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'BLOCK' },
          { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
        ],
      },

      // Word filter: block profanity
      wordPolicyConfig: {
        managedWordListsConfig: [
          { type: 'PROFANITY' },
        ],
      },
    });

    this.guardrailId = guardrail.attrGuardrailId;
    this.guardrailArn = guardrail.attrGuardrailArn;
    this.guardrailVersion = 'DRAFT';
  }
}

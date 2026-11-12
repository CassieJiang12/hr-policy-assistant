import { z } from 'zod/v4';

export const MODEL_OUTPUT_SCHEMA_NAME = 'policy_ask';

export const modelAskOutputSchema = z.object({
  status: z.enum(['answered', 'needs_clarification', 'not_found']),
  answer: z.string(),
  evidence_ids: z.array(z.string()),
});

export type ModelAskOutput = z.infer<typeof modelAskOutputSchema>;

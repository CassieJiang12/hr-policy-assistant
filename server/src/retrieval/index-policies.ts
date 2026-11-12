import 'dotenv/config';
import { getRetrievalSettings, readOpenAiSettings } from '../config/app-config.js';
import { readPolicyDocuments, resolvePoliciesPath } from '../policies/load-policies.js';
import { PolicyDataError } from '../policies/validate-policy-records.js';
import { AppHttpException } from '../http/app-http.exception.js';
import { buildPolicyIndex } from './build-policy-index.js';
import { createOpenAiEmbedder } from './openai-embeddings.js';

const settings = readOpenAiSettings();
if (!settings.apiKey) {
  console.error('OPENAI_API_KEY is required in server/.env to build the policy index.');
  process.exit(1);
}

const retrieval = getRetrievalSettings();
try {
  const policies = readPolicyDocuments(resolvePoliciesPath());
  const index = await buildPolicyIndex({
    policies,
    embeddingModel: retrieval.embeddingModel,
    outputPath: retrieval.indexPath,
    embed: createOpenAiEmbedder({
      apiKey: settings.apiKey,
      model: retrieval.embeddingModel,
      timeoutMs: 15_000,
      maxRetries: 1,
      dimensions: retrieval.dimensions,
      requestId: 'index-policies',
    }),
  });
  console.log(
    `Wrote ${retrieval.indexPath} records=${index.records.length} model=${index.embedding_model} dimensions=${index.dimensions} source_hash=${index.source_hash}`,
  );
} catch (error) {
  if (error instanceof PolicyDataError) {
    console.error(error.message);
    process.exit(1);
  }
  if (error instanceof AppHttpException) {
    const body = error.getResponse() as { error?: { message?: string } };
    console.error(body.error?.message ?? 'The embedding request failed.');
    process.exit(1);
  }
  console.error('Failed to build the policy index.');
  process.exit(1);
}

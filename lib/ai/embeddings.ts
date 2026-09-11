/**
 * Gemini Embeddings (M12)
 *
 * Server-side only. Turns text (knowledge chunks at ingestion time,
 * user queries at retrieval time) into fixed-length vectors for
 * pgvector similarity search.
 *
 * Mirrors the model-fallback pattern already established in
 * `lib/ai/incident-extraction.ts` (env-driven model chain, retryable-
 * provider-error detection, per-model timeout budget, never throws) —
 * that file is intentionally NOT imported from or refactored here.
 * It is a completed, working module; duplicating ~20 lines of small
 * matching logic is safer than reaching into it for a shared helper it
 * was never designed to export, per AGENTS.md's "avoid unnecessary
 * refactoring outside the assigned module" rule.
 */
import { GoogleGenAI } from '@google/genai';

/**
 * Model fallback chain (env-driven, no hard-coded model as the sole
 * option). `gemini-embedding-001` is the current Gemini embedding
 * model at the time of writing; `text-embedding-004` (the model named
 * in most older RAG tutorials) is kept only as a documented fallback,
 * since the installed `@google/genai` SDK still accepts it and it may
 * still be enabled on some API keys/projects.
 */
const EMBEDDING_MODEL_CHAIN = [
  process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
  process.env.GEMINI_EMBEDDING_FALLBACK_MODEL || 'text-embedding-004',
].filter((model, index, all) => all.indexOf(model) === index);

/**
 * Must match the pre-existing `vector(768)` column on
 * `knowledge_chunks` (M02) exactly, or the insert will fail. Both
 * `gemini-embedding-001` (which supports 768/1536/3072 via
 * `outputDimensionality`) and `text-embedding-004` (768 native) can
 * satisfy this.
 */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * Per-model timeout budget. Each model in the chain gets its own
 * independent budget rather than one shared/shrinking deadline — see
 * the identical fix and rationale in lib/rag/generation.ts, derived
 * from real M12 verification testing. 25000ms matches the value
 * chosen there for consistency.
 */
const PER_MODEL_TIMEOUT_MS = 25000;

export type EmbeddingTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

export type EmbeddingFailureReason =
  | 'missing_api_key'
  | 'timeout'
  | 'invalid_output'
  | 'provider_error';

export type EmbeddingResult =
  | { ok: true; data: number[][] }
  | { ok: false; reason: EmbeddingFailureReason; message: string };

/**
 * Whether a failure is worth retrying against the next model in the
 * chain, as opposed to a definitive failure (e.g. an invalid API key,
 * a malformed request) that will fail identically on every model.
 *
 * Originally matched only explicit provider-side "busy" signals
 * (503/UNAVAILABLE/overloaded). Broadened during real M12 verification
 * after observing a live `"fetch failed"` error (Node's generic
 * message for a failed underlying HTTP request — DNS, connection
 * reset, transient network blip) cause the chain to give up after
 * only the first model, without ever trying the fallback — a network
 * hiccup is not specific to which model was being called, so it
 * deserves the same fallback chance a provider 503 gets.
 */
function isRetryableProviderError(err: unknown): boolean {
  const status =
    err && typeof err === 'object' && 'status' in err
      ? (err as { status?: unknown }).status
      : undefined;

  if (
    status === 503 ||
    status === '503' ||
    status === 429 ||
    status === '429'
  ) {
    return true;
  }

  const message = err instanceof Error ? err.message : String(err);
  // 429/RESOURCE_EXHAUSTED/quota added after real M12 verification
  // testing hit a live free-tier per-model daily quota error — see
  // the identical rationale in lib/rag/generation.ts.
  return /\b503\b|\b429\b|UNAVAILABLE|overloaded|high demand|RESOURCE_EXHAUSTED|quota|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network/i.test(
    message,
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Embeds one or more texts in a single request, preserving input
 * order in the output. Never throws — always resolves to an
 * EmbeddingResult, matching `extractIncident()`'s contract so callers
 * can fail safely.
 *
 * `taskType` follows Gemini's documented embedding task types:
 * `RETRIEVAL_DOCUMENT` for ingestion-time chunk embeddings,
 * `RETRIEVAL_QUERY` for a user's RAG query — using matched task types
 * on both sides measurably improves retrieval quality over leaving it
 * unset.
 */
export async function embedTexts(
  texts: string[],
  taskType: EmbeddingTaskType,
): Promise<EmbeddingResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    return {
      ok: false,
      reason: 'missing_api_key',
      message: 'Embedding generation is currently unavailable.',
    };
  }

  if (texts.length === 0) {
    return { ok: true, data: [] };
  }

  const ai = new GoogleGenAI({ apiKey });

  let lastErr: unknown;

  for (let i = 0; i < EMBEDDING_MODEL_CHAIN.length; i++) {
    const model = EMBEDDING_MODEL_CHAIN[i];

    try {
      const response = await withTimeout(
        ai.models.embedContent({
          model,
          contents: texts,
          config: {
            taskType,
            outputDimensionality: EMBEDDING_DIMENSIONS,
          },
        }),
        PER_MODEL_TIMEOUT_MS,
      );

      const embeddings = response.embeddings;
      if (!embeddings || embeddings.length !== texts.length) {
        return {
          ok: false,
          reason: 'invalid_output',
          message: 'Embedding generation returned an unexpected result.',
        };
      }

      const vectors: number[][] = [];
      for (const embedding of embeddings) {
        if (
          !embedding.values ||
          embedding.values.length !== EMBEDDING_DIMENSIONS
        ) {
          return {
            ok: false,
            reason: 'invalid_output',
            message: 'Embedding generation returned an unexpected result.',
          };
        }
        vectors.push(embedding.values);
      }

      return { ok: true, data: vectors };
    } catch (err) {
      lastErr = err;
      const isLastModel = i === EMBEDDING_MODEL_CHAIN.length - 1;
      const message = err instanceof Error ? err.message : String(err);

      if (process.env.NODE_ENV === 'development') {
        console.error(`RescueMesh embedding model "${model}" failed:`, message);
      }

      // A per-model timeout is itself retryable now (the next model
      // gets its own fresh budget) — only a genuinely non-retryable
      // error, or exhausting every model, stops the loop early.
      if (
        (message !== 'timeout' && !isRetryableProviderError(err)) ||
        isLastModel
      ) {
        break;
      }
      // Retryable failure and models remain — try the next one.
    }
  }

  const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
  if (message === 'timeout') {
    return {
      ok: false,
      reason: 'timeout',
      message: 'Embedding generation could not be completed. Please try again.',
    };
  }
  return {
    ok: false,
    reason: 'provider_error',
    message: 'Embedding generation could not be completed. Please try again.',
  };
}

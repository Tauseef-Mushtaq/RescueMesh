/**
 * AI Incident Extraction (M05)
 *
 * Server-side only. Turns a raw emergency report + user-supplied form
 * context into structured incident data using Gemini.
 *
 * This module does NOT calculate priority/severity and does NOT persist
 * anything — see AGENTS.md. It only understands the report; deterministic
 * application code (M06+) makes decisions from its output.
 */
import { GoogleGenAI, Type } from '@google/genai';

import {
  EXTRACTION_LANGUAGES,
  INCIDENT_TYPES,
  SAFE_DEFAULT_EXTRACTION,
  validateExtractedIncident,
  type ExtractedIncident,
} from '@/lib/validation/incident-extraction';

/** Mirrors the relevant subset of M04's ReportFormData, already parsed to real types. */
export interface IncidentExtractionInput {
  reportText: string;
  latitude: number | null;
  longitude: number | null;
  peopleAffected: number | null;
  childrenCount: number | null;
  elderlyCount: number | null;

  /** Reporter-selected language, if any. "auto" means "let the AI detect it". */
  language: 'auto' | 'en' | 'ur' | 'ur-roman';

  immediateDanger: boolean;
  medicalEmergency: boolean;
  mobilityImpairment: boolean;
  foodShortage: boolean;
  waterRisk: boolean;
  needs: string[];
}

export type ExtractionFailureReason =
  | 'missing_api_key'
  | 'timeout'
  | 'invalid_output'
  | 'provider_error';

export type ExtractionResult =
  | { ok: true; data: ExtractedIncident }
  | { ok: false; reason: ExtractionFailureReason; message: string };

/**
 * Model fallback chain (env-driven, no hard-coded model names).
 *
 * Order: GEMINI_MODEL -> GEMINI_FALLBACK_MODEL -> GEMINI_SECONDARY_FALLBACK_MODEL.
 * Falls back only on retryable provider/availability errors (e.g. 503
 * UNAVAILABLE / "high demand") — never for malformed application input,
 * and never as a way to paper over invalid-output bugs (those are
 * handled once, after a model successfully responds).
 */
const MODEL_CHAIN = [
  process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.7-flash',
  process.env.GEMINI_SECONDARY_FALLBACK_MODEL || 'gemini-3.6-flash',
].filter((model, index, all) => all.indexOf(model) === index); // de-dupe

const REQUEST_TIMEOUT_MS = 15000;

/**
 * True for provider-side availability errors worth retrying on the next
 * model in the chain (e.g. 503 UNAVAILABLE / "high demand"). False for
 * everything else (auth errors, bad requests, etc.) so we fail fast
 * instead of masking real bugs behind repeated retries.
 */
function isRetryableProviderError(err: unknown): boolean {
  const status =
    err && typeof err === 'object' && 'status' in err
      ? (err as { status?: unknown }).status
      : undefined;

  if (status === 503 || status === '503') {
    return true;
  }

  const message = err instanceof Error ? err.message : String(err);
  return /\b503\b|UNAVAILABLE|overloaded|high demand/i.test(message);
}

const LANGUAGE_MAP: Record<
  'en' | 'ur' | 'ur-roman',
  (typeof EXTRACTION_LANGUAGES)[number]
> = {
  en: 'English',
  ur: 'Urdu',
  'ur-roman': 'Roman Urdu',
};

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    incidentType: {
      type: Type.STRING,
      enum: [...INCIDENT_TYPES],
    },
    language: {
      type: Type.STRING,
      enum: [...EXTRACTION_LANGUAGES],
    },
    summary: {
      type: Type.STRING,
    },
    peopleAffected: {
      type: Type.INTEGER,
    },
    childrenCount: {
      type: Type.INTEGER,
    },
    elderlyCount: {
      type: Type.INTEGER,
    },
    mobilityImpairment: {
      type: Type.BOOLEAN,
    },
    medicalEmergency: {
      type: Type.BOOLEAN,
    },
    immediateDanger: {
      type: Type.BOOLEAN,
    },
    foodShortage: {
      type: Type.BOOLEAN,
    },
    waterRisk: {
      type: Type.BOOLEAN,
    },
    needs: {
      type: Type.ARRAY,
      items: {
        type: Type.STRING,
      },
    },
    riskFactors: {
      type: Type.ARRAY,
      items: {
        type: Type.STRING,
      },
    },
  },
  required: [
    'incidentType',
    'language',
    'summary',
    'peopleAffected',
    'childrenCount',
    'elderlyCount',
    'mobilityImpairment',
    'medicalEmergency',
    'immediateDanger',
    'foodShortage',
    'waterRisk',
    'needs',
    'riskFactors',
  ],
};

const SYSTEM_INSTRUCTION = `You are extracting structured facts from an emergency report for a disaster-response tool.

Use only information supported by the report text and the reporter-provided context below.

Do not invent missing information. If a field is unknown, use the defined safe default (0 for counts, false for booleans, "other" for incidentType, empty array for needs/riskFactors).

Do not calculate a priority score or severity level — that is handled elsewhere.

Do not provide emergency instructions, medical diagnosis, or claim any rescue has been dispatched.

Return only the structured JSON described by the response schema — no extra commentary.`;

function buildPrompt(input: IncidentExtractionInput): string {
  const context = {
    reportText: input.reportText,
    reporterProvidedLanguage:
      input.language === 'auto' ? 'unspecified' : input.language,

    reporterProvidedContext: {
      peopleAffected: input.peopleAffected,
      childrenCount: input.childrenCount,
      elderlyCount: input.elderlyCount,
      immediateDanger: input.immediateDanger,
      medicalEmergency: input.medicalEmergency,
      mobilityImpairment: input.mobilityImpairment,
      foodShortage: input.foodShortage,
      waterRisk: input.waterRisk,
      needs: input.needs,
    },
  };

  return `Emergency report and reporter-provided context (JSON):
${JSON.stringify(context, null, 2)}

Extract the structured incident fields now.`;
}

/** Preserves explicit reporter-provided values instead of letting AI guesses overwrite them. */
function reconcileWithUserInput(
  extracted: ExtractedIncident,
  input: IncidentExtractionInput,
): ExtractedIncident {
  const reconciled: ExtractedIncident = { ...extracted };

  if (input.peopleAffected !== null) {
    reconciled.peopleAffected = input.peopleAffected;
  }

  if (input.childrenCount !== null) {
    reconciled.childrenCount = input.childrenCount;
  }

  if (input.elderlyCount !== null) {
    reconciled.elderlyCount = input.elderlyCount;
  }

  // Reporter-asserted "true" flags are facts the reporter chose to state and
  // must not be silently dropped by an AI guess of "false".
  reconciled.immediateDanger =
    reconciled.immediateDanger || input.immediateDanger;

  reconciled.medicalEmergency =
    reconciled.medicalEmergency || input.medicalEmergency;

  reconciled.mobilityImpairment =
    reconciled.mobilityImpairment || input.mobilityImpairment;

  reconciled.foodShortage = reconciled.foodShortage || input.foodShortage;

  reconciled.waterRisk = reconciled.waterRisk || input.waterRisk;

  if (input.needs.length > 0) {
    reconciled.needs = Array.from(
      new Set([...reconciled.needs, ...input.needs]),
    );
  }

  if (input.language !== 'auto') {
    reconciled.language = LANGUAGE_MAP[input.language];
  }

  return reconciled;
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
 * Extracts structured incident data from an emergency report using Gemini.
 * Never throws — always resolves to an ExtractionResult so callers can
 * fail safely.
 */
export async function extractIncident(
  input: IncidentExtractionInput,
): Promise<ExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    return {
      ok: false,
      reason: 'missing_api_key',
      message: 'AI analysis is currently unavailable.',
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(input);
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;

  let response: Awaited<ReturnType<typeof ai.models.generateContent>> | undefined;
  let lastErr: unknown;

  // Try each model in the chain, sharing one overall request-timeout
  // budget (does not multiply the existing timeout by attempt count).
  // Only retryable provider/availability errors advance to the next
  // model; anything else is thrown immediately.
  for (let i = 0; i < MODEL_CHAIN.length; i++) {
    const model = MODEL_CHAIN[i];
    const remaining = deadline - Date.now();

    if (remaining <= 0) {
      lastErr = new Error('timeout');
      break;
    }

    try {
      response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
        remaining,
      );
      lastErr = undefined;
      break;
    } catch (err) {
      lastErr = err;

      const isLastModel = i === MODEL_CHAIN.length - 1;
      const message = err instanceof Error ? err.message : String(err);

      if (process.env.NODE_ENV === 'development') {
        console.error(`RescueMesh Gemini model "${model}" failed:`, message);
      }

      if (message === 'timeout' || !isRetryableProviderError(err) || isLastModel) {
        // Not retryable (or out of models/time) — stop trying.
        break;
      }
      // Retryable provider error and models remain — try the next one.
    }
  }

  if (!response) {
    // Every model in the chain failed (or the shared timeout budget ran
    // out). Return a controlled ExtractionResult here instead of
    // throwing — extractIncident() must never throw; route.ts awaits it
    // with no try/catch, relying on that contract.
    const message = lastErr instanceof Error ? lastErr.message : String(lastErr);

    if (message === 'timeout') {
      return {
        ok: false,
        reason: 'timeout',
        message: 'AI analysis could not be completed. Please try again.',
      };
    }

    return {
      ok: false,
      reason: 'provider_error',
      message: 'AI analysis could not be completed. Please try again.',
    };
  }

  try {
    const rawText = response.text;

    if (!rawText) {
      return {
        ok: false,
        reason: 'invalid_output',
        message: 'The report could not be analyzed safely. Please try again.',
      };
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(rawText);
    } catch {
      return {
        ok: false,
        reason: 'invalid_output',
        message: 'The report could not be analyzed safely. Please try again.',
      };
    }

    const validation = validateExtractedIncident(parsed);

    if (!validation.valid || !validation.data) {
      return {
        ok: false,
        reason: 'invalid_output',
        message: 'The report could not be analyzed safely. Please try again.',
      };
    }

    return {
      ok: true,
      data: reconcileWithUserInput(validation.data, input),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    /*
     * DEVELOPMENT DEBUGGING ONLY
     *
     * This prints the actual Gemini provider error in the terminal so we
     * can determine why the request is returning provider_error.
     *
     * It is NOT returned to the browser/user.
     */
    if (process.env.NODE_ENV === 'development') {
      console.error('RescueMesh Gemini provider error:', err);

      console.error('RescueMesh Gemini provider message:', message);
    }

    if (message === 'timeout') {
      return {
        ok: false,
        reason: 'timeout',
        message: 'AI analysis could not be completed. Please try again.',
      };
    }

    // Never surface raw provider errors/stack traces to the caller.
    return {
      ok: false,
      reason: 'provider_error',
      message: 'AI analysis could not be completed. Please try again.',
    };
  }
}

/** Exposed for tests/tools that need a known-safe fallback shape. */
export { SAFE_DEFAULT_EXTRACTION };

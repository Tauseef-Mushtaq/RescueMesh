/**
 * Groq API Fallback Layer
 *
 * Lightweight server-side client for Groq's OpenAI-compatible chat completions endpoint.
 * Serves as a fallback provider when Gemini API is rate-limited (429/503) or unavailable.
 */

export interface GroqChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqCompletionOptions {
  systemInstruction?: string;
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
}

const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

export async function callGroqCompletion(
  userPrompt: string,
  options: GroqCompletionOptions = {}
): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    return null;
  }

  const messages: GroqChatMessage[] = [];

  if (options.systemInstruction) {
    messages.push({ role: 'system', content: options.systemInstruction });
  }

  messages.push({ role: 'user', content: userPrompt });

  try {
    const body: Record<string, unknown> = {
      model: DEFAULT_GROQ_MODEL,
      messages,
      temperature: options.temperature ?? 0.1,
    };

    if (options.maxTokens) {
      body.max_tokens = options.maxTokens;
    }

    if (options.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (process.env.NODE_ENV === 'development') {
        const errText = await response.text();
        console.error('RescueMesh Groq API error response:', response.status, errText);
      }
      return null;
    }

    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;

    return typeof content === 'string' ? content : null;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('RescueMesh Groq API exception:', err);
    }
    return null;
  }
}

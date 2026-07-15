export type AiProviderChoice =
  | 'openai'
  | 'gemini'
  | 'groq'
  | 'openrouter'
  | 'ollama'
  | 'custom';

export const AI_PROVIDER_CHOICES: AiProviderChoice[] = [
  'openai',
  'gemini',
  'groq',
  'openrouter',
  'ollama',
  'custom',
];

export interface LlmProviderPreset {
  id: AiProviderChoice;
  label: string;
  free: boolean;
  needsKey: boolean;
  defaultBaseUrl: string;
  defaultModel: string;
  models: string[];
  hint: string;
  short: string;
}

export const LLM_PROVIDER_PRESETS: LlmProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    free: false,
    needsKey: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'o4-mini'],
    hint: 'Official OpenAI API (paid)',
    short: 'GPT models',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    free: true,
    needsKey: true,
    defaultBaseUrl: '',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'],
    hint: 'Google AI Studio free tier',
    short: 'Free tier',
  },
  {
    id: 'groq',
    label: 'Groq',
    free: true,
    needsKey: true,
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.1-8b-instant',
    models: [
      'llama-3.1-8b-instant',
      'llama-3.3-70b-versatile',
      'gemma2-9b-it',
      'mixtral-8x7b-32768',
    ],
    hint: 'Fast free tier — console.groq.com',
    short: 'Free · fast',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    free: true,
    needsKey: true,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.2-3b-instruct:free',
    models: [
      'meta-llama/llama-3.2-3b-instruct:free',
      'google/gemma-2-9b-it:free',
      'mistralai/mistral-7b-instruct:free',
      'qwen/qwen-2.5-7b-instruct:free',
    ],
    hint: 'Many free models — openrouter.ai',
    short: 'Free models',
  },
  {
    id: 'ollama',
    label: 'Ollama (Local)',
    free: true,
    needsKey: false,
    defaultBaseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'llama3.2',
    models: ['llama3.2', 'llama3.1', 'mistral', 'phi3', 'gemma2'],
    hint: '100% free on your machine',
    short: 'Local · free',
  },
  {
    id: 'custom',
    label: 'Custom API URL',
    free: true,
    needsKey: false,
    defaultBaseUrl: '',
    defaultModel: '',
    models: [],
    hint: 'Any OpenAI-compatible API (Together, Fireworks, LM Studio, vLLM…)',
    short: 'Your URL',
  },
];

export function getLlmPreset(id: AiProviderChoice): LlmProviderPreset {
  return LLM_PROVIDER_PRESETS.find((p) => p.id === id) ?? LLM_PROVIDER_PRESETS[0];
}

export function isAiProviderChoice(value: unknown): value is AiProviderChoice {
  return (
    typeof value === 'string' &&
    (AI_PROVIDER_CHOICES as string[]).includes(value)
  );
}

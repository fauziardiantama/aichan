import { GoogleGenAI } from '@google/genai';

const DEFAULT_MODEL = 'gemini-3.5-flash';

export const manifest = {
  name: 'aistudio',
  type: 'ai-provider',
  configFile: 'config.json',
  fields: ['apiKey']
};

let client = null;
let config = { apiKey: '' };

export function configure(nextConfig = {}) {
  config = { apiKey: '', ...nextConfig };
  client = null;
}

export function start(options = {}) {
  configure(options.config || {});
  const { apiKey } = config;
  if (!apiKey) {
    console.warn('[aistudio] No API key configured. Module is idle.');
    return;
  }
  client = new GoogleGenAI({ apiKey });
  console.log('[aistudio] Client initialized.');
}

export function stop() {
  client = null;
  console.log('[aistudio] Client stopped.');
}

export function status() {
  return { name: 'aistudio', state: client ? 'running' : 'idle' };
}

async function getClient() {
  if (client) return client;
  const { apiKey } = config;
  if (!apiKey) throw new Error('aistudio: No API key configured.');
  client = new GoogleGenAI({ apiKey });
  return client;
}

export async function listModels() {
  const availableClient = await getClient();
  const models = [];
  for await (const model of await availableClient.models.list()) {
    const actions = model.supportedActions || [];
    if (!actions.includes('generateContent')) continue;
    models.push({
      id: model.name.replace(/^models\//, ''),
      name: model.displayName || model.name,
      provider: 'aistudio'
    });
  }
  return models.sort((left, right) => left.id.localeCompare(right.id));
}

export async function generate({ prompt, model = DEFAULT_MODEL, systemPrompt = null, history = [] }) {
  const availableClient = await getClient();
  const contents = history
    .filter(message => ['user', 'assistant'].includes(message.role) && message.content)
    .map(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }]
    }));
  contents.push({ role: 'user', parts: [{ text: prompt }] });
  const response = await availableClient.models.generateContent({
    model,
    contents,
    config: systemPrompt ? { systemInstruction: systemPrompt } : undefined
  });
  return { text: response.text, model };
}

export default {
  manifest,
  start,
  stop,
  status,
  configure,
  listModels,
  generate
};

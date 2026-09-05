import OpenAI from 'openai';
const defaultModel = 'gpt-4o-mini';

export const manifest = {
  name: 'chatgpt',
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
    console.warn('[chatgpt] No API key configured. Module is idle.');
    return;
  }
  client = new OpenAI({ apiKey });
  console.log('[chatgpt] Client initialized.');
}

export function stop() {
  client = null;
  console.log('[chatgpt] Client stopped.');
}

export function status() {
  return { name: 'chatgpt', state: client ? 'running' : 'idle' };
}

async function getClient() {
  if (client) return client;
  const { apiKey } = config;
  if (!apiKey) throw new Error('chatgpt: No API key configured.');
  client = new OpenAI({ apiKey });
  return client;
}

export async function listModels() {
  const availableClient = await getClient();
  const models = [];
  for await (const model of availableClient.models.list()) {
    models.push({
      id: model.id,
      name: model.id,
      provider: 'chatgpt'
    });
  }
  return models.sort((left, right) => left.id.localeCompare(right.id));
}

export async function generate({ prompt, model = defaultModel, systemPrompt = null, history = [] }) {
  const availableClient = await getClient();

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push(...history
    .filter(message => ['user', 'assistant'].includes(message.role) && message.content)
    .map(message => ({ role: message.role, content: message.content })));
  messages.push({ role: 'user', content: prompt });

  const response = await availableClient.chat.completions.create({
    model,
    messages
  });

  return {
    text: response.choices[0]?.message?.content || '',
    model
  };
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

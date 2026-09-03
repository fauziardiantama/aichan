import OpenAI from 'openai';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(moduleDir, 'config.json');
const defaultModel = 'gpt-4o-mini';

export const manifest = {
  name: 'chatgpt',
  configFile: 'config.json',
  fields: ['apiKey']
};

function loadConfig() {
  if (!fs.existsSync(configPath)) return { apiKey: '' };
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

let client = null;

export function start() {
  const { apiKey } = loadConfig();
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
  const { apiKey } = loadConfig();
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
      provider: 'chatgpt',
      capabilities: {
        chat: null,
        tools: null,
        vision: null
      }
    });
  }
  return models.sort((left, right) => left.id.localeCompare(right.id));
}

export async function generate({ prompt, model = defaultModel, systemPrompt = null }) {
  const availableClient = await getClient();

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
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
  listModels,
  generate
};

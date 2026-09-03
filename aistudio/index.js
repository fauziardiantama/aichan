import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'config.json');

const DEFAULT_MODEL = 'gemini-3.5-flash';

export const manifest = {
  name: 'aistudio',
  configFile: 'config.json',
  fields: ['apiKey']
};

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return { apiKey: '' };
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

let client = null;

export function start() {
  const { apiKey } = loadConfig();
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
  const { apiKey } = loadConfig();
  if (!apiKey) throw new Error('aistudio: No API key configured.');
  client = new GoogleGenAI({ apiKey });
  return client;
}

export async function listModels() {
  const availableClient = await getClient();
  const models = [];
  for await (const model of await availableClient.models.list()) {
    const methods = model.supportedGenerationMethods || [];
    if (!methods.includes('generateContent')) continue;
    models.push({
      id: model.name.replace(/^models\//, ''),
      name: model.displayName || model.name,
      provider: 'aistudio',
      description: model.description || '',
      limits: {
        inputTokens: model.inputTokenLimit || null,
        outputTokens: model.outputTokenLimit || null
      },
      capabilities: {
        chat: true,
        tools: methods.includes('generateContent')
      }
    });
  }
  return models.sort((left, right) => left.id.localeCompare(right.id));
}

export async function generate({ prompt, model = DEFAULT_MODEL, systemPrompt = null }) {
  const availableClient = await getClient();
  const response = await availableClient.models.generateContent({
    model,
    contents: prompt,
    config: systemPrompt ? { systemInstruction: systemPrompt } : undefined
  });
  return { text: response.text, model };
}

export default {
  manifest,
  start,
  stop,
  status,
  listModels,
  generate
};

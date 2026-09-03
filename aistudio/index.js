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

export async function generate({ prompt, model = DEFAULT_MODEL }) {
  if (!client) {
    const { apiKey } = loadConfig();
    if (!apiKey) throw new Error('aistudio: No API key configured.');
    client = new GoogleGenAI({ apiKey });
  }
  const response = await client.models.generateContent({
    model,
    contents: prompt
  });
  return { text: response.text };
}

export default {
  manifest,
  start,
  stop,
  status,
  generate
};

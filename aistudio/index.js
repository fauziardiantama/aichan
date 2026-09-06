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

export async function generateStructured({ prompt, model = DEFAULT_MODEL, systemPrompt = null, history = [], schema }) {
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
    config: {
      systemInstruction: systemPrompt || undefined,
      responseMimeType: 'application/json',
      responseSchema: schema
    }
  });

  return JSON.parse(response.text);
}

export async function generateWithNativeTools({ model = DEFAULT_MODEL, systemPrompt = null, messages = [], tools = [] }) {
  const availableClient = await getClient();
  const contents = [];

  for (const msg of messages) {
    if (msg.role === 'tool') {
      const parsedResponse = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: msg.name,
            response: parsedResponse
          }
        }]
      });
    } else if (msg.role === 'assistant' && msg.toolCalls) {
      contents.push({
        role: 'model',
        parts: msg.toolCalls.map(tc => ({
          functionCall: {
            name: tc.name,
            args: tc.arguments
          }
        }))
      });
    } else if (msg.content) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      });
    }
  }

  const configObj = {};
  if (systemPrompt) configObj.systemInstruction = systemPrompt;
  if (tools && tools.length > 0) {
    configObj.tools = [{
      functionDeclarations: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }))
    }];
  }

  const response = await availableClient.models.generateContent({
    model,
    contents,
    config: configObj
  });

  const functionCalls = response.functionCalls;
  if (functionCalls && functionCalls.length > 0) {
    return {
      isFinal: false,
      toolCalls: functionCalls.map(fc => ({
        id: fc.id,
        name: fc.name,
        arguments: fc.args
      }))
    };
  }

  return {
    isFinal: true,
    text: response.text,
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
  generate,
  generateStructured,
  generateWithNativeTools
};

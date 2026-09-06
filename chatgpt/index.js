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

export async function generateStructured({ prompt, model = defaultModel, systemPrompt = null, history = [], schema }) {
  const availableClient = await getClient();

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push(...history
    .filter(message => ['user', 'assistant'].includes(message.role) && message.content)
    .map(message => ({ role: message.role, content: message.content })));
  messages.push({ role: 'user', content: prompt });

  const response = await availableClient.chat.completions.create({
    model,
    messages,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'structured_decision',
        strict: true,
        schema
      }
    }
  });

  const content = response.choices[0]?.message?.content;
  return JSON.parse(content);
}

export async function generateWithNativeTools({ model = defaultModel, systemPrompt = null, messages = [], tools = [] }) {
  const availableClient = await getClient();
  const formattedMessages = [];
  if (systemPrompt) formattedMessages.push({ role: 'system', content: systemPrompt });

  for (const msg of messages) {
    if (msg.role === 'tool') {
      formattedMessages.push({
        role: 'tool',
        tool_call_id: msg.toolCallId,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      });
    } else if (msg.role === 'assistant' && msg.toolCalls) {
      formattedMessages.push({
        role: 'assistant',
        tool_calls: msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {})
          }
        }))
      });
    } else if (msg.content) {
      formattedMessages.push({
        role: msg.role,
        content: msg.content
      });
    }
  }

  const formattedTools = (tools || []).map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }));

  const response = await availableClient.chat.completions.create({
    model,
    messages: formattedMessages,
    tools: formattedTools.length > 0 ? formattedTools : undefined
  });

  const choice = response.choices[0]?.message;
  if (choice?.tool_calls && choice.tool_calls.length > 0) {
    return {
      isFinal: false,
      toolCalls: choice.tool_calls.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments)
      }))
    };
  }

  return {
    isFinal: true,
    text: choice?.content,
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

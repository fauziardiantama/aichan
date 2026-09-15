import OpenAI from 'openai';

const DEFAULT_MODEL = 'gpt-4o-mini';

export class ChatGPTProvider {
  constructor(config = {}) {
    this.manifest = {
      name: 'chatgpt',
      type: 'ai-provider',
      configFile: 'config.json',
      fields: ['apiKey']
    };
    this.client = null;
    this.config = { apiKey: '' };
    this.configure(config);
  }

  configure(nextConfig = {}) {
    this.config = { apiKey: '', ...nextConfig };
    this.client = null;
    if (this.config.apiKey) {
      this.client = new OpenAI({ apiKey: this.config.apiKey });
    }
  }

  start(options = {}) {
    this.configure(options.config || this.config);
    if (!this.config.apiKey) {
      console.warn('[chatgpt] No API key configured. Module is idle.');
      return;
    }
    console.log('[chatgpt] Client initialized.');
  }

  stop() {
    this.client = null;
    console.log('[chatgpt] Client stopped.');
  }

  status() {
    return { name: 'chatgpt', state: this.client ? 'running' : 'idle' };
  }

  async getClient() {
    if (this.client) return this.client;
    if (!this.config.apiKey) throw new Error('chatgpt: No API key configured.');
    this.client = new OpenAI({ apiKey: this.config.apiKey });
    return this.client;
  }

  async listModels() {
    const availableClient = await this.getClient();
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

  async generate({ prompt, model = DEFAULT_MODEL, systemPrompt = null, history = [] }) {
    const availableClient = await this.getClient();

    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });

    for (const msg of history) {
      if (msg.role === 'tool') {
        messages.push({
          role: 'tool',
          tool_call_id: msg.toolCallId,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        });
      } else if (msg.role === 'assistant' && msg.toolCalls) {
        messages.push({
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
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }
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

  async generateStructured({ prompt, model = DEFAULT_MODEL, systemPrompt = null, history = [], schema }) {
    const availableClient = await this.getClient();

    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });

    for (const msg of history) {
      if (msg.role === 'tool') {
        messages.push({
          role: 'tool',
          tool_call_id: msg.toolCallId,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        });
      } else if (msg.role === 'assistant' && msg.toolCalls) {
        messages.push({
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
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }
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

  async generateWithNativeTools({ model = DEFAULT_MODEL, systemPrompt = null, messages = [], tools = [] }) {
    const availableClient = await this.getClient();
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
      } else if (msg.content !== null && msg.content !== undefined) {
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
}

export default ChatGPTProvider;

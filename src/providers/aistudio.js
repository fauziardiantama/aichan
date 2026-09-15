import { GoogleGenAI } from '@google/genai';

const DEFAULT_MODEL = 'gemini-3.5-flash';

export class AIStudioProvider {
  constructor(config = {}) {
    this.manifest = {
      name: 'aistudio',
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
      this.client = new GoogleGenAI({ apiKey: this.config.apiKey });
    }
  }

  start(options = {}) {
    this.configure(options.config || this.config);
    if (!this.config.apiKey) {
      console.warn('[aistudio] No API key configured. Module is idle.');
      return;
    }
    console.log('[aistudio] Client initialized.');
  }

  stop() {
    this.client = null;
    console.log('[aistudio] Client stopped.');
  }

  status() {
    return { name: 'aistudio', state: this.client ? 'running' : 'idle' };
  }

  async getClient() {
    if (this.client) return this.client;
    if (!this.config.apiKey) throw new Error('aistudio: No API key configured.');
    this.client = new GoogleGenAI({ apiKey: this.config.apiKey });
    return this.client;
  }

  async listModels() {
    const availableClient = await this.getClient();
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

  async generate({ prompt, model = DEFAULT_MODEL, systemPrompt = null, history = [] }) {
    const availableClient = await this.getClient();
    const contents = [];

    for (const msg of history) {
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
    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const response = await availableClient.models.generateContent({
      model,
      contents,
      config: systemPrompt ? { systemInstruction: systemPrompt } : undefined
    });
    return { text: response.text, model };
  }

  async generateStructured({ prompt, model = DEFAULT_MODEL, systemPrompt = null, history = [], schema }) {
    const availableClient = await this.getClient();
    const contents = [];

    for (const msg of history) {
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

  async generateWithNativeTools({ model = DEFAULT_MODEL, systemPrompt = null, messages = [], tools = [] }) {
    const availableClient = await this.getClient();
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
      } else if (msg.content !== null && msg.content !== undefined) {
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
}

export default AIStudioProvider;

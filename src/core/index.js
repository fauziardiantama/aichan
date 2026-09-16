import { DatabaseManager } from './database/index.js';
import { ConfigManager } from './config/index.js';
import { runPipeline } from './pipeline/index.js';
import { Scheduler } from './scheduler/index.js';

export class CoreEngine {
  constructor({
    dbPath = './data/aichan.db',
    config = null,
    providers = {},
    defaultProviderKey = 'aistudio',
    adapters = {}
  } = {}) {
    this.config = config || new ConfigManager();
    this.database = new DatabaseManager(dbPath);
    this.providers = providers;
    this.defaultProviderKey = defaultProviderKey;
    this.adapters = adapters;

    for (const [platform, adapter] of Object.entries(this.adapters)) {
      adapter.onMessage(async ({ chatId, text, callback }) => {
        await this.chat({ platform, chatId, text, callback });
      });
    }

    this.scheduler = new Scheduler({
      database: this.database,
      runPipeline,
      getProvider: () => this.getDefaultProvider(),
      getAdapters: () => this.adapters
    });
  }

  getDefaultProvider() {
    return this.providers[this.defaultProviderKey] || Object.values(this.providers)[0] || null;
  }

  get storage() {
    return this.database;
  }

  async start({ startScheduler = true, schedulerIntervalMs = 15000 } = {}) {
    this.database.init();
    if (startScheduler) {
      this.scheduler.intervalMs = schedulerIntervalMs;
      this.scheduler.start();
    }
    console.log('[CoreEngine] Engine started.');
  }

  async stop() {
    this.scheduler.stop();
    this.database.close();
    console.log('[CoreEngine] Engine stopped.');
  }

  status() {
    return {
      name: 'core',
      state: 'running',
      database: this.database.getPath(),
      scheduler: this.scheduler.status()
    };
  }

  async chat({
    platform,
    chatId,
    text,
    model = null,
    promptCodename = null,
    providerKey = null,
    callback
  }) {
    const selectedProvider = (providerKey && this.providers[providerKey]) || this.getDefaultProvider();
    if (!selectedProvider) {
      throw new Error('CoreEngine: No AI provider available.');
    }

    const context = {
      platform,
      targetChatId: String(chatId),
      chatId: String(chatId),
      storage: this.database,
      adapters: this.adapters
    };

    await runPipeline({
      platform,
      chatId: String(chatId),
      prompt: text,
      model,
      promptCodename,
      deciderModel: selectedProvider,
      toolModel: selectedProvider,
      context,
      database: this.database,
      callback
    });
  }
}

export default CoreEngine;

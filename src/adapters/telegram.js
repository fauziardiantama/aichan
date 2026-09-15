import { Telegraf } from 'telegraf';

export class TelegramAdapter {
  constructor({ config = {} } = {}) {
    this.manifest = {
      name: 'telegram',
      type: 'adapter',
      configFile: 'config.json',
      fields: ['apiKey', 'ownerId']
    };
    this.config = { apiKey: '', ownerId: '', ...config };
    this.bot = null;
    this.messageHandler = null;
  }

  configure(nextConfig = {}) {
    this.config = { apiKey: '', ownerId: '', ...nextConfig };
  }

  onMessage(handler) {
    if (typeof handler !== 'function') {
      throw new Error('TelegramAdapter: onMessage handler must be a function.');
    }
    this.messageHandler = handler;
  }

  async sendMessage(chatId, text) {
    if (!this.bot) throw new Error('telegram: Bot is not running or apiKey is missing.');
    return await this.bot.telegram.sendMessage(chatId, text);
  }

  async start(options = {}) {
    if (options.config) this.configure(options.config);

    if (this.config.apiKey) {
      this.bot = new Telegraf(this.config.apiKey);

      this.bot.on('text', async (ctx) => {
        const chatId = String(ctx.chat.id);
        const text = ctx.message.text;

        if (this.messageHandler) {
          try {
            const result = await this.messageHandler({ chatId, text });
            if (result && result.text) {
              await ctx.reply(result.text);
            }
          } catch (err) {
            console.error('[telegram] Error processing message:', err.message);
          }
        }
      });

      this.bot.launch().catch(err => {
        console.error('[telegram] Failed to launch bot:', err.message);
      });
      console.log('[telegram] Telegram bot running via polling.');
    } else {
      console.log('[telegram] Telegram module initialized (no apiKey configured).');
    }
  }

  stop() {
    if (this.bot) {
      this.bot.stop();
      this.bot = null;
    }
    console.log('[telegram] Telegram module stopped.');
  }

  status() {
    return { name: 'telegram', state: this.bot ? 'running' : 'idle' };
  }
}

export default TelegramAdapter;

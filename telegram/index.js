import { Telegraf } from 'telegraf';

export const manifest = {
  name: "telegram",
  type: "adapter",
  configFile: "config.json",
  fields: ["apiKey", "ownerId"]
};

let provider = null;
let storage = null;
let config = { apiKey: '', ownerId: '' };
let bot = null;

export function start(options = {}) {
  provider = options.provider || null;
  storage = options.storage || null;
  config = { apiKey: '', ownerId: '', ...options.config };

  if (config.apiKey) {
    bot = new Telegraf(config.apiKey);

    bot.on('text', async (ctx) => {
      const chatId = String(ctx.chat.id);
      const text = ctx.message.text;
      const result = await handleMessage({ chatId, text });
      if (result && result.text) {
        await ctx.reply(result.text);
      }
    });

    bot.launch().catch(err => {
      console.error('[telegram] Failed to launch bot:', err.message);
    });
    console.log('[telegram] Telegram bot running via polling.');
  } else {
    console.log('[telegram] Telegram module initialized (no apiKey configured).');
  }
}

export function stop() {
  if (bot) {
    bot.stop();
    bot = null;
  }
  console.log('[telegram] Telegram module stopped.');
}

export function status() {
  return { name: 'telegram', state: bot ? 'running' : 'idle' };
}

export async function sendMessage(chatId, text) {
  if (!bot) throw new Error('telegram: Bot is not running or apiKey is missing.');
  return await bot.telegram.sendMessage(chatId, text);
}

export async function handleMessage({ chatId, text, platform = 'telegram' }) {
  if (!provider || !storage) throw new Error('telegram: provider and storage are required.');

  const context = {
    platform,
    targetChatId: String(chatId),
    storage,
    adapters: {
      telegram: { sendMessage }
    }
  };

  return await storage.runPipeline({
    platform,
    chatId: String(chatId),
    prompt: text,
    deciderModel: provider,
    toolModel: provider,
    context
  });
}

export default {
  manifest,
  start,
  stop,
  status,
  sendMessage,
  handleMessage
};

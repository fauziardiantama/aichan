export const manifest = {
  name: "telegram",
  type: "adapter",
  configFile: "config.json",
  fields: ["apiKey", "ownerId"]
};

let provider = null;
let storage = null;
let config = { apiKey: '', ownerId: '' };

export function start(options = {}) {
  provider = options.provider || null;
  storage = options.storage || null;
  config = { apiKey: '', ownerId: '', ...options.config };
  console.log('[telegram] Telegram module initialized.');
}

export function stop() {
  console.log('[telegram] Telegram module stopped.');
}

export function status() {
  return { name: 'telegram', state: provider ? 'standby' : 'idle' };
}

export async function handleMessage({ chatId, text, platform = 'telegram' }) {
  if (!provider || !storage) throw new Error('telegram: provider and storage are required.');
  const chat = storage.upsertChat({ chatId, platform });
  const history = storage.getChatMessages(chat.id);
  storage.addMessage({ chatKey: chat.id, role: 'user', content: text });
  const prompt = chat.prompt_codename ? storage.getSystemPrompt(chat.prompt_codename) : null;
  const result = await provider.generate({ prompt: text, systemPrompt: prompt?.content, history });
  storage.addMessage({ chatKey: chat.id, role: 'assistant', content: result.text, model: result.model || null, promptCodename: prompt?.codename || null });
  return result;
}

export default {
  manifest,
  start,
  stop,
  status,
  handleMessage
};

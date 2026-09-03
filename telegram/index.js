export const manifest = {
  name: "telegram",
  configFile: "config.json",
  fields: ["apiKey", "ownerId"]
};

export function start() {
  console.log('[telegram] Telegram module initialized.');
}

export function stop() {
  console.log('[telegram] Telegram module stopped.');
}

export function status() {
  return { name: 'telegram', state: 'standby' };
}

export default {
  manifest,
  start,
  stop,
  status
};

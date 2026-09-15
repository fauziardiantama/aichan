import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigManager } from './core/config/index.js';
import { CoreEngine } from './core/index.js';
import { AIStudioProvider } from './providers/aistudio.js';
import { ChatGPTProvider } from './providers/chatgpt.js';
import { TelegramAdapter } from './adapters/telegram.js';
import { AdminWebAdapter } from './adapters/admin_web/index.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configDir = path.join(rootDir, 'data', 'config');
const dbPath = path.join(rootDir, 'data', 'aichan.db');

// 1. Manajer Konfigurasi Terpusat
export const config = new ConfigManager(configDir);

// 2. Multi-Provider AI
export const providers = {
  aistudio: new AIStudioProvider(config.get('aistudio')),
  chatgpt: new ChatGPTProvider(config.get('chatgpt'))
};

// 3. Adapters I/O
export const telegram = new TelegramAdapter({ config: config.get('telegram') });

// 4. Core Engine Terpadu
export const engine = new CoreEngine({
  dbPath,
  config,
  providers,
  defaultProviderKey: 'aistudio',
  adapters: { telegram }
});

// 5. Admin Web Dashboard
export const adminWeb = new AdminWebAdapter({
  config: config.get('admin_web', { port: 3000 }),
  engine
});

// 6. Lifecycle Kontrol Sistem
export async function start() {
  console.log('[Ai-Chan] Starting Clean Architecture System...');
  await engine.start();
  await telegram.start();
  await adminWeb.start();
  console.log('[Ai-Chan] System is fully online and ready.');
}

export async function stop() {
  console.log('[Ai-Chan] Stopping system...');
  adminWeb.stop();
  telegram.stop();
  await engine.stop();
  console.log('[Ai-Chan] System stopped.');
}

export default {
  config,
  providers,
  telegram,
  engine,
  adminWeb,
  start,
  stop
};

// Auto-boot if executed directly via node src/index.js
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith(path.join('src', 'index.js')) ||
  process.argv[1].endsWith('index.js')
);

if (isDirectRun) {
  start().catch(err => {
    console.error('[Ai-Chan] Fatal boot error:', err);
    process.exit(1);
  });
}

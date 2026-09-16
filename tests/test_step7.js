import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { TelegramAdapter } from '../src/adapters/telegram.js';
import { AdminWebAdapter } from '../src/adapters/admin_web/index.js';
import { CoreEngine } from '../src/core/index.js';
import { ConfigManager } from '../src/core/config/index.js';

console.log('--- Testing Step 7: Adapters Layer ---');

const testDir = path.resolve('./temp_test_data_step7');
fs.mkdirSync(testDir, { recursive: true });

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

let engine = null;
let adminWeb = null;

try {
  // 1. Test TelegramAdapter
  console.log('1. Testing TelegramAdapter contract...');
  const telegram = new TelegramAdapter();
  if (telegram.manifest.name !== 'telegram' || telegram.manifest.type !== 'adapter') {
    throw new Error('Telegram manifest mismatch');
  }
  let messageHandled = false;
  let replyReceived = null;
  telegram.onMessage(async ({ chatId, text, callback }) => {
    messageHandled = true;
    await callback({ text: 'Echo: ' + text });
  });
  // Simulate message handling
  await telegram.messageHandler({
    chatId: '123',
    text: 'Test message',
    callback: async (msg) => {
      replyReceived = msg;
    }
  });
  if (!messageHandled || !replyReceived || replyReceived.text !== 'Echo: Test message') {
    throw new Error('Telegram onMessage handler failed');
  }
  console.log('✓ TelegramAdapter contract OK');

  // 2. Test AdminWebAdapter with CoreEngine
  console.log('2. Testing AdminWebAdapter HTTP server & endpoints...');
  const config = new ConfigManager(path.join(testDir, 'config'));
  const dbPath = path.join(testDir, 'test.db');
  engine = new CoreEngine({
    dbPath,
    config,
    providers: {
      mock_p: {
        manifest: { name: 'mock_p', type: 'ai-provider' },
        status: () => ({ state: 'running' }),
        listModels: async () => [{ id: 'm1', name: 'Model 1', provider: 'mock_p' }]
      }
    },
    adapters: { telegram }
  });
  await engine.start({ startScheduler: false });

  adminWeb = new AdminWebAdapter({
    config: { port: 3099 },
    engine
  });
  await adminWeb.start();

  // Test GET /api/modules
  const modRes = await fetchUrl('http://localhost:3099/api/modules');
  if (modRes.status !== 200) throw new Error('/api/modules status not 200: ' + modRes.status);
  const modules = JSON.parse(modRes.body);
  const modNames = modules.map(m => m.name);
  if (!modNames.includes('core') || !modNames.includes('mock_p') || !modNames.includes('telegram')) {
    throw new Error('Missing modules in /api/modules: ' + JSON.stringify(modNames));
  }
  console.log('✓ GET /api/modules OK:', modNames);

  // Test GET /api/models
  const modelsRes = await fetchUrl('http://localhost:3099/api/models');
  if (modelsRes.status !== 200) throw new Error('/api/models status not 200');
  const modelsData = JSON.parse(modelsRes.body);
  if (!modelsData.models || modelsData.models.length !== 1 || modelsData.models[0].id !== 'm1') {
    throw new Error('Models response mismatch: ' + modelsRes.body);
  }
  console.log('✓ GET /api/models OK');

  // Test GET / (HTML)
  const rootRes = await fetchUrl('http://localhost:3099/');
  if (rootRes.status !== 200 || !rootRes.body.includes('<!DOCTYPE html>')) {
    throw new Error('Root HTML serving failed');
  }
  console.log('✓ Static frontend serving OK');

  // Test GET /marked.js & /purify.js
  const markedRes = await fetchUrl('http://localhost:3099/marked.js');
  if (markedRes.status !== 200 || !markedRes.body.includes('marked')) {
    throw new Error('marked.js serving failed');
  }
  const purifyRes = await fetchUrl('http://localhost:3099/purify.js');
  if (purifyRes.status !== 200 || !purifyRes.body.includes('DOMPurify')) {
    throw new Error('purify.js serving failed');
  }
  console.log('✓ Vendor libraries (/marked.js & /purify.js) serving OK');

  console.log('--- ALL STEP 7 TESTS PASSED ---');
} finally {
  if (adminWeb) adminWeb.stop();
  if (engine) await engine.stop();
  fs.rmSync(testDir, { recursive: true, force: true });
}

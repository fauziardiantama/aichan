import path from 'node:path';
import fs from 'node:fs';
import { ConfigManager } from '../src/core/config/index.js';
import { DatabaseManager } from '../src/core/database/index.js';

console.log('--- Testing Step 3: Persistence Layer ---');

const testDir = path.resolve('./temp_test_data');
fs.mkdirSync(testDir, { recursive: true });

try {
  // 1. Test ConfigManager
  console.log('1. Testing ConfigManager...');
  const config = new ConfigManager(path.join(testDir, 'config'));
  config.set('telegram', { apiKey: 'test_key', ownerId: '123' });
  const readConfig = config.get('telegram');
  if (readConfig.apiKey !== 'test_key' || readConfig.ownerId !== '123') {
    throw new Error('ConfigManager read/write mismatch');
  }
  console.log('✓ ConfigManager OK');

  // 2. Test DatabaseManager
  console.log('2. Testing DatabaseManager...');
  const dbPath = path.join(testDir, 'test.db');
  const dbManager = new DatabaseManager(dbPath);

  // Test System Prompts
  const prompt = dbManager.getSystemPrompt('default_assistant');
  if (!prompt || !prompt.content.includes('Ai-Chan')) {
    throw new Error('Default system prompt missing');
  }
  console.log('✓ Default prompt OK');

  // Test Chats & Messages
  const chat = dbManager.upsertChat({ chatId: 'chat_123', platform: 'telegram', title: 'Test Chat' });
  if (chat.chat_id !== 'chat_123' || chat.platform !== 'telegram') {
    throw new Error('upsertChat mismatch');
  }
  const msg = dbManager.addMessage({ chatKey: chat.id, role: 'user', content: 'Hello Ai-Chan' });
  if (msg.content !== 'Hello Ai-Chan') {
    throw new Error('addMessage mismatch');
  }
  const messages = dbManager.getChatMessages(chat.id);
  if (messages.length !== 1) {
    throw new Error('getChatMessages mismatch');
  }
  console.log('✓ Chats & Messages OK');

  // Test Providers, Models & Capabilities
  const cap = dbManager.saveModelCapabilities({
    providerKey: 'aistudio',
    modelKey: 'gemini-3.5-flash',
    displayName: 'Gemini 3.5 Flash',
    tools: true,
    structuredOutputs: true
  });
  if (!cap || cap.tools !== 1 || cap.structured_outputs !== 1) {
    throw new Error('saveModelCapabilities mismatch');
  }
  console.log('✓ Providers & Capabilities OK');

  // Test Tasks (Heartbeat / Tasker)
  const task = dbManager.createTask({
    chatId: chat.id,
    instruction: 'Check server status',
    type: 'polling',
    triggerAt: new Date(Date.now() - 1000).toISOString(),
    delay: 60,
    active: 1
  });
  if (task.instruction !== 'Check server status' || task.type !== 'polling') {
    throw new Error('createTask mismatch');
  }
  const dueTasks = dbManager.getActiveDueTasks();
  if (dueTasks.length === 0 || dueTasks[0].id !== task.id) {
    throw new Error('getActiveDueTasks mismatch');
  }
  const updated = dbManager.updateTask(task.id, chat.id, { active: false });
  if (!updated) {
    throw new Error('updateTask mismatch');
  }
  const remainingDue = dbManager.getActiveDueTasks();
  if (remainingDue.length !== 0) {
    throw new Error('Active filter in getActiveDueTasks failed');
  }
  console.log('✓ Tasks & Heartbeat queries OK');

  dbManager.close();
  console.log('--- ALL STEP 3 TESTS PASSED ---');
} finally {
  // Cleanup test data
  fs.rmSync(testDir, { recursive: true, force: true });
}

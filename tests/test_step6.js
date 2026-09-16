import path from 'node:path';
import fs from 'node:fs';
import { CoreEngine } from '../src/core/index.js';
import { ConfigManager } from '../src/core/config/index.js';

console.log('--- Testing Step 6: Core Engine, Pipeline & Scheduler ---');

const testDir = path.resolve('./temp_test_data_step6');
fs.mkdirSync(testDir, { recursive: true });

try {
  const config = new ConfigManager(path.join(testDir, 'config'));
  const dbPath = path.join(testDir, 'test.db');

  // Mock Provider for testing
  let lastPrompt = null;
  const mockProvider = {
    manifest: { name: 'mock_ai', type: 'ai-provider' },
    generateStructured: async ({ prompt }) => {
      lastPrompt = prompt;
      if (prompt.includes('need tool')) {
        return { need_tool: true, response_text: 'Calling tool' };
      }
      return { need_tool: false, response_text: 'Direct answer: ' + prompt };
    },
    generateWithNativeTools: async ({ messages }) => {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'tool') {
        return { isFinal: true, text: 'Tool finished: ' + lastMsg.content };
      }
      return {
        isFinal: false,
        toolCalls: [{
          id: 'call_1',
          name: 'get_current_time',
          arguments: {}
        }]
      };
    }
  };

  const engine = new CoreEngine({
    dbPath,
    config,
    providers: { mock_ai: mockProvider },
    defaultProviderKey: 'mock_ai',
    adapters: {}
  });

  await engine.start({ startScheduler: false });

  // 1. Test Direct Chat (Stage 1)
  console.log('1. Testing direct chat (no tools)...');
  const directMessages = [];
  await engine.chat({
    platform: 'web',
    chatId: 'web_1',
    text: 'Hello Ai-Chan',
    callback: async (msg) => {
      directMessages.push(msg);
    }
  });
  if (directMessages.length !== 1 || directMessages[0].text !== 'Direct answer: Hello Ai-Chan') {
    throw new Error('Direct chat response mismatch: ' + JSON.stringify(directMessages));
  }
  const chatMessages = engine.storage.getChatMessages(1);
  if (chatMessages.length !== 2) { // 1 user + 1 assistant
    throw new Error('Database message count mismatch: ' + chatMessages.length);
  }
  console.log('✓ Direct chat & DB storage OK');

  // 2. Test Tool Escalation (Stage 2)
  console.log('2. Testing tool escalation chat...');
  const toolMessages = [];
  await engine.chat({
    platform: 'web',
    chatId: 'web_1',
    text: 'Please need tool to check',
    callback: async (msg) => {
      toolMessages.push(msg);
    }
  });
  if (toolMessages.length !== 2 || !toolMessages[1].text.includes('Tool finished')) {
    throw new Error('Tool escalation response mismatch: ' + JSON.stringify(toolMessages));
  }
  console.log('✓ Tool escalation OK (Stage 1 and Stage 2 received via callback)');

  // 3. Test Scheduler Tick
  console.log('3. Testing scheduler tick...');
  const task = engine.storage.createTask({
    chatId: 1,
    instruction: 'Scheduled pulse',
    type: 'recurring',
    triggerAt: new Date(Date.now() - 5000).toISOString(),
    delay: 30,
    active: 1
  });

  await engine.scheduler.tick();
  const updatedTask = engine.storage.getTask(task.id);
  if (new Date(updatedTask.trigger_at).getTime() <= Date.now()) {
    throw new Error('Scheduler did not advance trigger_at');
  }
  console.log('✓ Scheduler tick & trigger advance OK');

  await engine.stop();
  console.log('--- ALL STEP 6 TESTS PASSED ---');
} finally {
  fs.rmSync(testDir, { recursive: true, force: true });
}

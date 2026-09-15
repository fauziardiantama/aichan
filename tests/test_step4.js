import path from 'node:path';
import fs from 'node:fs';
import { listToolSchemas, executeTool } from '../src/core/tools/index.js';
import { DatabaseManager } from '../src/core/database/index.js';

console.log('--- Testing Step 4: Tools Layer ---');

const testDir = path.resolve('./temp_test_data_tools');
fs.mkdirSync(testDir, { recursive: true });

try {
  // 1. Test Schemas
  console.log('1. Checking tool schemas...');
  const schemas = listToolSchemas();
  const toolNames = schemas.map(s => s.name);
  if (!toolNames.includes('get_current_time') || !toolNames.includes('send_notification') ||
      !toolNames.includes('manage_instance') || !toolNames.includes('tasker')) {
    throw new Error('Not all 4 tools registered: ' + JSON.stringify(toolNames));
  }
  console.log('✓ All 4 tools registered:', toolNames);

  // 2. Test get_current_time
  console.log('2. Testing get_current_time...');
  const timeRes = await executeTool('get_current_time');
  if (!timeRes.timestamp || isNaN(Date.parse(timeRes.timestamp))) {
    throw new Error('Invalid timestamp from get_current_time');
  }
  console.log('✓ get_current_time OK');

  // 3. Test send_notification
  console.log('3. Testing send_notification...');
  let sentMessage = null;
  const mockContext = {
    platform: 'telegram',
    targetChatId: 'chat_999',
    adapters: {
      telegram: {
        sendMessage: async (targetChatId, text) => {
          sentMessage = { targetChatId, text };
        }
      }
    }
  };
  const notifyRes = await executeTool('send_notification', { message: 'Alert 1' }, mockContext);
  if (!notifyRes.delivered || sentMessage.text !== 'Alert 1' || sentMessage.targetChatId !== 'chat_999') {
    throw new Error('send_notification failed');
  }
  console.log('✓ send_notification OK');

  // 4. Test tasker
  console.log('4. Testing tasker tool...');
  const dbPath = path.join(testDir, 'test.db');
  const dbManager = new DatabaseManager(dbPath);
  const chat = dbManager.upsertChat({ chatId: '12345', platform: 'telegram' });

  const taskerContext = {
    chatId: chat.id,
    storage: dbManager
  };

  const createRes = await executeTool('tasker', {
    action: 'create',
    instruction: 'Ping every minute',
    type: 'polling',
    delay: 60
  }, taskerContext);

  if (!createRes.success || !createRes.taskId) {
    throw new Error('tasker create failed');
  }

  const showRes = await executeTool('tasker', { action: 'show' }, taskerContext);
  if (!showRes.success || showRes.tasks.length !== 1) {
    throw new Error('tasker show failed');
  }

  const updateRes = await executeTool('tasker', {
    action: 'update',
    task_id: createRes.taskId,
    active: false
  }, taskerContext);
  if (!updateRes.success) {
    throw new Error('tasker update failed');
  }

  const deleteRes = await executeTool('tasker', {
    action: 'delete',
    task_id: createRes.taskId
  }, taskerContext);
  if (!deleteRes.success) {
    throw new Error('tasker delete failed');
  }

  dbManager.close();
  console.log('✓ tasker CRUD OK');

  console.log('--- ALL STEP 4 TESTS PASSED ---');
} finally {
  fs.rmSync(testDir, { recursive: true, force: true });
}

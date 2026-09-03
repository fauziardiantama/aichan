import {
  closeDatabase,
  initializeDatabase,
  getDatabasePath,
  upsertChat,
  getChat,
  listChats,
  getChatMessages,
  addMessage,
  deleteChat,
  listSystemPrompts,
  getSystemPrompt,
  saveSystemPrompt,
  deleteSystemPrompt
} from './storage/database.js';

export {
  upsertChat,
  getChat,
  listChats,
  getChatMessages,
  addMessage,
  deleteChat,
  listSystemPrompts,
  getSystemPrompt,
  saveSystemPrompt,
  deleteSystemPrompt
};

export const manifest = {
  name: 'main'
};

export function start() {
  initializeDatabase();
  console.log('[main] Main module initialized.');
}

export function stop() {
  closeDatabase();
  console.log('[main] Main module stopped.');
}

export function status() {
  return { name: 'main', state: 'running', database: getDatabasePath() };
}

export default {
  manifest,
  start,
  stop,
  status,
  upsertChat,
  getChat,
  listChats,
  getChatMessages,
  addMessage,
  deleteChat,
  listSystemPrompts,
  getSystemPrompt,
  saveSystemPrompt,
  deleteSystemPrompt
};

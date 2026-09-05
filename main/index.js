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
  deleteSystemPrompt,
  listProviders,
  saveProvider,
  listModels,
  saveModel,
  getModelCapabilities,
  saveModelCapabilities,
  deleteModelCapabilities
} from './storage/database.js';
import {
  getConfigDirectory,
  getModuleConfig,
  initializeConfig,
  saveModuleConfig
} from './config.js';

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
  deleteSystemPrompt,
  listProviders,
  saveProvider,
  listModels,
  saveModel,
  getModelCapabilities,
  saveModelCapabilities,
  deleteModelCapabilities
};

export {
  getConfigDirectory,
  getModuleConfig,
  saveModuleConfig
};

export const manifest = {
  name: 'main',
  type: 'core'
};

export function start() {
  initializeConfig();
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
  deleteSystemPrompt,
  listProviders,
  saveProvider,
  listModels,
  saveModel,
  getModelCapabilities,
  saveModelCapabilities,
  deleteModelCapabilities
  ,getConfigDirectory
  ,getModuleConfig
  ,saveModuleConfig
};

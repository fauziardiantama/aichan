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
  deleteProvider,
  listModels,
  saveModel,
  getModelCapabilities,
  listAllModelCapabilities,
  saveModelCapabilities,
  deleteModelCapabilities,
  createTask,
  getTask,
  getActiveDueTasks,
  updateTaskTrigger,
  listTasks,
  updateTask,
  deleteTask
} from './storage/database.js';
import {
  getConfigDirectory,
  getModuleConfig,
  initializeConfig,
  saveModuleConfig
} from './config.js';
import { runPipeline } from './pipeline.js';
import { startHeartbeat, stopHeartbeat } from './heartbeat.js';

export {
  runPipeline,
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
  deleteProvider,
  listModels,
  saveModel,
  getModelCapabilities,
  listAllModelCapabilities,
  saveModelCapabilities,
  deleteModelCapabilities,
  createTask,
  getTask,
  getActiveDueTasks,
  updateTaskTrigger,
  listTasks,
  updateTask,
  deleteTask,
  startHeartbeat,
  stopHeartbeat
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
  stopHeartbeat();
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
  runPipeline,
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
  deleteProvider,
  listModels,
  saveModel,
  getModelCapabilities,
  listAllModelCapabilities,
  saveModelCapabilities,
  deleteModelCapabilities,
  createTask,
  getTask,
  getActiveDueTasks,
  updateTaskTrigger,
  listTasks,
  updateTask,
  deleteTask,
  startHeartbeat,
  stopHeartbeat
  ,getConfigDirectory
  ,getModuleConfig
  ,saveModuleConfig
};

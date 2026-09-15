import { getTool, getAllSchemas, registerTool } from './registry.js';
import { timeTool } from './definitions/time.js';
import { notifyTool } from './definitions/notify.js';
import { instanceTool } from './definitions/instance.js';
import { taskerTool } from './definitions/tasker.js';

// Registrasi default tools
registerTool(timeTool);
registerTool(notifyTool);
registerTool(instanceTool);
registerTool(taskerTool);

export function listToolSchemas() {
  return getAllSchemas();
}

export async function executeTool(name, args = {}, context = {}) {
  const tool = getTool(name);
  if (!tool) {
    throw new Error(`Tool "${name}" tidak ditemukan.`);
  }
  return await tool.execute(args, context);
}

export { registerTool, getTool };

export default {
  listToolSchemas,
  executeTool,
  registerTool,
  getTool
};

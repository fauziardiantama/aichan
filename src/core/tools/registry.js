const registeredTools = new Map();

export function registerTool(toolDefinition) {
  const { name, description, parameters, execute } = toolDefinition;
  if (!name || typeof execute !== 'function') {
    throw new Error(`Invalid tool definition: ${name}`);
  }
  registeredTools.set(name, { name, description, parameters, execute });
}

export function getTool(name) {
  return registeredTools.get(name);
}

export function getAllSchemas() {
  return Array.from(registeredTools.values()).map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters
  }));
}

export default {
  registerTool,
  getTool,
  getAllSchemas
};

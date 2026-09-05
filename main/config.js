import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mainDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(mainDir, '..', 'data');
const configDir = path.join(dataDir, 'config');

function configPath(moduleName) {
  if (!/^[a-z0-9_-]+$/i.test(moduleName)) {
    throw new Error('Invalid module name.');
  }
  return path.join(configDir, `${moduleName}.json`);
}

export function initializeConfig() {
  fs.mkdirSync(configDir, { recursive: true });
}

export function getModuleConfig(moduleName, defaults = {}) {
  initializeConfig();
  const filePath = configPath(moduleName);
  if (!fs.existsSync(filePath)) return { ...defaults };
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(filePath, 'utf8')) };
  } catch (error) {
    throw new Error(`main: Failed to read ${moduleName} config: ${error.message}`);
  }
}

export function saveModuleConfig(moduleName, config) {
  initializeConfig();
  const filePath = configPath(moduleName);
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return getModuleConfig(moduleName);
}

export function getConfigDirectory() {
  return configDir;
}

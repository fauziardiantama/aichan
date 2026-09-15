import fs from 'node:fs';
import path from 'node:path';

export class ConfigManager {
  constructor(configDir = './data/config') {
    this.configDir = path.resolve(configDir);
    this.init();
  }

  init() {
    fs.mkdirSync(this.configDir, { recursive: true });
  }

  get(moduleName, defaults = {}) {
    if (!/^[a-z0-9_-]+$/i.test(moduleName)) {
      throw new Error(`Invalid module name: ${moduleName}`);
    }
    this.init();
    const filePath = path.join(this.configDir, `${moduleName}.json`);
    if (!fs.existsSync(filePath)) return { ...defaults };
    try {
      return { ...defaults, ...JSON.parse(fs.readFileSync(filePath, 'utf8')) };
    } catch (error) {
      throw new Error(`ConfigManager: Failed to read ${moduleName} config: ${error.message}`);
    }
  }

  set(moduleName, config) {
    if (!/^[a-z0-9_-]+$/i.test(moduleName)) {
      throw new Error(`Invalid module name: ${moduleName}`);
    }
    this.init();
    const filePath = path.join(this.configDir, `${moduleName}.json`);
    fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    return this.get(moduleName);
  }

  getDirectory() {
    return this.configDir;
  }
}

export default ConfigManager;

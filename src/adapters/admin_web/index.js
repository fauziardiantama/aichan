import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const interfaceDir = path.join(moduleDir, 'interface');
const rootDir = path.resolve(moduleDir, '..', '..', '..');

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (err) {
        reject(new Error('Invalid JSON payload.'));
      }
    });
    req.on('error', reject);
  });
}

export class AdminWebAdapter {
  constructor({ config = {}, engine } = {}) {
    this.port = (config && config.port) || 3000;
    this.engine = engine;
    this.server = null;
    this.manifest = {
      name: 'admin_web',
      type: 'adapter',
      local: true
    };
  }

  status() {
    return { name: 'admin_web', state: this.server ? 'running' : 'idle', port: this.port };
  }

  attachLocalCapabilities(providerKey, models) {
    if (!this.engine || !this.engine.storage) return models;
    return models.map(m => {
      const cap = this.engine.storage.getModelCapabilities(providerKey, m.id);
      return cap ? { ...m, capabilities: cap } : m;
    });
  }

  getAllModules() {
    const modules = [];

    // Core
    modules.push({
      manifest: { name: 'core', type: 'core' },
      status: () => this.engine ? this.engine.status() : { state: 'idle' }
    });

    // Providers
    if (this.engine && this.engine.providers) {
      for (const [key, p] of Object.entries(this.engine.providers)) {
        modules.push(p);
      }
    }

    // Adapters (hanya adapter luar, karena script.js di frontend sudah menyisipkan admin_web secara hardcoded)
    if (this.engine && this.engine.adapters) {
      for (const [key, a] of Object.entries(this.engine.adapters)) {
        if (a !== this && a.manifest?.name !== 'admin_web') {
          modules.push(a);
        }
      }
    }

    return modules;
  }

  start() {
    if (this.server) {
      console.log(`[admin_web] Server already running on port ${this.port}`);
      return Promise.resolve(this.server);
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = reqUrl.pathname.replace(/\/+$/, '') || '/';

        // 1. API: Modules
        if (req.method === 'GET' && pathname === '/api/modules') {
          const manifests = this.getAllModules().map(m => {
            const man = m.manifest || {};
            const status = typeof m.status === 'function' ? m.status() : null;
            return { ...man, status };
          });
          return sendJson(res, 200, manifests);
        }

        // 2. API: Models
        if (req.method === 'GET' && pathname === '/api/models') {
          if (!this.engine) return sendJson(res, 503, { error: 'Engine unavailable.' });
          try {
            const providerList = Object.values(this.engine.providers || {});
            const results = await Promise.all(providerList.map(async p => {
              const man = p.manifest || {};
              try {
                const models = typeof p.listModels === 'function' ? await p.listModels() : [];
                return { provider: man.name, models: this.attachLocalCapabilities(man.name, models) };
              } catch (err) {
                return { provider: man.name, models: [], error: err.message };
              }
            }));
            return sendJson(res, 200, {
              providers: results,
              models: results.flatMap(r => r.models)
            });
          } catch (err) {
            return sendJson(res, 500, { error: err.message });
          }
        }

        // 3. API: Capabilities
        if (req.method === 'GET' && pathname === '/api/capabilities') {
          if (!this.engine?.storage) return sendJson(res, 503, { error: 'Storage unavailable.' });
          return sendJson(res, 200, { capabilities: this.engine.storage.listAllModelCapabilities() });
        }

        if (req.method === 'POST' && pathname === '/api/capabilities') {
          if (!this.engine?.storage) return sendJson(res, 503, { error: 'Storage unavailable.' });
          try {
            const payload = await readBody(req);
            const saved = this.engine.storage.saveModelCapabilities(payload);
            return sendJson(res, 200, { capability: saved });
          } catch (err) {
            return sendJson(res, 400, { error: err.message });
          }
        }

        if (req.method === 'DELETE' && pathname === '/api/capabilities') {
          if (!this.engine?.storage) return sendJson(res, 503, { error: 'Storage unavailable.' });
          const providerKey = reqUrl.searchParams.get('providerKey');
          const modelKey = reqUrl.searchParams.get('modelKey');
          if (providerKey && modelKey) {
            const deleted = this.engine.storage.deleteModelCapabilities(providerKey, modelKey);
            return sendJson(res, deleted ? 200 : 404, { success: deleted });
          }
          try {
            const payload = await readBody(req);
            const pKey = payload.providerKey || payload.provider;
            const mKey = payload.modelKey || payload.model;
            if (!pKey || !mKey) return sendJson(res, 400, { error: 'providerKey and modelKey are required.' });
            const deleted = this.engine.storage.deleteModelCapabilities(pKey, mKey);
            return sendJson(res, deleted ? 200 : 404, { success: deleted });
          } catch (err) {
            return sendJson(res, 400, { error: err.message });
          }
        }

        // 4. API: Chats & Messages
        if (req.method === 'GET' && pathname === '/api/chats') {
          if (!this.engine?.storage) return sendJson(res, 503, { error: 'Storage unavailable.' });
          const result = this.engine.storage.listChats({
            search: reqUrl.searchParams.get('search') || '',
            limit: reqUrl.searchParams.get('limit'),
            offset: reqUrl.searchParams.get('offset')
          });
          return sendJson(res, 200, result);
        }

        const messagesMatch = pathname.match(/^\/api\/chats\/(\d+)\/messages$/);
        if (req.method === 'GET' && messagesMatch) {
          if (!this.engine?.storage) return sendJson(res, 503, { error: 'Storage unavailable.' });
          const chat = this.engine.storage.getChat(Number(messagesMatch[1]));
          if (!chat) return sendJson(res, 404, { error: 'Chat not found.' });
          return sendJson(res, 200, { chat, messages: this.engine.storage.getChatMessages(chat.id) });
        }

        const chatMatch = pathname.match(/^\/api\/chats\/(\d+)$/);
        if (req.method === 'DELETE' && chatMatch) {
          if (!this.engine?.storage) return sendJson(res, 503, { error: 'Storage unavailable.' });
          return sendJson(res, this.engine.storage.deleteChat(Number(chatMatch[1])) ? 200 : 404, { success: true });
        }

        // 5. API: Prompts
        if (req.method === 'GET' && pathname === '/api/prompts') {
          if (!this.engine?.storage) return sendJson(res, 503, { error: 'Storage unavailable.' });
          return sendJson(res, 200, { prompts: this.engine.storage.listSystemPrompts() });
        }

        if (req.method === 'POST' && pathname === '/api/prompts') {
          if (!this.engine?.storage) return sendJson(res, 503, { error: 'Storage unavailable.' });
          try {
            const payload = await readBody(req);
            return sendJson(res, 200, { prompt: this.engine.storage.saveSystemPrompt(payload) });
          } catch (err) {
            return sendJson(res, 400, { error: err.message });
          }
        }

        const promptMatch = pathname.match(/^\/api\/prompts\/(\d+)$/);
        if (req.method === 'DELETE' && promptMatch) {
          if (!this.engine?.storage) return sendJson(res, 503, { error: 'Storage unavailable.' });
          return sendJson(res, this.engine.storage.deleteSystemPrompt(Number(promptMatch[1])) ? 200 : 404, { success: true });
        }

        // 6. API: Config
        if (req.method === 'GET' && pathname === '/api/config') {
          const moduleName = reqUrl.searchParams.get('module');
          if (!this.engine?.config) return sendJson(res, 503, { error: 'Config unavailable.' });
          const targetMod = this.getAllModules().find(m => m.manifest && m.manifest.name === moduleName);
          if (!targetMod) return sendJson(res, 404, { error: `Module '${moduleName}' not found` });
          const defaults = Object.fromEntries((targetMod.manifest.fields || []).map(f => [f, '']));
          return sendJson(res, 200, this.engine.config.get(moduleName, defaults));
        }

        if (req.method === 'POST' && pathname === '/api/config') {
          if (!this.engine?.config) return sendJson(res, 503, { error: 'Config unavailable.' });
          try {
            const { module: moduleName, config } = await readBody(req);
            const targetMod = this.getAllModules().find(m => m.manifest && m.manifest.name === moduleName);
            if (!targetMod) return sendJson(res, 404, { error: `Module '${moduleName}' not found` });
            const saved = this.engine.config.set(moduleName, config);
            if (typeof targetMod.configure === 'function') {
              targetMod.configure(saved);
            }
            return sendJson(res, 200, { success: true, message: 'Config saved successfully' });
          } catch (err) {
            return sendJson(res, 400, { error: err.message });
          }
        }

        // 7. API: Generate (Playground)
        if (req.method === 'POST' && pathname === '/api/generate') {
          if (!this.engine) return sendJson(res, 503, { error: 'Engine unavailable.' });
          try {
            const { module: moduleName, prompt, model, chatId, platform = 'web', promptCodename } = await readBody(req);
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive'
            });
            await this.engine.chat({
              platform,
              chatId: chatId || 'web-playground',
              text: prompt,
              model,
              promptCodename,
              providerKey: moduleName,
              callback: async (msg) => {
                res.write(`data: ${JSON.stringify(msg)}\n\n`);
              }
            });
            res.end();
          } catch (err) {
            if (!res.headersSent) {
              return sendJson(res, 500, { error: err.message });
            }
            res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
            res.end();
          }
          return;
        }

        // 8. Static Files & Vendor Libraries
        let filePath = null;
        let contentType = 'text/plain';

        if (pathname === '/marked.js') {
          filePath = path.join(rootDir, 'node_modules', 'marked', 'lib', 'marked.umd.js');
          contentType = 'application/javascript; charset=utf-8';
        } else if (pathname === '/purify.js') {
          filePath = path.join(rootDir, 'node_modules', 'dompurify', 'dist', 'purify.min.js');
          contentType = 'application/javascript; charset=utf-8';
        } else {
          filePath = path.join(interfaceDir, pathname === '/' ? 'index.html' : pathname.slice(1));
          const ext = path.extname(filePath).toLowerCase();
          const mimeTypes = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8'
          };
          contentType = mimeTypes[ext] || 'application/octet-stream';
        }

        if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          res.writeHead(200, { 'Content-Type': contentType });
          fs.createReadStream(filePath).pipe(res);
          return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      });

      this.server.listen(this.port, () => {
        console.log(`[admin_web] Admin interface running at http://localhost:${this.port}`);
        resolve(this.server);
      });
      this.server.on('error', reject);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
      console.log('[admin_web] Server stopped.');
    }
  }
}

export default AdminWebAdapter;

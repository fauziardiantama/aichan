import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const HTML_FILE = path.join(__dirname, 'interface', 'index.html');

let server = null;
let registeredModules = [];
let storage = null;

function attachLocalCapabilities(provider, models) {
  if (!storage || typeof storage.getModelCapabilities !== 'function') {
    return models.map(model => ({ ...model, recorded: false, capabilities: null }));
  }

  return models.map(model => {
    const caps = storage.getModelCapabilities(provider, model.id);
    if (!caps) {
      return {
        ...model,
        recorded: false,
        capabilities: null
      };
    }
    return {
      ...model,
      name: caps.display_name || model.name,
      recorded: true,
      capabilities: {
        reasoning: Boolean(caps.reasoning),
        tools: Boolean(caps.tools),
        structured_outputs: Boolean(caps.structured_outputs),
        text_input: Boolean(caps.text_input),
        document_input: Boolean(caps.document_input),
        image_input: Boolean(caps.image_input),
        video_input: Boolean(caps.video_input),
        audio_input: Boolean(caps.audio_input),
        text_output: Boolean(caps.text_output),
        document_output: Boolean(caps.document_output),
        image_output: Boolean(caps.image_output),
        video_output: Boolean(caps.video_output),
        audio_output: Boolean(caps.audio_output),
        notes: caps.notes || null
      }
    };
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) reject(new Error('Request body is too large.'));
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('Invalid JSON payload.'));
      }
    });
    req.on('error', reject);
  });
}

export function start(options = {}) {
  const port = typeof options === 'number' ? options : (options.port || PORT);
  registeredModules = (options && options.modules) || [];
  storage = options.storage || null;

  if (server) {
    console.log(`[admin_web] Server already running on port ${port}`);
    return server;
  }

  server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = reqUrl.pathname.replace(/\/+$/, '') || '/';

    // API: List registered modules and manifests
    if (req.method === 'GET' && pathname === '/api/modules') {
      const manifests = registeredModules
        .map(m => {
          const manifest = m.manifest || (m.default && m.default.manifest);
          const status = typeof m.status === 'function' ? m.status() : null;
          return manifest ? { ...manifest, status } : null;
        })
        .filter(Boolean);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(manifests));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/models') {
      Promise.all(registeredModules
        .filter(module => typeof module.listModels === 'function')
        .map(async module => {
          const manifest = module.manifest || (module.default && module.default.manifest) || {};
          try {
            const models = await module.listModels();
            return { provider: manifest.name, models: attachLocalCapabilities(manifest.name, models) };
          } catch (err) {
            return { provider: manifest.name, models: [], error: err.message };
          }
        }))
        .then(providers => sendJson(res, 200, {
          providers,
          models: providers.flatMap(provider => provider.models)
        }))
        .catch(err => sendJson(res, 500, { error: err.message }));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/capabilities') {
      if (!storage) return sendJson(res, 503, { error: 'Storage is not available.' });
      try {
        const capabilities = typeof storage.listAllModelCapabilities === 'function'
          ? storage.listAllModelCapabilities()
          : [];
        return sendJson(res, 200, { capabilities });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    if (req.method === 'POST' && pathname === '/api/capabilities') {
      if (!storage) return sendJson(res, 503, { error: 'Storage is not available.' });
      readBody(req)
        .then(payload => {
          const saved = storage.saveModelCapabilities(payload);
          return sendJson(res, 200, { capability: saved });
        })
        .catch(err => sendJson(res, 400, { error: err.message }));
      return;
    }

    if (req.method === 'DELETE' && pathname === '/api/capabilities') {
      if (!storage) return sendJson(res, 503, { error: 'Storage is not available.' });
      const providerKey = reqUrl.searchParams.get('providerKey');
      const modelKey = reqUrl.searchParams.get('modelKey');
      if (providerKey && modelKey) {
        try {
          const deleted = storage.deleteModelCapabilities(providerKey, modelKey);
          return sendJson(res, deleted ? 200 : 404, { success: deleted });
        } catch (err) {
          return sendJson(res, 500, { error: err.message });
        }
      }

      readBody(req)
        .then(payload => {
          const pKey = payload.providerKey || payload.provider;
          const mKey = payload.modelKey || payload.model;
          if (!pKey || !mKey) {
            return sendJson(res, 400, { error: 'providerKey and modelKey are required.' });
          }
          const deleted = storage.deleteModelCapabilities(pKey, mKey);
          return sendJson(res, deleted ? 200 : 404, { success: deleted });
        })
        .catch(err => sendJson(res, 400, { error: err.message }));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/chats') {
      if (!storage) return sendJson(res, 503, { error: 'Storage is not available.' });
      try {
        const result = storage.listChats({
          search: reqUrl.searchParams.get('search') || '',
          limit: reqUrl.searchParams.get('limit'),
          offset: reqUrl.searchParams.get('offset')
        });
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    const messagesMatch = pathname.match(/^\/api\/chats\/(\d+)\/messages$/);
    if (req.method === 'GET' && messagesMatch) {
      if (!storage) return sendJson(res, 503, { error: 'Storage is not available.' });
      try {
        const chat = storage.getChat(Number(messagesMatch[1]));
        if (!chat) return sendJson(res, 404, { error: 'Chat not found.' });
        return sendJson(res, 200, { chat, messages: storage.getChatMessages(chat.id) });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    const chatMatch = pathname.match(/^\/api\/chats\/(\d+)$/);
    if (req.method === 'DELETE' && chatMatch) {
      if (!storage) return sendJson(res, 503, { error: 'Storage is not available.' });
      return sendJson(res, storage.deleteChat(Number(chatMatch[1])) ? 200 : 404, { success: true });
    }

    if (req.method === 'GET' && pathname === '/api/prompts') {
      if (!storage) return sendJson(res, 503, { error: 'Storage is not available.' });
      return sendJson(res, 200, { prompts: storage.listSystemPrompts() });
    }

    if (req.method === 'POST' && pathname === '/api/prompts') {
      if (!storage) return sendJson(res, 503, { error: 'Storage is not available.' });
      readBody(req)
        .then(payload => sendJson(res, 200, { prompt: storage.saveSystemPrompt(payload) }))
        .catch(err => sendJson(res, 400, { error: err.message }));
      return;
    }

    const promptMatch = pathname.match(/^\/api\/prompts\/(\d+)$/);
    if (req.method === 'DELETE' && promptMatch) {
      if (!storage) return sendJson(res, 503, { error: 'Storage is not available.' });
      return sendJson(res, storage.deleteSystemPrompt(Number(promptMatch[1])) ? 200 : 404, { success: true });
    }

    // API: Get module config
    if (req.method === 'GET' && pathname === '/api/config') {
      const moduleName = reqUrl.searchParams.get('module');
      const targetMod = registeredModules.find(m => {
        const man = m.manifest || (m.default && m.default.manifest);
        return man && man.name === moduleName;
      });

      if (!targetMod) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Module '${moduleName}' not found` }));
        return;
      }

      const man = targetMod.manifest || (targetMod.default && targetMod.default.manifest);
      if (storage?.getModuleConfig) {
        try {
          return sendJson(res, 200, storage.getModuleConfig(moduleName, Object.fromEntries((man.fields || []).map(field => [field, '']))));
        } catch (err) {
          return sendJson(res, 500, { error: err.message });
        }
      }
      return sendJson(res, 503, { error: 'Configuration service is not available.' });
    }

    // API: Save module config
    if (req.method === 'POST' && pathname === '/api/config') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const { module: moduleName, config } = payload;

          const targetMod = registeredModules.find(m => {
            const man = m.manifest || (m.default && m.default.manifest);
            return man && man.name === moduleName;
          });

          if (!targetMod) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Module '${moduleName}' not found` }));
            return;
          }

          if (!storage?.saveModuleConfig) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Configuration service is not available.' }));
            return;
          }
          const savedConfig = storage.saveModuleConfig(moduleName, config);
          const configure = targetMod.configure || (targetMod.default && targetMod.default.configure);
          if (typeof configure === 'function') configure(savedConfig);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Config saved successfully' }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
        }
      });
      return;
    }

    // API: Generate AI response via module
    if (req.method === 'POST' && pathname === '/api/generate') {
      readBody(req).then(async ({ module: moduleName, prompt, model, chatId, platform = 'web', promptCodename }) => {
        try {
          const targetMod = registeredModules.find(m => {
            const man = m.manifest || (m.default && m.default.manifest);
            return man && man.name === moduleName;
          });
          if (!targetMod || typeof targetMod.generate !== 'function') {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Module '${moduleName}' or generate() not found` }));
            return;
          }
          const adaptersMap = {};
          for (const mod of registeredModules) {
            const man = mod.manifest || (mod.default && mod.default.manifest);
            if (man && man.name) {
              adaptersMap[man.name] = mod;
            }
          }
          const context = {
            platform: 'web',
            targetChatId: chatId || 'web-playground',
            storage,
            adapters: adaptersMap
          };
          const result = await storage.runPipeline({
            platform: platform || 'web',
            chatId: chatId || 'admin-playground',
            promptCodename,
            prompt,
            deciderModel: targetMod,
            toolModel: targetMod,
            model,
            context
          });

          sendJson(res, 200, result);
        } catch (err) {
          sendJson(res, 500, { error: err.message });
        }
      }).catch(err => sendJson(res, 400, { error: err.message }));
      return;
    }

    // Static assets & Interface serving

    let targetFile = HTML_FILE;
    let contentType = 'text/html; charset=utf-8';

    if (pathname === '/style.css') {
      targetFile = path.join(__dirname, 'interface', 'style.css');
      contentType = 'text/css; charset=utf-8';
    } else if (pathname === '/script.js') {
      targetFile = path.join(__dirname, 'interface', 'script.js');
      contentType = 'application/javascript; charset=utf-8';
    } else if (pathname === '/marked.js') {
      targetFile = path.join(__dirname, 'node_modules', 'marked', 'lib', 'marked.umd.js');
      contentType = 'application/javascript; charset=utf-8';
    } else if (pathname === '/purify.js') {
      targetFile = path.join(__dirname, 'node_modules', 'dompurify', 'dist', 'purify.min.js');
      contentType = 'application/javascript; charset=utf-8';
    }

    fs.readFile(targetFile, 'utf8', (err, content) => {
      if (err) {
        res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
        res.end(`Unable to load ${pathname}`);
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });

  server.listen(port, () => {
    console.log(`[admin_web] Admin web UI running at http://localhost:${port}`);
  });

  return server;
}

export function stop() {
  if (server) {
    server.close();
    server = null;
    console.log('[admin_web] Admin web UI stopped.');
  }
}

export default {
  start,
  stop
};

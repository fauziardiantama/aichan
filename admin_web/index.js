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
    const pathname = reqUrl.pathname;

    // API: List registered modules and manifests
    if (req.method === 'GET' && pathname === '/api/modules') {
      const manifests = registeredModules
        .map(m => m.manifest || (m.default && m.default.manifest))
        .filter(Boolean);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(manifests));
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
      const configFile = man.configFile || 'config.json';
      const configPath = path.resolve(__dirname, '..', moduleName, configFile);

      if (fs.existsSync(configPath)) {
        try {
          const raw = fs.readFileSync(configPath, 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(raw);
          return;
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to read config file' }));
          return;
        }
      }

      // Return empty default values based on fields
      const defaults = {};
      (man.fields || []).forEach(f => { defaults[f] = ''; });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(defaults));
      return;
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

          const man = targetMod.manifest || (targetMod.default && targetMod.default.manifest);
          const configFile = man.configFile || 'config.json';
          const moduleDir = path.resolve(__dirname, '..', moduleName);
          const configPath = path.resolve(moduleDir, configFile);

          if (!fs.existsSync(moduleDir)) {
            fs.mkdirSync(moduleDir, { recursive: true });
          }

          fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
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
          let chat = null;
          let selectedPrompt = null;
          if (storage) {
            chat = storage.upsertChat({ chatId: chatId || 'admin-playground', platform, promptCodename });
            storage.addMessage({ chatKey: chat.id, role: 'user', content: prompt });
            selectedPrompt = promptCodename ? storage.getSystemPrompt(promptCodename) : (chat.prompt_codename ? storage.getSystemPrompt(chat.prompt_codename) : null);
          }
          const result = await targetMod.generate({ prompt, model, systemPrompt: selectedPrompt?.content });
          if (storage && chat) {
            storage.addMessage({ chatKey: chat.id, role: 'assistant', content: result.text, model: result.model || model || null, promptCodename: selectedPrompt?.codename || null });
          }
          sendJson(res, 200, { ...result, chatId: chat?.chat_id || null });
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

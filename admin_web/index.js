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

export function start(options = {}) {
  const port = typeof options === 'number' ? options : (options.port || PORT);
  registeredModules = (options && options.modules) || [];

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
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const { module: moduleName, prompt, model } = JSON.parse(body || '{}');
          const targetMod = registeredModules.find(m => {
            const man = m.manifest || (m.default && m.default.manifest);
            return man && man.name === moduleName;
          });
          if (!targetMod || typeof targetMod.generate !== 'function') {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Module '${moduleName}' or generate() not found` }));
            return;
          }
          const result = await targetMod.generate({ prompt, model });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
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

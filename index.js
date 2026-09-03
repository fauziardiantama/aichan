import adminWeb from './admin_web/index.js';
import * as telegram from './telegram/index.js';
import * as aistudio from './aistudio/index.js';

console.log('[Ai-Chan] Starting system...');

aistudio.start();

adminWeb.start({
  modules: [telegram, aistudio]
});

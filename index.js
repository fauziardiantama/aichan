import adminWeb from './admin_web/index.js';
import * as main from './main/index.js';
import * as telegram from './telegram/index.js';
import * as aistudio from './aistudio/index.js';

console.log('[Ai-Chan] Starting system...');

main.start();
aistudio.start();

telegram.start({
  provider: aistudio,
  storage: main
});

adminWeb.start({
  modules: [main, telegram, aistudio],
  storage: main
});

// THIS IS NOTE FOR SOMEDAY, DO NOT DELETE
// telegram.start({
//   provider: aistudio
// });
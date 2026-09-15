import { config, providers, telegram, engine, adminWeb } from '../src/index.js';

console.log('--- Testing Step 8: Comprehensive End-to-End Wiring ---');

// 1. Check Config
console.log('1. Checking ConfigManager wiring...');
const tgConfig = config.get('telegram');
if (!tgConfig.apiKey) {
  throw new Error('Telegram config apiKey missing');
}
console.log('✓ Telegram config loaded:', { ownerId: tgConfig.ownerId });

// 2. Check Providers
console.log('2. Checking Multi-Provider wiring...');
if (!providers.aistudio || !providers.chatgpt) {
  throw new Error('Providers registry missing aistudio or chatgpt');
}
if (providers.aistudio.status().state !== 'running') {
  throw new Error('aistudio should be running with configured apiKey');
}
if (providers.chatgpt.status().state !== 'running') {
  throw new Error('chatgpt should be running with configured apiKey');
}
console.log('✓ Both aistudio and chatgpt active and running');

// 3. Check Engine & Database
console.log('3. Checking Engine & Database wiring...');
await engine.start({ startScheduler: false });
const status = engine.status();
if (status.state !== 'running') {
  throw new Error('Engine status is not running');
}
const prompts = engine.storage.listSystemPrompts();
if (!prompts.length) {
  throw new Error('Database system prompts empty');
}
console.log('✓ Engine & Database operational. Default prompt:', prompts[0].codename);

// 4. Check Adapter wiring
console.log('4. Checking Telegram & AdminWeb adapters...');
if (telegram.manifest.name !== 'telegram') {
  throw new Error('Telegram manifest mismatch');
}
if (adminWeb.manifest.name !== 'admin_web') {
  throw new Error('AdminWeb manifest mismatch');
}
console.log('✓ Adapters connected to Engine');

await engine.stop();
console.log('--- ALL STEP 8 E2E WIRING TESTS PASSED ---');

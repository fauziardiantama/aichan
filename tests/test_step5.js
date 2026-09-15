import { AIStudioProvider } from '../src/providers/aistudio.js';
import { ChatGPTProvider } from '../src/providers/chatgpt.js';

console.log('--- Testing Step 5: AI Providers Layer ---');

// 1. Test AIStudioProvider Contract
console.log('1. Testing AIStudioProvider contract...');
const aistudio = new AIStudioProvider();
if (aistudio.manifest.name !== 'aistudio' || aistudio.manifest.type !== 'ai-provider') {
  throw new Error('AIStudio manifest mismatch');
}
if (aistudio.status().state !== 'idle') {
  throw new Error('AIStudio initial state should be idle');
}
aistudio.configure({ apiKey: 'fake_key_123' });
if (aistudio.status().state !== 'running') {
  throw new Error('AIStudio state should be running after configuring apiKey');
}
if (typeof aistudio.listModels !== 'function' ||
    typeof aistudio.generateStructured !== 'function' ||
    typeof aistudio.generateWithNativeTools !== 'function' ||
    typeof aistudio.generate !== 'function') {
  throw new Error('AIStudio missing standard provider methods');
}
console.log('✓ AIStudioProvider contract OK');

// 2. Test ChatGPTProvider Contract
console.log('2. Testing ChatGPTProvider contract...');
const chatgpt = new ChatGPTProvider();
if (chatgpt.manifest.name !== 'chatgpt' || chatgpt.manifest.type !== 'ai-provider') {
  throw new Error('ChatGPT manifest mismatch');
}
if (chatgpt.status().state !== 'idle') {
  throw new Error('ChatGPT initial state should be idle');
}
chatgpt.configure({ apiKey: 'fake_key_456' });
if (chatgpt.status().state !== 'running') {
  throw new Error('ChatGPT state should be running after configuring apiKey');
}
if (typeof chatgpt.listModels !== 'function' ||
    typeof chatgpt.generateStructured !== 'function' ||
    typeof chatgpt.generateWithNativeTools !== 'function' ||
    typeof chatgpt.generate !== 'function') {
  throw new Error('ChatGPT missing standard provider methods');
}
console.log('✓ ChatGPTProvider contract OK');

console.log('--- ALL STEP 5 TESTS PASSED ---');

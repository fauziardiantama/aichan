# Cetak Biru Arsitektur & Spesifikasi Kontrak Ai-Chan Baru

Dokumen ini adalah spesifikasi teknis arsitektur baru yang dirancang bersih dari nol (*first principles*) untuk diimplementasikan di dalam `aichan-temp/`. Dokumen ini menyelesaikan seluruh masalah *god object*, *leaky abstraction*, duplikasi kode, dan *self-injection* yang ada pada kode lama, tanpa menghilangkan satupun fitur dari [Inventarisasi Domain](file:///E:/Ai-Chan/aichan-temp/domain_inventory.md).

---

## 1. Struktur Direktori Baru (`aichan-temp/`)

```text
aichan-temp/
├── data/
│   ├── aichan.db                  <-- Database SQLite aktif
│   └── config/                    <-- Berkas konfigurasi modul JSON
│       ├── telegram.json
│       ├── aistudio.json
│       └── chatgpt.json
├── src/
│   ├── core/
│   │   ├── database/
│   │   │   ├── schema.sql         <-- Skema 6 tabel (prompts, chats, messages, models, capabilities, tasks)
│   │   │   └── index.js           <-- SQLite driver & seluruh fungsi CRUD query
│   │   ├── config/
│   │   │   └── index.js           <-- ConfigManager (baca/tulis JSON di data/config/)
│   │   ├── tools/
│   │   │   ├── definitions/
│   │   │   │   ├── notify.js      <-- Tool send_notification
│   │   │   │   ├── tasker.js      <-- Tool tasker
│   │   │   │   ├── instance.js    <-- Tool manage_instance
│   │   │   │   └── time.js        <-- Tool get_current_time
│   │   │   ├── registry.js        <-- Registrasi & skema tool
│   │   │   └── index.js           <-- Eksekutor tool
│   │   ├── pipeline/
│   │   │   └── index.js           <-- Orkestrator 2-tahap (Decider -> Tool Loop)
│   │   ├── scheduler/
│   │   │   └── index.js           <-- Heartbeat ticker pasif 15 detik
│   │   └── index.js               <-- CoreEngine (Pusat kendali internal terpadu)
│   ├── providers/
│   │   ├── aistudio.js            <-- Provider Gemini SDK (@google/genai)
│   │   └── chatgpt.js             <-- Provider OpenAI SDK (openai)
│   ├── adapters/
│   │   ├── telegram.js            <-- Adapter Bot Telegraf
│   │   └── admin_web/
│   │       ├── interface/         <-- Static frontend (index.html, script.js, style.css)
│   │       └── index.js           <-- HTTP Server REST API Dashboard (14 endpoints)
│   └── index.js                   <-- Root Entry Point (Wiring deklaratif)
├── package.json
└── domain_inventory.md
```

---

## 2. Spesifikasi Kontrak Antarmuka (Interface Contracts)

### A. Kontrak Core Engine (`src/core/index.js`)

`CoreEngine` adalah orchestrator pusat yang menyatukan subsistem internal. Modul luar hanya berinteraksi melalui kelas/objek ini.

```javascript
export class CoreEngine {
  constructor({
    dbPath = './data/aichan.db',
    config,                        // Instance ConfigManager
    providers = {},                // { aistudio, chatgpt }
    defaultProviderKey = 'aistudio',
    adapters = {}                  // { telegram, ... }
  }) {}

  // 1. Lifecycle
  async start({ startScheduler = true, schedulerIntervalMs = 15000 } = {}) {}
  async stop() {}
  status() {} // Mengembalikan status engine & health check

  // 2. Eksekusi Chat (Dipanggil oleh Adapter saat ada pesan masuk)
  async chat({
    platform,
    chatId,
    text,
    model = null,
    promptCodename = null,
    providerKey = null
  }) {} // Mengembalikan: { text: string, chatId: string }

  // 3. Ekspos Layanan Internal untuk Admin Web
  get storage() {}   // Driver database untuk endpoint chats, messages, prompts, capabilities
  get config() {}    // ConfigManager untuk endpoint live config GET/POST
  get providers() {} // Provider registry untuk endpoint /api/models & playground
}
```

#### Aturan Kunci Core Engine:
1. **Perakitan `context` Otomatis**: Saat `engine.chat(...)` dipanggil, `CoreEngine` sendiri yang merakit objek `context` (menyuntikkan `storage: this.database` dan `adapters: this.adapters`). Adapter luar **tidak boleh** dan **tidak perlu** tahu detail database.
2. **Scheduler Mandiri**: `engine.start()` langsung menyalakan ticker scheduler dengan menggunakan database dan pipelinenya sendiri. **Nol *self-injection***.

---

### B. Kontrak AI Provider (`src/providers/`)

Setiap provider (`aistudio.js`, `chatgpt.js`) wajib mematuhi kontrak antarmuka berikut:

```javascript
export interface AIProvider {
  manifest: {
    name: string,               // 'aistudio' | 'chatgpt'
    type: 'ai-provider',
    configFile: string,         // 'config.json'
    fields: string[]            // ['apiKey']
  };

  start(options?: { config?: { apiKey: string } }): void;
  stop(): void;
  status(): { name: string, state: 'running' | 'idle' };
  configure(config: { apiKey: string }): void;

  // Metode Fungsional AI
  listModels(): Promise<Array<{ id: string, name: string, provider: string }>>;
  generateStructured(params: {
    prompt: string,
    model?: string,
    history?: any[],
    schema: object,
    systemPrompt?: string
  }): Promise<{ need_tool: boolean, response_text: string | null }>;

  generateWithNativeTools(params: {
    model?: string,
    systemPrompt: string,
    messages: any[],
    tools: object[]
  }): Promise<{ isFinal: boolean, text: string, toolCalls?: any[] }>;

  generate(params: {
    prompt: string,
    model?: string,
    history?: any[],
    systemPrompt?: string
  }): Promise<{ text: string }>;
}
```

---

### C. Kontrak Adapter Komunikasi (`src/adapters/`)

#### 1. Telegram Adapter (`src/adapters/telegram.js`)
Murni menangani I/O bot Telegram:
```javascript
export class TelegramAdapter {
  constructor({ config = {} }) {}

  manifest = {
    name: 'telegram',
    type: 'adapter',
    fields: ['apiKey', 'ownerId']
  };

  // Mendaftarkan listener ketika pesan masuk dari user
  onMessage(handler: (event: { chatId: string, text: string }) => Promise<{ text: string }>): void;

  // Dipanggil oleh tool send_notification via context.adapters.telegram
  async sendMessage(chatId: string, text: string): Promise<any>;

  start(): Promise<void>;
  stop(): void;
  status(): { name: string, state: 'running' | 'idle' };
}
```
*Aturan: Telegram Adapter DILARANG menerima parameter `storage` atau `runPipeline`.*

#### 2. Admin Web Adapter (`src/adapters/admin_web/index.js`)
Dashboard HTTP server yang menyajikan UI dan REST API:
```javascript
export class AdminWebAdapter {
  constructor({ config = { port: 3000 }, engine }) {}

  manifest = {
    name: 'admin_web',
    type: 'adapter',
    local: true
  };

  start(): Promise<void>;
  stop(): void;
  status(): { name: string, state: 'running' | 'idle' };
}
```
*Aturan: Admin Web berkomunikasi dengan Core melalui interface `engine.storage`, `engine.config`, `engine.providers`, dan `engine.chat(...)`.*

---

### D. Kontrak Config Manager (`src/core/config/index.js`)

Memusatkan pengelolaan berkas JSON konfigurasi di `data/config/`:
```javascript
export class ConfigManager {
  constructor(configDir = './data/config') {}

  get(moduleName: string, defaults?: object): object;
  set(moduleName: string, data: object): object;
  getDirectory(): string;
}
```

---

## 3. Cetak Biru `src/index.js` (Root Wiring Bersih)

Berkas utama menjadi sangat ringkas, jelas, dan tanpa trik tambal-sulam:

```javascript
import { ConfigManager } from './core/config/index.js';
import { CoreEngine } from './core/index.js';
import { AIStudioProvider } from './providers/aistudio.js';
import { ChatGPTProvider } from './providers/chatgpt.js';
import { TelegramAdapter } from './adapters/telegram.js';
import { AdminWebAdapter } from './adapters/admin_web/index.js';

// 1. Manajer Konfigurasi
const config = new ConfigManager('./data/config');

// 2. Providers AI
const providers = {
  aistudio: new AIStudioProvider(config.get('aistudio')),
  chatgpt: new ChatGPTProvider(config.get('chatgpt'))
};

// 3. Adapters I/O
const telegram = new TelegramAdapter({ config: config.get('telegram') });

// 4. Core Engine
const engine = new CoreEngine({
  dbPath: './data/aichan.db',
  config,
  providers,
  defaultProviderKey: 'aistudio',
  adapters: { telegram }
});

// 5. Sambungkan Event Pesan Masuk Telegram ke Engine
telegram.onMessage(async ({ chatId, text }) => {
  return await engine.chat({
    platform: 'telegram',
    chatId,
    text
  });
});

// 6. Admin Web Dashboard
const adminWeb = new AdminWebAdapter({
  config: config.get('admin_web', { port: 3000 }),
  engine
});

// 7. Booting Sistem
console.log('[Ai-Chan] Starting Clean Architecture...');
await engine.start();      // Otomatis menginisialisasi DB dan menyalakan Scheduler
await telegram.start();    // Mulai polling bot Telegram
await adminWeb.start();    // Mulai web server port 3000
```

---

## 4. Evaluasi Bebas Masalah (Verification Matrix)

| Masalah pada Kode Lama | Solusi pada Cetak Biru Baru |
|---|---|
| `main` menjadi *God Object* raksasa | Dipecah menjadi subdirektori dengan tanggung jawab tunggal: `core/database/`, `core/config/`, `core/tools/`, `core/pipeline/`, `core/scheduler/`. |
| Telegram membawa `storage` & `runPipeline` | Telegram murni adapter event: `onMessage(...)` memanggil `engine.chat(...)`, `sendMessage(...)` mengirim ke API bot. Bebas dari database. |
| *Self-Injection* `startHeartbeat` di root | `engine.start()` menyalakan scheduler miliknya sendiri secara internal tanpa perlu diobok-obok dari luar. |
| Duplikasi 138 baris barrel export | Modul `core/index.js` menyediakan class `CoreEngine` yang ringkas (~70 baris) dengan interface yang jelas. |
| Multi-provider `aistudio` & `chatgpt` | Terdaftar seragam di dalam objek `providers: { aistudio, chatgpt }`, keduanya dapat dipilih dan diuji di Web UI. |
| Konfigurasi modul terpecah | Dikelola seragam melalui `ConfigManager` yang tetap kompatibel dengan berkas `data/config/*.json`. |

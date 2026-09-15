# Inventarisasi Domain Sistem Ai-Chan (Baseline Lengkap)

Dokumen ini memetakan seluruh komponen, persistensi data, antarmuka, dan alur kerja aktual sistem Ai-Chan (pada commit `dc538af`) tanpa ada yang dihilangkan. Dokumen ini menjadi rujukan mutlak sebelum merancang arsitektur baru.

---

## 1. Persistensi Data (Storage & Config)

### A. Database SQLite (`data/aichan.db`)
Menggunakan skema di `main/storage/schema.sql` yang terdiri dari 6 tabel utama:

1. **`system_prompts`**:
   - Kolom: `id`, `codename` (UNIQUE), `content`, `is_active` (0/1), `description`, `created_at`, `updated_at`.
   - Fungsi: Menyimpan instruksi kepribadian/sistem AI yang dapat dipilih per chat.

2. **`chats`**:
   - Kolom: `id`, `chat_id`, `platform`, `prompt_id` (FK `system_prompts.id`), `title`, `created_at`, `updated_at`.
   - Kunci Unik: `UNIQUE(platform, chat_id)`.
   - Indeks: `idx_chats_updated_at`.

3. **`messages`**:
   - Kolom: `id`, `chat_id` (FK `chats.id`), `role` ('user', 'assistant', 'system'), `content`, `model`, `prompt_codename`, `created_at`.
   - Indeks: `idx_messages_chat_id_created_at`.

4. **`providers` & `models`**:
   - `providers`: `id`, `provider_key` (UNIQUE), `display_name`, `created_at`, `updated_at`.
   - `models`: `id`, `provider_id` (FK `providers.id`), `model_key`, `display_name`, `created_at`, `updated_at`.
   - Kunci Unik: `UNIQUE(provider_id, model_key)`.

5. **`model_capabilities`**:
   - Kolom: `id`, `model_id` (FK `models.id`), flags boolean (0/1):
     `reasoning`, `tools`, `structured_outputs`, `text_input`, `document_input`, `image_input`, `video_input`, `audio_input`, `text_output`, `document_output`, `image_output`, `video_output`, `audio_output`, serta `notes`, `created_at`, `updated_at`.

6. **`tasks` (Subsistem Heartbeat/Tasker)**:
   - Kolom: `id`, `chat_id` (FK `chats.id`), `instruction`, `type` ('polling', 'recurring'), `trigger_at` (ISO timestamp), `delay` (detik), `active` (0/1), `created_at`, `updated_at`.
   - Indeks: `idx_tasks_active_due` pada `(active, trigger_at) WHERE active = 1`.

---

### B. Konfigurasi Modul JSON (`data/config/*.json`)
Dikelola oleh `main/config.js` (`initializeConfig`, `getModuleConfig`, `saveModuleConfig`):
1. **`telegram.json`**: `{ "apiKey": "...", "ownerId": "..." }`
2. **`aistudio.json`**: `{ "apiKey": "..." }`
3. **`chatgpt.json`**: `{ "apiKey": "..." }`

---

## 2. AI Providers (`aistudio` & `chatgpt`)

Keduanya mengimplementasikan kontrak standar provider:
1. **Identitas**:
   - `manifest`: `{ name, type: 'ai-provider', configFile: 'config.json', fields: ['apiKey'] }`
2. **Siklus Hidup & Konfigurasi**:
   - `start({ config })`
   - `stop()`
   - `status()` -> `{ name, state: 'running' | 'idle' }`
   - `configure(config)`
3. **Metode Eksekusi AI**:
   - `listModels()`: Mengembalikan daftar model dari SDK (`models.list()` atau `openai.models.list()`).
   - `generateStructured({ prompt, model, history, schema, systemPrompt })`: Menghasilkan JSON terstruktur (digunakan oleh Tahap 1 / Decider).
   - `generateWithNativeTools({ model, systemPrompt, messages, tools })`: Menghasilkan balasan atau daftar `toolCalls` asli SDK (digunakan oleh Tahap 2 / Tool Loop).
   - `generate({ prompt, model, history, systemPrompt })`: Pemanggilan teks bebas untuk endpoint test playground Admin Web.

---

## 3. Tool AI (`main/tools/`)

Dikelola oleh `registry.js` dan `index.js` (`listToolSchemas()`, `executeTool(name, args, context)`):
1. **`send_notification`** (`definitions/notify.js`):
   - Menerima: `{ message }`.
   - Mengambil adapter via `context.adapters[context.platform]`.
   - Memanggil `adapter.sendMessage(context.targetChatId, message)`.
2. **`tasker`** (`definitions/tasker.js`):
   - Aksi: `'show'`, `'create'`, `'update'`, `'delete'`.
   - Berinteraksi dengan `context.storage` (`listTasks`, `createTask`, `updateTask`, `deleteTask`).
   - Terikat isolasi konteks percakapan: `context.chatId`.
3. **`manage_instance`** (`definitions/instance.js`):
   - Placeholder pengelola service luar (Minecraft, Discord) via `context.adapters[args.service]`.
4. **`get_current_time`** (`definitions/time.js`):
   - Mengembalikan ISO timestamp waktu sistem saat ini.

---

## 4. Pipeline & Orchestrator (`main/pipeline.js`)

Fungsi: `runPipeline({ prompt, history, deciderModel, toolModel, model, systemPrompt, platform, chatId, promptCodename, context })`
Alur:
1. Persistensi pesan user ke `messages` dan upsert `chats`.
2. **Tahap 1 (Decider)**:
   - Memanggil `deciderModel.generateStructured(...)` dengan skema `{ need_tool: boolean, response_text: string }`.
   - Jika `!need_tool`, langsung simpan pesan balasan ke database dan return.
3. **Tahap 2 (Tool Loop)**:
   - Jika `need_tool = true`, masuk ke loop iterasi maksimal 5 putaran.
   - Memanggil `toolModel.generateWithNativeTools(...)`.
   - Jika menerima `toolCalls`, mengeksekusi setiap tool via `executeTool(call.name, call.arguments, context)` dan mengembalikan hasilnya ke riwayat pesan percakapan model.
   - Loop berhenti saat model mengembalikan respon teks akhir (`isFinal`) atau batas 5 iterasi tercapai.
   - Menyimpan respon akhir asisten ke database.

---

## 5. Background Heartbeat Runner (`main/heartbeat.js`)

Fungsi: `startHeartbeat({ storage, runPipeline, provider, adapters, intervalMs = 15000 })` & `stopHeartbeat()`
Alur:
1. Ticker `setInterval` setiap 15 detik.
2. Membaca `storage.getActiveDueTasks()` (tugas aktif yang `trigger_at <= NOW()`).
3. Untuk setiap tugas:
   - Merakit `context` (`platform`, `targetChatId`, `chatId`, `taskId`, `storage`, `adapters`).
   - Memanggil `runPipeline(...)` dengan instruksi task.
   - Mengecek status task terbaru: jika masih `active === 1`, memajukan jadwal `trigger_at = now + delay`.

---

## 6. Adapter Komunikasi

### A. Telegram Adapter (`telegram/index.js`)
- Menggunakan Telegraf.
- `manifest`: `{ name: 'telegram', type: 'adapter', configFile: 'config.json', fields: ['apiKey', 'ownerId'] }`.
- Mendengarkan pesan masuk (`bot.on('text')`) $\rightarrow$ memanggil `handleMessage` $\rightarrow$ memanggil `runPipeline` $\rightarrow$ membalas via `ctx.reply()`.
- Menyediakan `sendMessage(chatId, text)` untuk pesan keluar (digunakan oleh `notifyTool`).

### B. Admin Web Dashboard (`admin_web/`)
- Web server HTTP native (port 3000).
- Frontend: HTML/CSS/JS (`admin_web/interface/`).
- Endpoint REST API:
  - `/api/modules` (daftar modul dan status)
  - `/api/models` (daftar model provider yang terpasang)
  - `/api/capabilities` (GET/POST/DELETE kapabilitas model)
  - `/api/chats` & `/api/chats/:id/messages` (manajemen percakapan dan pesan)
  - `/api/prompts` & `/api/prompts/:id` (manajemen prompt sistem)
  - `/api/config` (GET dan POST konfigurasi modul secara live)
  - `/api/generate` (playground pengetesan AI langsung di browser)

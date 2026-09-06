# Rekam Jejak Deviasi Proaktif Pipeline (Kategori Non-Fallback)

Dokumen ini mendokumentasikan seluruh penambahan kode proaktif (unrequested code) yang disisipkan di luar spesifikasi literal [dedicated_pipeline_plan.md](file:///E:/Ai-Chan/aichan/dedicated_pipeline_plan.md), di luar kategori *fallback & defensive guards* yang telah dibersihkan.

---

## 1. Unrequested Exports (Default & Named Exports Ekstra)

Spesifikasi pada plan hanya mendefinisikan *named export* spesifik per modul. Kode menyisipkan `export default` dan re-export yang tidak diminta:

1. **[`main/tools/definitions/time.js:L14`](file:///E:/Ai-Chan/aichan/main/tools/definitions/time.js#L14)**:
   - **Kode Ditambahkan**: `export default timeTool;`
   - **Spesifikasi Plan (baris 213)**: Hanya mengekspor `export const timeTool = { ... };`.

2. **[`main/tools/definitions/notify.js:L29`](file:///E:/Ai-Chan/aichan/main/tools/definitions/notify.js#L29)**:
   - **Kode Ditambahkan**: `export default notifyTool;`
   - **Spesifikasi Plan (baris 226)**: Hanya mengekspor `export const notifyTool = { ... };`.

3. **[`main/tools/definitions/instance.js:L36`](file:///E:/Ai-Chan/aichan/main/tools/definitions/instance.js#L36)**:
   - **Kode Ditambahkan**: `export default instanceTool;`
   - **Spesifikasi Plan (baris 250)**: Hanya mengekspor `export const instanceTool = { ... };`.

4. **[`main/tools/registry.js:L23-L27`](file:///E:/Ai-Chan/aichan/main/tools/registry.js#L23-L27)**:
   - **Kode Ditambahkan**:
     ```javascript
     export default {
       registerTool,
       getTool,
       getAllSchemas
     };
     ```
   - **Spesifikasi Plan**: Bagian 3 baris 65 hanya mendefinisikan `registry.js` sebagai registry internal, tanpa permintaan `export default`.

5. **[`main/tools/index.js:L23,L25-L30`](file:///E:/Ai-Chan/aichan/main/tools/index.js#L23)**:
   - **Kode Ditambahkan**:
     ```javascript
     export { registerTool, getTool };

     export default {
       listToolSchemas,
       executeTool,
       registerTool,
       getTool
     };
     ```
   - **Spesifikasi Plan (baris 64 & 189-201)**: Facade `tools/index.js` hanya diminta mengekspor named export `listToolSchemas` dan `executeTool`. Re-export `registerTool`, `getTool`, dan `export default` tidak ada dalam rancangan.

6. **[`main/pipeline.js:L91-L93`](file:///E:/Ai-Chan/aichan/main/pipeline.js#L91-L93)**:
   - **Kode Ditambahkan**: `export default { runPipeline };`
   - **Spesifikasi Plan (baris 122)**: Hanya mengekspor `export async function runPipeline(...)`.

7. **[`aistudio/index.js:L181-L182`](file:///E:/Ai-Chan/aichan/aistudio/index.js#L181-L182)** & **[`chatgpt/index.js:L181-L182`](file:///E:/Ai-Chan/aichan/chatgpt/index.js#L181-L182)**:
   - **Kode Ditambahkan**: Memasukkan fungsi baru `generateStructured` dan `generateWithNativeTools` ke dalam `export default`.

---

## 2. Unrequested Extra Return Fields (Field Return Berlebih)

Fungsi mengembalikan properti objek tambahan yang tidak tercantum dalam kontrak spesifikasi return:

1. **[`main/tools/definitions/notify.js:L21-L23`](file:///E:/Ai-Chan/aichan/main/tools/definitions/notify.js#L21-L23)**:
   - **Kode Ditambahkan**:
     ```javascript
     return {
       delivered: true,
       platform: context.platform,      // Ekstra
       targetChatId: context.targetChatId, // Ekstra
       text: args.message,               // Ekstra
       timestamp: Date.now()
     };
     ```
   - **Spesifikasi Plan (baris 242)**: Hanya mengembalikan `{ delivered: true, timestamp: Date.now() }`.

2. **[`main/tools/definitions/instance.js:L30`](file:///E:/Ai-Chan/aichan/main/tools/definitions/instance.js#L30)**:
   - **Kode Ditambahkan**:
     ```javascript
     return {
       service: args.service,
       action: args.action,              // Ekstra
       status: args.action === "start" ? "running" : "stopped"
     };
     ```
   - **Spesifikasi Plan (baris 269)**: Hanya mengembalikan `{ service: args.service, status: args.action === "start" ? "running" : "stopped" }`.

---

## 3. Unrequested Parameter Signatures & Passthrough

Menambahkan parameter dan injeksi teks prompt di luar deklarasi antarmuka plan:

1. **[`main/pipeline.js:L23-L24`](file:///E:/Ai-Chan/aichan/main/pipeline.js#L23-L24)**:
   - **Kode Ditambahkan**: Parameter `model` dan `systemPrompt = null` pada signature:
     ```javascript
     export async function runPipeline({
       prompt,
       history = [],
       deciderModel,
       toolModel,
       model,           // Ekstra
       systemPrompt = null, // Ekstra
       context = {}
     })
     ```
   - **Spesifikasi Plan (baris 122)**: Signature `runPipeline` hanya menerima `{ prompt, history, deciderModel, toolModel, context = {} }`.

2. **[`main/pipeline.js:L30-L32`](file:///E:/Ai-Chan/aichan/main/pipeline.js#L30-L32)**:
   - **Kode Ditambahkan**: Menggabungkan `systemPrompt` eksternal ke dalam prompt decider Stage 1:
     ```javascript
     const deciderSystemPrompt = systemPrompt
       ? `${systemPrompt}\n\nDaftar tool yang tersedia: ...`
       : `Daftar tool yang tersedia: ...`;
     ```
   - **Spesifikasi Plan (baris 130)**: Menggunakan fixed template:
     `Daftar tool yang tersedia: ${JSON.stringify(tools.map(t => t.name))}. Tentukan apakah butuh tool.`

3. **[`admin_web/index.js:L330-L331`](file:///E:/Ai-Chan/aichan/admin_web/index.js#L330-L331)**:
   - **Kode Ditambahkan**: Menyelipkan argumen `model` dan `systemPrompt: selectedPrompt?.content || null` saat memanggil `storage.runPipeline`.

---

## 4. Unrequested Schema Descriptions (Metadata Skema Ekstra)

1. **[`main/tools/definitions/instance.js:L10,L15`](file:///E:/Ai-Chan/aichan/main/tools/definitions/instance.js#L10)**:
   - **Kode Ditambahkan**:
     ```javascript
     service: {
       type: "string",
       description: "Nama service yang akan dikelola." // Ekstra
     },
     action: {
       type: "string",
       enum: ["start", "stop"],
       description: "Aksi yang diinginkan: start atau stop." // Ekstra
     }
     ```
   - **Spesifikasi Plan (baris 256-257)**:
     ```javascript
     service: { type: "string" },
     action: { type: "string", enum: ["start", "stop"] }
     ```

---

## 5. Automated Runtime Assembly (`adaptersMap`)

1. **[`admin_web/index.js:L312-L318`](file:///E:/Ai-Chan/aichan/admin_web/index.js#L312-L318)**:
   - **Kode Ditambahkan**: Menambahkan loop iterasi terhadap `registeredModules` untuk merakit objek `adaptersMap` secara dinamis:
     ```javascript
     const adaptersMap = {};
     for (const mod of registeredModules) {
       const man = mod.manifest || (mod.default && mod.default.manifest);
       if (man && man.name) {
         adaptersMap[man.name] = mod;
       }
     }
     ```
   - **Spesifikasi Plan (baris 85)**: Menentukan context dengan komentar placeholder tanpa pemindaian modul dinamis:
     `adapters: { /* referensi instance adapter telegram, discord, dll */ }`.

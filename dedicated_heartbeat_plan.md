# Dedicated Heartbeat & Tasker Architecture Plan

Dokumen perencanaan arsitektur subsistem **Passive Heartbeat** dan **Tasker** pada Ai-Chan. Dokumen ini memformalkan rancangan sederhana yang mampu menangani tugas berulang tanpa henti (*infinite recurring*) maupun tugas pemantauan berkala hingga selesai (*polling until complete*).

---

## 1. Latar Belakang & Analisis Skenario

Sistem dirancang untuk memuaskan dua kebutuhan utama tanpa membingungkan siklus hidup tugas:

### Skenario 1: Infinite Recurring (Tugas Abadi)
- **Kasus**: Pengguna meminta AI mengecek kapasitas storage tiap 2 jam, dan memberi peringatan jika sisa kapasitas di bawah 5GB.
- **Karakteristik**: Tugas ini tidak memiliki kondisi "selesai". Tugas harus terus hidup dan berulang setiap interval waktu tertentu sampai pengguna secara eksplisit menghapusnya.

### Skenario 2: Polling Until Complete (Pemantauan Hingga Tuntas)
- **Kasus**: Pengguna meminta AI memasang suatu aplikasi (`pip install` / `apt install`) dan menunggu hingga prosesnya selesai.
- **Karakteristik**: Tugas ini berulang secara periodik (misal tiap 1 menit), tetapi memiliki **kondisi akhir**. Selama proses masih berjalan (*status quo*), sistem tidak mengirim notifikasi dan tetap aktif. Begitu proses tuntas (sukses atau gagal), tugas harus **berhenti** dan status aktifnya dimatikan agar tidak berulang lagi.

---

## 2. Skema Basis Data (`aichan/main/storage/schema.sql`)

Tabel `tasks` dirancang secara presisi dengan kolom-kolom berikut:

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER,
  instruction TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('polling', 'recurring')),
  trigger_at TEXT NOT NULL,
  delay INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_active_due 
ON tasks (active, trigger_at) 
WHERE active = 1;
```

### Definisi Kolom:
- **`id`**: Primary key integer unik.
- **`chat_id`**: Kunci asing ke `chats(id)` pemilik tugas (menjaga isolasi konteks).
- **`instruction`**: Teks perintah yang harus dievaluasi oleh AI.
- **`type`**: Jenis tugas (`'recurring'` untuk tugas abadi, `'polling'` untuk tugas berulang sementara hingga tuntas).
- **`trigger_at`**: Titik waktu absolut kapan tugas harus dieksekusi berikutnya (ISO 8601 UTC string).
- **`delay`**: Durasi jeda antar-eksekusi dalam satuan detik (misal: `7200` untuk 2 jam, `300` untuk 5 menit).
- **`active`**: Status keaktifan boolean (`1` = aktif/berjalan, `0` = nonaktif/selesai).

---

## 3. Alur Logika Heartbeat Runner (`aichan/main/heartbeat.js`)

Heartbeat berjalan sebagai *ticker* periodik setiap 15 detik (`setInterval(heartbeatTick, 15000)`).

### A. System Prompt Khusus Heartbeat
Untuk memastikan AI mengerti perannya saat dibangunkan oleh detak jantung sistem, prompt instruksi sistem disuntikkan secara eksplisit:

```text
Lakukan sesuai instruksi. 
Jika tipe tugas adalah 'recurring', maka tetap lakukan tanpa mengubah status aktif menjadi false. 
Jika tipe tugas adalah 'polling', maka ubah status dari aktif menjadi false jika tugas telah selesai (baik complete maupun error). 
Jika diinstruksikan untuk memberi notifikasi, gunakan tool yang sesuai ('send_notification'), tetapi HANYA gunakan sesuai ketentuan (biasanya saat selesai atau saat error, bukan saat status quo).
```

### B. Algoritma Eksekusi Ticker
```javascript
let intervalTimer = null;
let isTicking = false;

export function startHeartbeat({ storage, runPipeline, provider, adapters = {}, intervalMs = 15000 }) {
  if (intervalTimer) return;

  intervalTimer = setInterval(async () => {
    if (isTicking) return;
    isTicking = true;

    try {
      // 1. Ambil seluruh task yang aktif dan waktunya sudah tiba (trigger_at <= now)
      const dueTasks = storage.getActiveDueTasks();

      for (const task of dueTasks) {
        await executeTaskTick({ task, storage, runPipeline, provider, adapters });
      }
    } catch (err) {
      console.error('[heartbeat] Error in tick execution:', err.message);
    } finally {
      isTicking = false;
    }
  }, intervalMs);
}

export function stopHeartbeat() {
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
  isTicking = false;
}

async function executeTaskTick({ task, storage, runPipeline, provider, adapters }) {
  const chat = task.chat_id ? storage.getChat(task.chat_id) : null;
  const platform = chat ? chat.platform : 'system';
  const targetChatId = chat ? chat.chat_id : null;

  // Siapkan context aman untuk eksekusi tool (seperti send_notification dan tasker)
  const context = {
    platform,
    targetChatId,
    chatId: task.chat_id,
    taskId: task.id,
    storage,
    adapters
  };

  const systemPrompt = "Lakukan sesuai instruksi, jika recurring maka tetap lakukan tanpa mengubah status aktif jadi false, jika polling maka ubah status dari aktif menjadi false jika selesai baik complete maupun error. Jika diinstruksikan untuk memberi notifikasi maka gunakan tool yang sesuai [send_notification] tapi hanya gunakan sesuai ketentuan (biasanya saat selesai atau saat error, bukan saat status quo).";
  
  // Format prompt sesuai rancangan: instruction + active + type
  const prompt = `${task.instruction}\n[Metadata: task_id=${task.id}, active=${task.active ? 'true' : 'false'}, type=${task.type}]`;

  // Eksekusi pipeline (AI mengevaluasi kondisi menggunakan tool yang ada)
  await runPipeline({
    platform,
    chatId: targetChatId,
    prompt,
    systemPrompt,
    deciderModel: provider,
    toolModel: provider,
    context
  });

  // 2. Periksa status 'active' terbaru di basis data
  // (karena AI bisa saja memanggil tasker.update untuk mengubah active menjadi false)
  const updatedTask = storage.getTask(task.id);
  if (updatedTask && updatedTask.active === 1) {
    // Jika masih aktif, majukan jadwal berikutnya: trigger_at = now + delay
    const nextTriggerAt = new Date(Date.now() + updatedTask.delay * 1000).toISOString();
    storage.updateTaskTrigger(task.id, nextTriggerAt);
  }
}
```

---

## 4. Lapisan Akses Data (`aichan/main/storage/database.js`)

Fungsi-fungsi repository untuk mendukung operasi tabel `tasks`:

```javascript
// 1. Membuat task baru
export function createTask({ chatId, instruction, type, triggerAt, delay, active = 1 }) {
  const db = requireDatabase();
  const result = db.prepare(`
    INSERT INTO tasks (chat_id, instruction, type, trigger_at, delay, active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(chatId || null, instruction, type, triggerAt, delay, active ? 1 : 0);
  return getTask(result.lastInsertRowid);
}

// 2. Mengambil detail satu task
export function getTask(id) {
  const db = requireDatabase();
  return db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id);
}

// 3. Mengambil task aktif yang jatuh tempo
export function getActiveDueTasks(nowIso = new Date().toISOString()) {
  const db = requireDatabase();
  return db.prepare(`
    SELECT * FROM tasks
    WHERE active = 1 AND trigger_at <= ?
    ORDER BY trigger_at ASC
  `).all(nowIso);
}

// 4. Memperbarui trigger_at untuk siklus delay berikutnya
export function updateTaskTrigger(id, nextTriggerAtIso) {
  const db = requireDatabase();
  return db.prepare(`
    UPDATE tasks 
    SET trigger_at = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(nextTriggerAtIso, id).changes > 0;
}

// 5. Menampilkan task (khusus milik chat pemanggil)
export function listTasks({ chatId, activeOnly = true }) {
  const db = requireDatabase();
  let query = `SELECT * FROM tasks WHERE chat_id = ?`;
  const params = [chatId];
  if (activeOnly) {
    query += ` AND active = 1`;
  }
  query += ` ORDER BY trigger_at ASC`;
  return db.prepare(query).all(...params);
}

// 6. Mengubah task (misal mengubah active menjadi 0 / false)
export function updateTask(id, chatId, updates = {}) {
  const db = requireDatabase();
  const fields = [];
  const params = [];

  if (updates.active !== undefined) {
    fields.push('active = ?');
    params.push(updates.active ? 1 : 0);
  }
  if (updates.instruction !== undefined) {
    fields.push('instruction = ?');
    params.push(updates.instruction);
  }
  if (updates.delay !== undefined) {
    fields.push('delay = ?');
    params.push(Number(updates.delay));
  }
  if (updates.trigger_at !== undefined) {
    fields.push('trigger_at = ?');
    params.push(updates.trigger_at);
  }

  if (fields.length === 0) return false;
  fields.push('updated_at = CURRENT_TIMESTAMP');

  let query = `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`;
  params.push(id);

  // Jika chatId disediakan, kunci agar tidak bisa mengubah milik orang lain
  if (chatId) {
    query += ` AND chat_id = ?`;
    params.push(chatId);
  }

  return db.prepare(query).run(...params).changes > 0;
}

// 7. Menghapus task
export function deleteTask(id, chatId) {
  const db = requireDatabase();
  let query = `DELETE FROM tasks WHERE id = ?`;
  const params = [id];
  if (chatId) {
    query += ` AND chat_id = ?`;
    params.push(chatId);
  }
  return db.prepare(query).run(...params).changes > 0;
}
```

---

## 5. Tool AI: `tasker` (`aichan/main/tools/definitions/tasker.js`)

Tool tunggal yang mengekspos 4 aksi yang diminta (`show`, `create`, `update`, `delete`):

```javascript
export const taskerTool = {
  name: "tasker",
  description: "Pengelola tugas dan pengingat sistem (melihat, membuat, memperbarui status aktif/parameter, atau menghapus tugas).",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["show", "create", "update", "delete"],
        description: "Aksi pengelolan: 'show' untuk melihat daftar tugas, 'create' untuk tugas baru, 'update' untuk mengubah parameter/mematikan tugas, 'delete' untuk menghapus tugas."
      },
      instruction: {
        type: "string",
        description: "Deskripsi instruksi tugas (wajib untuk action 'create')."
      },
      type: {
        type: "string",
        enum: ["polling", "recurring"],
        description: "Tipe tugas: 'recurring' untuk tugas berulang abadi, 'polling' untuk tugas pemantauan berkala hingga selesai (wajib untuk action 'create')."
      },
      delay: {
        type: "integer",
        description: "Durasi jeda antar-eksekusi dalam detik (misal: 7200 untuk 2 jam, 60 untuk 1 menit)."
      },
      task_id: {
        type: "integer",
        description: "ID tugas yang ingin diperbarui atau dihapus (wajib untuk action 'update' dan 'delete')."
      },
      active: {
        type: "boolean",
        description: "Status keaktifan tugas (digunakan pada action 'update', misal set false saat polling selesai)."
      }
    },
    required: ["action"]
  },

  async execute(args, context) {
    const { storage, chatId, taskId } = context;
    if (!storage) throw new Error('tasker: context.storage tidak tersedia.');

    // Aksi 1: SHOW (Melihat daftar tugas aktif untuk chat ini)
    if (args.action === 'show') {
      if (!chatId) throw new Error('tasker: context.chatId diperlukan untuk melihat tugas.');
      const tasks = storage.listTasks({ chatId, activeOnly: true });
      return { success: true, action: 'show', tasks };
    }

    // Aksi 2: CREATE (Membuat tugas baru)
    if (args.action === 'create') {
      if (!args.instruction) throw new Error('tasker: instruction wajib diisi.');
      if (!args.type) throw new Error("tasker: type ('polling' atau 'recurring') wajib diisi.");
      const delay = Number(args.delay) || 60;
      const triggerAt = new Date(Date.now() + delay * 1000).toISOString();

      const task = storage.createTask({
        chatId: chatId || null,
        instruction: args.instruction,
        type: args.type,
        triggerAt,
        delay,
        active: 1
      });

      return {
        success: true,
        action: 'create',
        taskId: task.id,
        type: task.type,
        delay: task.delay,
        triggerAt: task.trigger_at
      };
    }

    // Aksi 3: UPDATE (Memperbarui parameter atau mematikan status active)
    if (args.action === 'update') {
      // Prioritaskan task_id dari argumen AI, atau gunakan context.taskId saat dieksekusi di heartbeat
      const targetId = args.task_id || taskId;
      if (!targetId) throw new Error('tasker: task_id wajib diisi untuk update.');

      const updates = {};
      if (args.active !== undefined) updates.active = args.active;
      if (args.instruction !== undefined) updates.instruction = args.instruction;
      if (args.delay !== undefined) updates.delay = args.delay;

      const updated = storage.updateTask(targetId, chatId || null, updates);
      if (!updated) {
        throw new Error(`tasker: Gagal memperbarui Task #${targetId}. Pastikan ID valid.`);
      }

      return { success: true, action: 'update', taskId: targetId, updates };
    }

    // Aksi 4: DELETE (Menghapus tugas)
    if (args.action === 'delete') {
      const targetId = args.task_id || taskId;
      if (!targetId) throw new Error('tasker: task_id wajib diisi untuk delete.');

      const deleted = storage.deleteTask(targetId, chatId || null);
      if (!deleted) {
        throw new Error(`tasker: Gagal menghapus Task #${targetId}.`);
      }

      return { success: true, action: 'delete', taskId: targetId };
    }

    throw new Error(`tasker: Action '${args.action}' tidak dikenali.`);
  }
};
```

---

## 6. Pemetaan Berkas & Integrasi Modul

### A. Berkas Baru:
1. **`aichan/main/heartbeat.js`**:
   - Berisi fungsi `startHeartbeat({ storage, runPipeline, provider, adapters, intervalMs })` dan `stopHeartbeat()`.
2. **`aichan/main/tools/definitions/tasker.js`**:
   - Berisi definisi `taskerTool` lengkap dengan aksi `show`, `create`, `update`, `delete`.

### B. Berkas yang Dimodifikasi:
1. **`aichan/main/storage/schema.sql`**:
   - Menambahkan DDL tabel `tasks` dan indeks `idx_tasks_active_due`.
2. **`aichan/main/storage/database.js`**:
   - Menambahkan fungsi: `createTask`, `getTask`, `getActiveDueTasks`, `updateTaskTrigger`, `listTasks`, `updateTask`, `deleteTask`.
3. **`aichan/main/tools/index.js`**:
   - Mengimpor `taskerTool` dan mendaftarkannya via `registerTool(taskerTool)`.
4. **`aichan/main/index.js`**:
   - Mengekspor fungsi repository tasks dan fungsi lifecycle `startHeartbeat`/`stopHeartbeat`.
5. **`aichan/index.js` (Root Startup)**:
   - Memanggil `main.startHeartbeat(...)` dengan menyuntikkan `provider: aistudio` dan `adapters: { telegram }`.

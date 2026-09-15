export const taskerTool = {
  name: "tasker",
  description: "Pengelola tugas dan pengingat sistem (melihat, membuat, memperbarui status aktif/parameter, atau menghapus tugas).",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["show", "create", "update", "delete"],
        description: "Aksi pengelolaan: 'show' untuk melihat daftar tugas, 'create' untuk tugas baru, 'update' untuk mengubah parameter/mematikan tugas, 'delete' untuk menghapus tugas."
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

  async execute(args, context = {}) {
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

export default taskerTool;

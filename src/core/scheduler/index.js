export class Scheduler {
  constructor({ database, runPipeline, getProvider, getAdapters, intervalMs = 15000 }) {
    this.database = database;
    this.runPipeline = runPipeline;
    this.getProvider = getProvider;
    this.getAdapters = getAdapters;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.isTicking = false;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      await this.tick();
    }, this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isTicking = false;
  }

  status() {
    return {
      running: !!this.timer,
      intervalMs: this.intervalMs,
      isTicking: this.isTicking
    };
  }

  async tick() {
    if (this.isTicking) return;
    this.isTicking = true;

    try {
      const dueTasks = this.database.getActiveDueTasks();
      for (const task of dueTasks) {
        await this.executeTaskTick(task);
      }
    } catch (err) {
      console.error('[scheduler] Error in tick execution:', err.message);
    } finally {
      this.isTicking = false;
    }
  }

  async executeTaskTick(task) {
    const chat = task.chat_id ? this.database.getChat(task.chat_id) : null;
    const platform = chat ? chat.platform : 'system';
    const targetChatId = chat ? chat.chat_id : null;
    const adapters = typeof this.getAdapters === 'function' ? this.getAdapters() : (this.getAdapters || {});
    const provider = typeof this.getProvider === 'function' ? this.getProvider() : this.getProvider;

    const context = {
      platform,
      targetChatId,
      chatId: task.chat_id,
      taskId: task.id,
      storage: this.database,
      adapters
    };

    const systemPrompt = "Lakukan sesuai instruksi, jika recurring maka tetap lakukan tanpa mengubah status aktif jadi false, jika polling maka ubah status dari aktif menjadi false jika selesai baik complete maupun error. Jika diinstruksikan untuk memberi notifikasi maka gunakan tool yang sesuai [send_notification] tapi hanya gunakan sesuai ketentuan (biasanya saat selesai atau saat error, bukan saat status quo).";
    const prompt = `${task.instruction}\n[Metadata: task_id=${task.id}, active=${task.active ? 'true' : 'false'}, type=${task.type}]`;

    await this.runPipeline({
      platform,
      chatId: targetChatId,
      prompt,
      systemPrompt,
      deciderModel: provider,
      toolModel: provider,
      context,
      database: this.database,
      callback: async (msg) => {
        if (targetChatId && adapters[platform] && typeof adapters[platform].sendMessage === 'function') {
          await adapters[platform].sendMessage(targetChatId, msg.text);
        }
      }
    });

    const updatedTask = this.database.getTask(task.id);
    if (updatedTask && updatedTask.active === 1) {
      const nextTriggerAt = new Date(Date.now() + updatedTask.delay * 1000).toISOString();
      this.database.updateTaskTrigger(task.id, nextTriggerAt);
    }
  }
}

export default Scheduler;

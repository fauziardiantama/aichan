let intervalTimer = null;
let isTicking = false;

export function startHeartbeat({ storage, runPipeline, provider, adapters = {}, intervalMs = 15000 }) {
  if (intervalTimer) return;

  intervalTimer = setInterval(async () => {
    if (isTicking) return;
    isTicking = true;

    try {
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

  const context = {
    platform,
    targetChatId,
    chatId: task.chat_id,
    taskId: task.id,
    storage,
    adapters
  };

  const systemPrompt = "Lakukan sesuai instruksi, jika recurring maka tetap lakukan tanpa mengubah status aktif jadi false, jika polling maka ubah status dari aktif menjadi false jika selesai baik complete maupun error. Jika diinstruksikan untuk memberi notifikasi maka gunakan tool yang sesuai [send_notification] tapi hanya gunakan sesuai ketentuan (biasanya saat selesai atau saat error, bukan saat status quo).";
  
  const prompt = `${task.instruction}\n[Metadata: task_id=${task.id}, active=${task.active ? 'true' : 'false'}, type=${task.type}]`;

  await runPipeline({
    platform,
    chatId: targetChatId,
    prompt,
    systemPrompt,
    deciderModel: provider,
    toolModel: provider,
    context
  });

  const updatedTask = storage.getTask(task.id);
  if (updatedTask && updatedTask.active === 1) {
    const nextTriggerAt = new Date(Date.now() + updatedTask.delay * 1000).toISOString();
    storage.updateTaskTrigger(task.id, nextTriggerAt);
  }
}

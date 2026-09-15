export const notifyTool = {
  name: "send_notification",
  description: "Mengirimkan pesan notifikasi ke pengguna saat ini.",
  parameters: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "Teks pesan notifikasi."
      }
    },
    required: ["message"]
  },
  async execute(args, context = {}) {
    if (!context.adapters || !context.adapters[context.platform]) {
      throw new Error(`send_notification: Adapter untuk platform '${context.platform}' tidak tersedia.`);
    }
    const adapter = context.adapters[context.platform];
    if (typeof adapter.sendMessage !== 'function') {
      throw new Error(`send_notification: Adapter '${context.platform}' tidak menyediakan method sendMessage.`);
    }
    await adapter.sendMessage(context.targetChatId, args.message);

    return {
      delivered: true,
      platform: context.platform,
      targetChatId: context.targetChatId,
      text: args.message,
      timestamp: Date.now()
    };
  }
};

export default notifyTool;

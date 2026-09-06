// [PLACEHOLDER / REPLACABLE]
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
  async execute(args, context) {
    const adapter = context.adapters[context.platform];
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

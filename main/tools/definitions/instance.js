// [PLACEHOLDER / REPLACABLE]
export const instanceTool = {
  name: "manage_instance",
  description: "Menyalakan atau mematikan service instance latar belakang (misal: client Minecraft, bot Discord).",
  parameters: {
    type: "object",
    properties: {
      service: {
        type: "string",
        description: "Nama service yang akan dikelola."
      },
      action: {
        type: "string",
        enum: ["start", "stop"],
        description: "Aksi yang diinginkan: start atau stop."
      }
    },
    required: ["service", "action"]
  },
  async execute(args, context) {
    const serviceAdapter = context.adapters[args.service];
    if (args.action === "start") {
      await serviceAdapter.start();
    } else {
      await serviceAdapter.stop();
    }

    return {
      service: args.service,
      action: args.action,
      status: args.action === "start" ? "running" : "stopped"
    };
  }
};

export default instanceTool;

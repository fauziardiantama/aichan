export const timeTool = {
  name: "get_current_time",
  description: "Mendapatkan waktu sistem saat ini.",
  parameters: {
    type: "object",
    properties: {}
  },
  async execute() {
    return { timestamp: new Date().toISOString() };
  }
};

export default timeTool;

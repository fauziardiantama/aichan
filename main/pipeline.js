import { listToolSchemas, executeTool } from './tools/index.js';
import {
  upsertChat,
  getChatMessages,
  addMessage,
  getSystemPrompt
} from './storage/database.js';

const deciderSchema = {
  type: "object",
  properties: {
    need_tool: { 
      type: "boolean",
      description: "True jika permintaan butuh tool. False jika bisa dijawab langsung."
    },
    response_text: { 
      type: ["string", "null"],
      description: "Teks jawaban langsung (jika need_tool=false) atau tanggapan/penalaran awal (jika need_tool=true)."
    }
  },
  required: ["need_tool"]
};

export async function runPipeline({
  prompt,
  history,
  deciderModel,
  toolModel,
  model,
  systemPrompt = null,
  platform,
  chatId,
  promptCodename,
  context = {}
}) {
  let chat = null;
  let currentMessages = history;
  let activeSystemPrompt = systemPrompt;

  if (chatId && platform) {
    chat = upsertChat({ chatId, platform, promptCodename });
    if (!currentMessages) {
      currentMessages = getChatMessages(chat.id);
    }
    addMessage({ chatKey: chat.id, role: 'user', content: prompt });
    if (!activeSystemPrompt) {
      const activeCodename = promptCodename || chat.prompt_codename;
      if (activeCodename) {
        const foundPrompt = getSystemPrompt(activeCodename);
        activeSystemPrompt = foundPrompt?.content || null;
      }
    }
  }

  currentMessages = currentMessages || [];
  const tools = listToolSchemas();

  // --- STAGE 1: Model Dasar (structured_outputs) ---
  const deciderSystemPrompt = activeSystemPrompt
    ? `${activeSystemPrompt}\n\nDaftar tool yang tersedia: ${JSON.stringify(tools.map(t => t.name))}. Tentukan apakah butuh tool untuk menjawab user.`
    : `Daftar tool yang tersedia: ${JSON.stringify(tools.map(t => t.name))}. Tentukan apakah butuh tool untuk menjawab user.`;

  const decision = await deciderModel.generateStructured({
    prompt,
    model,
    history: currentMessages,
    schema: deciderSchema,
    systemPrompt: deciderSystemPrompt
  });

  // Jika tidak butuh tool, langsung kembalikan jawaban
  if (!decision.need_tool) {
    if (chat) {
      addMessage({
        chatKey: chat.id,
        role: 'assistant',
        content: decision.response_text,
        model,
        promptCodename: promptCodename || chat.prompt_codename || null
      });
    }
    return { text: decision.response_text, chatId: chat?.chat_id || null };
  }

  // --- STAGE 2: Eskalasi ke Model Tools (tools: true) ---
  let stage2SystemPrompt = activeSystemPrompt || 'Instruksi: Selesaikan permintaan pengguna menggunakan tools yang tersedia.';
  if (decision.response_text) {
    stage2SystemPrompt += `\n\nCatatan evaluasi awal: ${decision.response_text}`;
  }

  let toolMessages = [
    ...currentMessages,
    { role: 'user', content: prompt }
  ];

  const maxLoops = 5;
  for (let i = 0; i < maxLoops; i++) {
    const response = await toolModel.generateWithNativeTools({
      model,
      systemPrompt: stage2SystemPrompt,
      messages: toolMessages,
      tools
    });

    if (response.isFinal) {
      if (chat) {
        addMessage({
          chatKey: chat.id,
          role: 'assistant',
          content: response.text,
          model,
          promptCodename: promptCodename || chat.prompt_codename || null
        });
      }
      return { text: response.text, chatId: chat?.chat_id || null };
    }

    toolMessages.push({
      role: 'assistant',
      toolCalls: response.toolCalls
    });

    for (const call of response.toolCalls) {
      const toolOutput = await executeTool(call.name, call.arguments, context);

      toolMessages.push({
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: JSON.stringify(toolOutput)
      });
    }
  }

  const finalLimitText = "Batas iterasi tool tercapai.";
  if (chat) {
    addMessage({
      chatKey: chat.id,
      role: 'assistant',
      content: finalLimitText,
      model,
      promptCodename: promptCodename || chat.prompt_codename || null
    });
  }
  return { text: finalLimitText, chatId: chat?.chat_id || null };
}

export default {
  runPipeline
};

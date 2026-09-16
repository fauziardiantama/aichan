import { listToolSchemas, executeTool } from '../tools/index.js';

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
  context = {},
  database = null
}) {
  const db = database || context.storage;
  let chat = null;
  let currentMessages = history;
  let activeSystemPrompt = systemPrompt;

  if (chatId && platform && db) {
    chat = db.upsertChat({ chatId, platform, promptCodename });
    if (!currentMessages) {
      currentMessages = db.getChatMessages(chat.id);
    }
    db.addMessage({ chatKey: chat.id, role: 'user', content: prompt });
    if (!activeSystemPrompt) {
      const activeCodename = promptCodename || chat.prompt_codename;
      if (activeCodename) {
        const foundPrompt = db.getSystemPrompt(activeCodename);
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

  console.log('\n[DEBUG STAGE 1 - PAYLOAD]:', JSON.stringify({
    prompt,
    model,
    history: currentMessages,
    systemPrompt: deciderSystemPrompt
  }, null, 2));

  let decision;
  try {
    decision = await deciderModel.generateStructured({
      prompt,
      model,
      history: currentMessages,
      schema: deciderSchema,
      systemPrompt: deciderSystemPrompt
    });
    console.log('\n[DEBUG STAGE 1 - SUCCESS RESPONSE]:', JSON.stringify(decision, null, 2));
  } catch (err) {
    console.error('\n[DEBUG STAGE 1 - ERROR RESPONSE]:', err);
    throw err;
  }

  // Simpan hasil Stage 1 ke DB
  if (chat && db) {
    db.addMessage({
      chatKey: chat.id,
      role: 'assistant',
      content: JSON.stringify(decision),
      model,
      promptCodename: promptCodename || chat.prompt_codename || null
    });
  }

  // Jika tidak butuh tool, langsung kembalikan jawaban
  if (!decision.need_tool) {
    return { text: decision.response_text, chatId: chat?.chat_id || null };
  }

  // --- STAGE 2: Eskalasi ke Model Tools (tools: true) ---

  let stage2SystemPrompt = activeSystemPrompt || 'Instruksi: Selesaikan permintaan pengguna menggunakan tools yang tersedia.';
  if (decision.response_text) {
    stage2SystemPrompt += `\n\nCatatan evaluasi awal: ${decision.response_text}`;
  }

  let toolMessages = [
    ...currentMessages,
    { role: 'user', content: prompt },
    { role: 'assistant', content: JSON.stringify(decision) },
    { role: 'user', content: '' }
  ];

  if (chat && db) {
    db.addMessage({
      chatKey: chat.id,
      role: 'user',
      content: ''
    });
  }

  const maxLoops = 5;
  for (let i = 0; i < maxLoops; i++) {
    console.log(`\n[DEBUG STAGE 2 (LOOP ${i}) - PAYLOAD]:`, JSON.stringify({
      model,
      systemPrompt: stage2SystemPrompt,
      messages: toolMessages,
      tools: tools.map(t => t.name)
    }, null, 2));

    let response;
    try {
      response = await toolModel.generateWithNativeTools({
        model,
        systemPrompt: stage2SystemPrompt,
        messages: toolMessages,
        tools
      });
      console.log(`\n[DEBUG STAGE 2 (LOOP ${i}) - SUCCESS RESPONSE]:`, JSON.stringify(response, null, 2));
    } catch (err) {
      console.error(`\n[DEBUG STAGE 2 (LOOP ${i}) - ERROR RESPONSE]:`, err);
      throw err;
    }

    if (response.isFinal) {
      if (chat && db) {
        db.addMessage({
          chatKey: chat.id,
          role: 'assistant',
          content: response.text,
          model,
          promptCodename: promptCodename || chat.prompt_codename || null
        });
      }
      return { text: response.text, chatId: chat?.chat_id || null };
    }

    let parentAssistantId = null;
    for (let j = 0; j < response.toolCalls.length; j++) {
      const call = response.toolCalls[j];
      const toolName = call.name;
      const callId = call.id || null;
      const argsStr = JSON.stringify(call.arguments || {});

      let savedMessage = null;
      if (chat && db) {
        savedMessage = db.addMessage({
          chatKey: chat.id,
          role: 'assistant',
          content: argsStr,
          tool: toolName,
          callId,
          linkedMessageId: parentAssistantId,
          model,
          promptCodename: promptCodename || chat.prompt_codename || null
        });
        if (j === 0 && savedMessage) {
          parentAssistantId = savedMessage.id;
        }
      }

      toolMessages.push({
        role: 'assistant',
        content: argsStr,
        tool: toolName,
        call_id: callId,
        linked_message_id: parentAssistantId
      });
    }

    let parentToolId = null;
    for (let j = 0; j < response.toolCalls.length; j++) {
      const call = response.toolCalls[j];
      const toolOutput = await executeTool(call.name, call.arguments, context);
      const outputStr = JSON.stringify(toolOutput);
      const toolName = call.name;
      const callId = call.id || null;

      let savedMessage = null;
      if (chat && db) {
        savedMessage = db.addMessage({
          chatKey: chat.id,
          role: 'tool',
          content: outputStr,
          tool: toolName,
          callId,
          linkedMessageId: parentToolId,
          model,
          promptCodename: promptCodename || chat.prompt_codename || null
        });
        if (j === 0 && savedMessage) {
          parentToolId = savedMessage.id;
        }
      }

      toolMessages.push({
        role: 'tool',
        content: outputStr,
        tool: toolName,
        call_id: callId,
        linked_message_id: parentToolId
      });
    }
  }

  const finalLimitText = "Batas iterasi tool tercapai.";
  if (chat && db) {
    db.addMessage({
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

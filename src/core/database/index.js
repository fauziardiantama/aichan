import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSchemaPath = path.join(moduleDir, 'schema.sql');

export class DatabaseManager {
  constructor(dbPath = './data/aichan.db', schemaPath = defaultSchemaPath) {
    this.databasePath = path.resolve(dbPath);
    this.schemaPath = path.resolve(schemaPath);
    this.db = null;
    this.init();
  }

  init() {
    if (this.db) return this.db;

    fs.mkdirSync(path.dirname(this.databasePath), { recursive: true });
    this.db = new Database(this.databasePath);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');

    const schemaSql = fs.readFileSync(this.schemaPath, 'utf8');
    this.db.exec(schemaSql);

    this.db.prepare(`
      INSERT OR IGNORE INTO system_prompts (codename, content, description)
      VALUES (?, ?, ?)
    `).run('default_assistant', 'You are Ai-Chan, a helpful AI assistant.', 'Default system prompt');

    return this.db;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  getPath() {
    return this.databasePath;
  }

  requireDb() {
    if (!this.db) {
      this.init();
    }
    return this.db;
  }

  touchChat(chatKey) {
    this.requireDb().prepare(`
      UPDATE chats
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(chatKey);
  }

  // --- Chats & Messages ---
  upsertChat({ chatId, platform = 'web', title = null, promptCodename = null }) {
    if (!chatId) throw new Error('chatId is required.');
    const db = this.requireDb();
    const prompt = promptCodename ? this.getSystemPrompt(promptCodename) : this.getSystemPrompt('default_assistant');
    if (promptCodename && !prompt) throw new Error(`System prompt '${promptCodename}' not found.`);
    const existing = db.prepare('SELECT id FROM chats WHERE platform = ? AND chat_id = ?').get(platform, String(chatId));

    if (existing) {
      db.prepare(`
        UPDATE chats
        SET title = COALESCE(?, title), prompt_id = COALESCE(?, prompt_id), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(title, prompt?.id || null, existing.id);
      return this.getChat(existing.id);
    }

    const result = db.prepare(`
      INSERT INTO chats (chat_id, platform, prompt_id, title)
      VALUES (?, ?, ?, ?)
    `).run(String(chatId), platform, prompt?.id || null, title);
    return this.getChat(result.lastInsertRowid);
  }

  getChat(id) {
    return this.requireDb().prepare(`
      SELECT chats.*, system_prompts.codename AS prompt_codename
      FROM chats
      LEFT JOIN system_prompts ON system_prompts.id = chats.prompt_id
      WHERE chats.id = ?
    `).get(id);
  }

  listChats({ search = '', limit = 50, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const term = `%${search}%`;
    const db = this.requireDb();
    const chats = db.prepare(`
      SELECT chats.*, system_prompts.codename AS prompt_codename,
        (SELECT COUNT(*) FROM messages WHERE messages.chat_id = chats.id) AS message_count
      FROM chats
      LEFT JOIN system_prompts ON system_prompts.id = chats.prompt_id
      WHERE chats.chat_id LIKE ? OR chats.platform LIKE ? OR COALESCE(chats.title, '') LIKE ?
      ORDER BY chats.updated_at DESC, chats.id DESC
      LIMIT ? OFFSET ?
    `).all(term, term, term, safeLimit, safeOffset);
    const total = db.prepare(`
      SELECT COUNT(*) AS count FROM chats
      WHERE chat_id LIKE ? OR platform LIKE ? OR COALESCE(title, '') LIKE ?
    `).get(term, term, term).count;
    return { chats, total, limit: safeLimit, offset: safeOffset };
  }

  getChatMessages(chatId, { limit = 100, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const db = this.requireDb();
    const rows = db.prepare(`
      SELECT * FROM messages
      WHERE chat_id = ?
      ORDER BY created_at ASC, id ASC
      LIMIT ? OFFSET ?
    `).all(chatId, safeLimit, safeOffset);

    return rows.map(row => ({
      id: row.id,
      chat_id: row.chat_id,
      role: row.role,
      content: row.content,
      tool: row.tool,
      call_id: row.call_id,
      linked_message_id: row.linked_message_id,
      model: row.model,
      prompt_codename: row.prompt_codename,
      created_at: row.created_at
    }));
  }

  addMessage({ chatKey, role, content = null, tool = null, callId = null, linkedMessageId = null, model = null, promptCodename = null }) {
    if (!chatKey || !['user', 'assistant', 'system', 'tool'].includes(role)) {
      throw new Error('chatKey and valid role are required.');
    }
    if (role !== 'assistant' && (content === null || content === undefined)) {
      throw new Error('content is required for user, system, and tool roles.');
    }
    if (role === 'assistant' && (content === null || content === undefined) && !tool) {
      return null;
    }

    const db = this.requireDb();
    const result = db.prepare(`
      INSERT INTO messages (chat_id, role, content, tool, call_id, linked_message_id, model, prompt_codename)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(chatKey, role, content !== null ? String(content) : null, tool, callId, linkedMessageId, model, promptCodename);
    this.touchChat(chatKey);
    return db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
  }

  deleteChat(id) {
    return this.requireDb().prepare('DELETE FROM chats WHERE id = ?').run(id).changes > 0;
  }

  // --- System Prompts ---
  listSystemPrompts({ includeInactive = true } = {}) {
    const query = includeInactive ? 'SELECT * FROM system_prompts ORDER BY codename' : 'SELECT * FROM system_prompts WHERE is_active = 1 ORDER BY codename';
    return this.requireDb().prepare(query).all();
  }

  getSystemPrompt(codename) {
    return this.requireDb().prepare('SELECT * FROM system_prompts WHERE codename = ?').get(codename);
  }

  saveSystemPrompt({ id = null, codename, content, description = null, isActive = true }) {
    if (!codename || !content) throw new Error('codename and content are required.');
    const db = this.requireDb();
    if (id) {
      db.prepare(`
        UPDATE system_prompts
        SET codename = ?, content = ?, description = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(codename, content, description, isActive ? 1 : 0, id);
      return db.prepare('SELECT * FROM system_prompts WHERE id = ?').get(id);
    }
    const result = db.prepare(`
      INSERT INTO system_prompts (codename, content, description, is_active)
      VALUES (?, ?, ?, ?)
    `).run(codename, content, description, isActive ? 1 : 0);
    return db.prepare('SELECT * FROM system_prompts WHERE id = ?').get(result.lastInsertRowid);
  }

  deleteSystemPrompt(id) {
    return this.requireDb().prepare('DELETE FROM system_prompts WHERE id = ?').run(id).changes > 0;
  }

  // --- Providers & Models ---
  listProviders() {
    return this.requireDb().prepare('SELECT * FROM providers ORDER BY provider_key').all();
  }

  saveProvider({ providerKey, displayName }) {
    if (!providerKey || !displayName) throw new Error('providerKey and displayName are required.');
    const db = this.requireDb();
    db.prepare(`
      INSERT INTO providers (provider_key, display_name)
      VALUES (?, ?)
      ON CONFLICT(provider_key) DO UPDATE SET display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP
    `).run(providerKey, displayName);
    return db.prepare('SELECT * FROM providers WHERE provider_key = ?').get(providerKey);
  }

  deleteProvider(providerKey) {
    return this.requireDb().prepare('DELETE FROM providers WHERE provider_key = ?').run(providerKey).changes > 0;
  }

  listModels({ providerKey = null } = {}) {
    const query = providerKey
      ? `SELECT models.*, providers.provider_key, providers.display_name AS provider_display_name
         FROM models JOIN providers ON providers.id = models.provider_id
         WHERE providers.provider_key = ? ORDER BY models.display_name`
      : `SELECT models.*, providers.provider_key, providers.display_name AS provider_display_name
         FROM models JOIN providers ON providers.id = models.provider_id
         ORDER BY providers.provider_key, models.display_name`;
    return providerKey ? this.requireDb().prepare(query).all(providerKey) : this.requireDb().prepare(query).all();
  }

  saveModel({ providerKey, modelKey, displayName }) {
    if (!providerKey || !modelKey || !displayName) throw new Error('providerKey, modelKey, and displayName are required.');
    const provider = this.saveProvider({ providerKey, displayName: providerKey });
    const db = this.requireDb();
    db.prepare(`
      INSERT INTO models (provider_id, model_key, display_name)
      VALUES (?, ?, ?)
      ON CONFLICT(provider_id, model_key) DO UPDATE SET display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP
    `).run(provider.id, modelKey, displayName);
    return db.prepare('SELECT * FROM models WHERE provider_id = ? AND model_key = ?').get(provider.id, modelKey);
  }

  getModelCapabilities(providerKey, modelKey) {
    return this.requireDb().prepare(`
      SELECT model_capabilities.*, providers.provider_key, models.model_key, models.display_name
      FROM model_capabilities
      JOIN models ON models.id = model_capabilities.model_id
      JOIN providers ON providers.id = models.provider_id
      WHERE providers.provider_key = ? AND models.model_key = ?
    `).get(providerKey, modelKey) || null;
  }

  saveModelCapabilities({
    providerKey,
    modelKey,
    displayName,
    reasoning = false,
    tools = false,
    structuredOutputs = false,
    textInput = false,
    documentInput = false,
    imageInput = false,
    videoInput = false,
    audioInput = false,
    textOutput = false,
    documentOutput = false,
    imageOutput = false,
    videoOutput = false,
    audioOutput = false,
    notes = null
  }) {
    if (!providerKey || !modelKey || !displayName) throw new Error('providerKey, modelKey, and displayName are required.');

    const db = this.requireDb();
    const model = this.saveModel({ providerKey, modelKey, displayName });
    db.prepare(`
      INSERT INTO model_capabilities (
        model_id, reasoning, tools, structured_outputs, text_input, document_input, image_input, video_input,
        audio_input, text_output, document_output, image_output, video_output,
        audio_output, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(model_id) DO UPDATE SET
        reasoning = excluded.reasoning,
        tools = excluded.tools,
        structured_outputs = excluded.structured_outputs,
        text_input = excluded.text_input,
        document_input = excluded.document_input,
        image_input = excluded.image_input,
        video_input = excluded.video_input,
        audio_input = excluded.audio_input,
        text_output = excluded.text_output,
        document_output = excluded.document_output,
        image_output = excluded.image_output,
        video_output = excluded.video_output,
        audio_output = excluded.audio_output,
        notes = excluded.notes,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      model.id,
      reasoning ? 1 : 0,
      tools ? 1 : 0,
      structuredOutputs ? 1 : 0,
      textInput ? 1 : 0,
      documentInput ? 1 : 0,
      imageInput ? 1 : 0,
      videoInput ? 1 : 0,
      audioInput ? 1 : 0,
      textOutput ? 1 : 0,
      documentOutput ? 1 : 0,
      imageOutput ? 1 : 0,
      videoOutput ? 1 : 0,
      audioOutput ? 1 : 0,
      notes
    );
    return this.getModelCapabilities(providerKey, modelKey);
  }

  listAllModelCapabilities() {
    return this.requireDb().prepare(`
      SELECT model_capabilities.*, providers.provider_key, models.model_key, models.display_name
      FROM model_capabilities
      JOIN models ON models.id = model_capabilities.model_id
      JOIN providers ON providers.id = models.provider_id
      ORDER BY providers.provider_key, models.display_name
    `).all();
  }

  deleteModelCapabilities(providerKey, modelKey) {
    const model = this.requireDb().prepare(`
      SELECT models.id FROM models
      JOIN providers ON providers.id = models.provider_id
      WHERE providers.provider_key = ? AND models.model_key = ?
    `).get(providerKey, modelKey);
    return model
      ? this.requireDb().prepare('DELETE FROM models WHERE id = ?').run(model.id).changes > 0
      : false;
  }

  // --- Tasks (Heartbeat / Tasker) ---
  createTask({ chatId = null, instruction, type, triggerAt, delay, active = 1 }) {
    if (!instruction) throw new Error('tasks: instruction is required.');
    if (!type) throw new Error("tasks: type is required ('polling' or 'recurring').");
    if (!triggerAt) throw new Error('tasks: triggerAt is required.');
    if (delay === undefined || delay === null) throw new Error('tasks: delay is required.');

    const db = this.requireDb();
    const result = db.prepare(`
      INSERT INTO tasks (chat_id, instruction, type, trigger_at, delay, active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(chatId || null, instruction, type, triggerAt, Number(delay), active ? 1 : 0);

    return this.getTask(result.lastInsertRowid);
  }

  getTask(id) {
    const db = this.requireDb();
    return db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id);
  }

  getActiveDueTasks(nowIso = new Date().toISOString()) {
    const db = this.requireDb();
    return db.prepare(`
      SELECT * FROM tasks
      WHERE active = 1 AND trigger_at <= ?
      ORDER BY trigger_at ASC
    `).all(nowIso);
  }

  updateTaskTrigger(id, nextTriggerAtIso) {
    if (!id || !nextTriggerAtIso) throw new Error('tasks: id and nextTriggerAtIso are required.');
    const db = this.requireDb();
    return db.prepare(`
      UPDATE tasks 
      SET trigger_at = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(nextTriggerAtIso, id).changes > 0;
  }

  listTasks({ chatId, activeOnly = true }) {
    if (!chatId) throw new Error('tasks: chatId is required for listTasks.');
    const db = this.requireDb();
    let query = `SELECT * FROM tasks WHERE chat_id = ?`;
    const params = [chatId];
    if (activeOnly) {
      query += ` AND active = 1`;
    }
    query += ` ORDER BY trigger_at ASC`;
    return db.prepare(query).all(...params);
  }

  updateTask(id, chatId = null, updates = {}) {
    if (!id) throw new Error('tasks: id is required for updateTask.');
    const db = this.requireDb();
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

    if (chatId) {
      query += ` AND chat_id = ?`;
      params.push(chatId);
    }

    return db.prepare(query).run(...params).changes > 0;
  }

  deleteTask(id, chatId = null) {
    if (!id) throw new Error('tasks: id is required for deleteTask.');
    const db = this.requireDb();
    let query = `DELETE FROM tasks WHERE id = ?`;
    const params = [id];
    if (chatId) {
      query += ` AND chat_id = ?`;
      params.push(chatId);
    }
    return db.prepare(query).run(...params).changes > 0;
  }
}

export default DatabaseManager;

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(moduleDir, '..', '..', 'data');
const databasePath = path.join(dataDir, 'aichan.db');
const schemaPath = path.join(moduleDir, 'schema.sql');

let database = null;

function requireDatabase() {
  if (!database) throw new Error('main: Database is not initialized.');
  return database;
}

function touchChat(chatKey) {
  requireDatabase().prepare(`
    UPDATE chats
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(chatKey);
}

export function initializeDatabase() {
  if (database) return database;

  fs.mkdirSync(dataDir, { recursive: true });
  database = new Database(databasePath);
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  migrateLegacyCapabilities();
  database.exec(fs.readFileSync(schemaPath, 'utf8'));

  database.prepare(`
    INSERT OR IGNORE INTO system_prompts (codename, content, description)
    VALUES (?, ?, ?)
  `).run('default_assistant', 'You are Ai-Chan, a helpful AI assistant.', 'Default system prompt');

  return database;
}

function migrateLegacyCapabilities() {
  const columns = database.pragma('table_info(model_capabilities)');
  if (!columns.some(column => column.name === 'provider')) return;

  database.exec('DROP INDEX IF EXISTS idx_model_capabilities_provider');
  database.exec('ALTER TABLE model_capabilities RENAME TO model_capabilities_legacy');
  database.exec(fs.readFileSync(schemaPath, 'utf8'));

  const legacyRecords = database.prepare('SELECT * FROM model_capabilities_legacy').all();
  const insertProvider = database.prepare(`
    INSERT INTO providers (provider_key, display_name)
    VALUES (?, ?)
    ON CONFLICT(provider_key) DO UPDATE SET display_name = excluded.display_name
  `);
  const getProvider = database.prepare('SELECT id FROM providers WHERE provider_key = ?');
  const insertModel = database.prepare(`
    INSERT INTO models (provider_id, model_key, display_name)
    VALUES (?, ?, ?)
    ON CONFLICT(provider_id, model_key) DO UPDATE SET display_name = excluded.display_name
  `);
  const getModel = database.prepare('SELECT id FROM models WHERE provider_id = ? AND model_key = ?');
  const insertCapabilities = database.prepare(`
    INSERT OR REPLACE INTO model_capabilities (
      model_id, reasoning, text_input, document_input, image_input, video_input,
      audio_input, text_output, document_output, image_output, video_output,
      audio_output, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const record of legacyRecords) {
    insertProvider.run(record.provider, record.provider);
    const providerId = getProvider.get(record.provider).id;
    insertModel.run(providerId, record.model_id, record.display_name || record.model_id);
    const modelId = getModel.get(providerId, record.model_id).id;
    const inputs = JSON.parse(record.input_modalities || '[]');
    const outputs = JSON.parse(record.output_modalities || '[]');
    insertCapabilities.run(
      modelId,
      record.reasoning ? 1 : 0,
      inputs.includes('text') ? 1 : 0,
      inputs.includes('file') ? 1 : 0,
      inputs.includes('image') ? 1 : 0,
      inputs.includes('video') ? 1 : 0,
      inputs.includes('audio') ? 1 : 0,
      outputs.includes('text') ? 1 : 0,
      outputs.includes('file') ? 1 : 0,
      outputs.includes('image') ? 1 : 0,
      outputs.includes('video') ? 1 : 0,
      outputs.includes('audio') ? 1 : 0,
      record.notes
    );
  }
  database.exec('DROP TABLE model_capabilities_legacy');
}

export function closeDatabase() {
  if (database) {
    database.close();
    database = null;
  }
}

export function getDatabasePath() {
  return databasePath;
}

export function upsertChat({ chatId, platform = 'web', title = null, promptCodename = null }) {
  if (!chatId) throw new Error('chatId is required.');
  const db = requireDatabase();
  const prompt = promptCodename ? getSystemPrompt(promptCodename) : getSystemPrompt('default_assistant');
  if (promptCodename && !prompt) throw new Error(`System prompt '${promptCodename}' not found.`);
  const existing = db.prepare('SELECT id FROM chats WHERE platform = ? AND chat_id = ?').get(platform, String(chatId));

  if (existing) {
    db.prepare(`
      UPDATE chats
      SET title = COALESCE(?, title), prompt_id = COALESCE(?, prompt_id), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(title, prompt?.id || null, existing.id);
    return getChat(existing.id);
  }

  const result = db.prepare(`
    INSERT INTO chats (chat_id, platform, prompt_id, title)
    VALUES (?, ?, ?, ?)
  `).run(String(chatId), platform, prompt?.id || null, title);
  return getChat(result.lastInsertRowid);
}

export function getChat(id) {
  return requireDatabase().prepare(`
    SELECT chats.*, system_prompts.codename AS prompt_codename
    FROM chats
    LEFT JOIN system_prompts ON system_prompts.id = chats.prompt_id
    WHERE chats.id = ?
  `).get(id);
}

export function listChats({ search = '', limit = 50, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const term = `%${search}%`;
  const db = requireDatabase();
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

export function getChatMessages(chatId, { limit = 100, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const db = requireDatabase();
  return db.prepare(`
    SELECT * FROM messages
    WHERE chat_id = ?
    ORDER BY created_at ASC, id ASC
    LIMIT ? OFFSET ?
  `).all(chatId, safeLimit, safeOffset);
}

export function addMessage({ chatKey, role, content, model = null, promptCodename = null }) {
  if (!chatKey || !['user', 'assistant', 'system'].includes(role) || !content) {
    throw new Error('chatKey, valid role, and content are required.');
  }
  const db = requireDatabase();
  const result = db.prepare(`
    INSERT INTO messages (chat_id, role, content, model, prompt_codename)
    VALUES (?, ?, ?, ?, ?)
  `).run(chatKey, role, String(content), model, promptCodename);
  touchChat(chatKey);
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
}

export function deleteChat(id) {
  return requireDatabase().prepare('DELETE FROM chats WHERE id = ?').run(id).changes > 0;
}

export function listSystemPrompts({ includeInactive = true } = {}) {
  const query = includeInactive ? 'SELECT * FROM system_prompts ORDER BY codename' : 'SELECT * FROM system_prompts WHERE is_active = 1 ORDER BY codename';
  return requireDatabase().prepare(query).all();
}

export function getSystemPrompt(codename) {
  return requireDatabase().prepare('SELECT * FROM system_prompts WHERE codename = ?').get(codename);
}

export function saveSystemPrompt({ id = null, codename, content, description = null, isActive = true }) {
  if (!codename || !content) throw new Error('codename and content are required.');
  const db = requireDatabase();
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

export function deleteSystemPrompt(id) {
  return requireDatabase().prepare('DELETE FROM system_prompts WHERE id = ?').run(id).changes > 0;
}

export function listProviders() {
  return requireDatabase().prepare('SELECT * FROM providers ORDER BY provider_key').all();
}

export function saveProvider({ providerKey, displayName }) {
  if (!providerKey || !displayName) throw new Error('providerKey and displayName are required.');
  const db = requireDatabase();
  db.prepare(`
    INSERT INTO providers (provider_key, display_name)
    VALUES (?, ?)
    ON CONFLICT(provider_key) DO UPDATE SET display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP
  `).run(providerKey, displayName);
  return db.prepare('SELECT * FROM providers WHERE provider_key = ?').get(providerKey);
}

export function listModels({ providerKey = null } = {}) {
  const query = providerKey
    ? `SELECT models.*, providers.provider_key, providers.display_name AS provider_display_name
       FROM models JOIN providers ON providers.id = models.provider_id
       WHERE providers.provider_key = ? ORDER BY models.display_name`
    : `SELECT models.*, providers.provider_key, providers.display_name AS provider_display_name
       FROM models JOIN providers ON providers.id = models.provider_id
       ORDER BY providers.provider_key, models.display_name`;
  return providerKey ? requireDatabase().prepare(query).all(providerKey) : requireDatabase().prepare(query).all();
}

export function saveModel({ providerKey, modelKey, displayName }) {
  if (!providerKey || !modelKey || !displayName) throw new Error('providerKey, modelKey, and displayName are required.');
  const provider = saveProvider({ providerKey, displayName: providerKey });
  const db = requireDatabase();
  db.prepare(`
    INSERT INTO models (provider_id, model_key, display_name)
    VALUES (?, ?, ?)
    ON CONFLICT(provider_id, model_key) DO UPDATE SET display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP
  `).run(provider.id, modelKey, displayName);
  return db.prepare('SELECT * FROM models WHERE provider_id = ? AND model_key = ?').get(provider.id, modelKey);
}

export function getModelCapabilities(providerKey, modelKey) {
  return requireDatabase().prepare(`
    SELECT model_capabilities.*, providers.provider_key, models.model_key, models.display_name
    FROM model_capabilities
    JOIN models ON models.id = model_capabilities.model_id
    JOIN providers ON providers.id = models.provider_id
    WHERE providers.provider_key = ? AND models.model_key = ?
  `).get(providerKey, modelKey) || null;
}

export function saveModelCapabilities({
  providerKey,
  modelKey,
  displayName,
  reasoning = false,
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

  const db = requireDatabase();
  const model = saveModel({ providerKey, modelKey, displayName });
  db.prepare(`
    INSERT INTO model_capabilities (
      model_id, reasoning, text_input, document_input, image_input, video_input,
      audio_input, text_output, document_output, image_output, video_output,
      audio_output, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(model_id) DO UPDATE SET
      reasoning = excluded.reasoning,
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
  return getModelCapabilities(providerKey, modelKey);
}

export function deleteModelCapabilities(providerKey, modelKey) {
  const model = requireDatabase().prepare(`
    SELECT models.id FROM models
    JOIN providers ON providers.id = models.provider_id
    WHERE providers.provider_key = ? AND models.model_key = ?
  `).get(providerKey, modelKey);
  return model
    ? requireDatabase().prepare('DELETE FROM model_capabilities WHERE model_id = ?').run(model.id).changes > 0
    : false;
}

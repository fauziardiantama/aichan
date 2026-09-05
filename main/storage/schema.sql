CREATE TABLE IF NOT EXISTS system_prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codename TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  prompt_id INTEGER,
  title TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (platform, chat_id),
  FOREIGN KEY (prompt_id) REFERENCES system_prompts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  model TEXT,
  prompt_codename TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL,
  model_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (provider_id, model_key),
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS model_capabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id INTEGER NOT NULL UNIQUE,
  reasoning INTEGER NOT NULL DEFAULT 0 CHECK (reasoning IN (0, 1)),
  tools INTEGER NOT NULL DEFAULT 0 CHECK (tools IN (0, 1)),
  structured_outputs INTEGER NOT NULL DEFAULT 0 CHECK (structured_outputs IN (0, 1)),
  text_input INTEGER NOT NULL DEFAULT 0 CHECK (text_input IN (0, 1)),
  document_input INTEGER NOT NULL DEFAULT 0 CHECK (document_input IN (0, 1)),
  image_input INTEGER NOT NULL DEFAULT 0 CHECK (image_input IN (0, 1)),
  video_input INTEGER NOT NULL DEFAULT 0 CHECK (video_input IN (0, 1)),
  audio_input INTEGER NOT NULL DEFAULT 0 CHECK (audio_input IN (0, 1)),
  text_output INTEGER NOT NULL DEFAULT 0 CHECK (text_output IN (0, 1)),
  document_output INTEGER NOT NULL DEFAULT 0 CHECK (document_output IN (0, 1)),
  image_output INTEGER NOT NULL DEFAULT 0 CHECK (image_output IN (0, 1)),
  video_output INTEGER NOT NULL DEFAULT 0 CHECK (video_output IN (0, 1)),
  audio_output INTEGER NOT NULL DEFAULT 0 CHECK (audio_output IN (0, 1)),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id_created_at ON messages(chat_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_models_provider_id ON models(provider_id);

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../../../data/huobao_drama.db')

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const sqlite = new Database(DB_PATH, { timeout: 30000 })
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('busy_timeout = 30000')

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS dramas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    genre TEXT,
    style TEXT DEFAULT 'realistic',
    total_episodes INTEGER DEFAULT 1,
    total_duration INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    thumbnail TEXT,
    tags TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER NOT NULL,
    episode_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    script_content TEXT,
    description TEXT,
    duration INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft',
    video_url TEXT,
    thumbnail TEXT,
    image_config_id INTEGER,
    video_config_id INTEGER,
    audio_config_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    description TEXT,
    appearance TEXT,
    personality TEXT,
    voice_style TEXT,
    image_url TEXT,
    reference_images TEXT,
    seed_value TEXT,
    sort_order INTEGER,
    local_path TEXT,
    voice_sample_url TEXT,
    voice_provider TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS scenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER NOT NULL,
    episode_id INTEGER,
    location TEXT NOT NULL,
    time TEXT NOT NULL,
    prompt TEXT NOT NULL,
    storyboard_count INTEGER DEFAULT 1,
    image_url TEXT,
    status TEXT DEFAULT 'pending',
    local_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS storyboards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    scene_id INTEGER,
    storyboard_number INTEGER NOT NULL,
    title TEXT,
    location TEXT,
    time TEXT,
    shot_type TEXT,
    angle TEXT,
    movement TEXT,
    action TEXT,
    result TEXT,
    atmosphere TEXT,
    image_prompt TEXT,
    video_prompt TEXT,
    bgm_prompt TEXT,
    sound_effect TEXT,
    dialogue TEXT,
    description TEXT,
    duration INTEGER DEFAULT 0,
    composed_image TEXT,
    first_frame_image TEXT,
    last_frame_image TEXT,
    reference_images TEXT,
    video_url TEXT,
    tts_audio_url TEXT,
    bgm_audio_url TEXT,
    bgm_generation_id INTEGER,
    subtitle_url TEXT,
    composed_video_url TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS episode_characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    character_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_episode_characters_episode_id
    ON episode_characters (episode_id);
  CREATE INDEX IF NOT EXISTS idx_episode_characters_character_id
    ON episode_characters (character_id);

  CREATE TABLE IF NOT EXISTS episode_scenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    scene_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_episode_scenes_episode_id
    ON episode_scenes (episode_id);
  CREATE INDEX IF NOT EXISTS idx_episode_scenes_scene_id
    ON episode_scenes (scene_id);

  CREATE TABLE IF NOT EXISTS storyboard_characters (
    storyboard_id INTEGER NOT NULL,
    character_id INTEGER NOT NULL,
    PRIMARY KEY (storyboard_id, character_id)
  );
  CREATE INDEX IF NOT EXISTS idx_storyboard_characters_storyboard_id
    ON storyboard_characters (storyboard_id);
  CREATE INDEX IF NOT EXISTS idx_storyboard_characters_character_id
    ON storyboard_characters (character_id);

  CREATE TABLE IF NOT EXISTS ai_service_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_type TEXT NOT NULL,
    provider TEXT,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    model TEXT,
    endpoint TEXT,
    query_endpoint TEXT,
    priority INTEGER DEFAULT 0,
    is_default INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    settings TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_service_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    display_name TEXT,
    service_type TEXT NOT NULL,
    provider TEXT NOT NULL,
    default_url TEXT,
    preset_models TEXT,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_voices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voice_id TEXT NOT NULL UNIQUE,
    voice_name TEXT NOT NULL,
    description TEXT,
    language TEXT,
    provider TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    model TEXT,
    system_prompt TEXT,
    temperature REAL,
    max_tokens INTEGER,
    max_iterations INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS image_generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    storyboard_id INTEGER,
    drama_id INTEGER,
    scene_id INTEGER,
    character_id INTEGER,
    prop_id INTEGER,
    image_type TEXT,
    frame_type TEXT,
    provider TEXT,
    prompt TEXT,
    negative_prompt TEXT,
    model TEXT,
    size TEXT,
    quality TEXT,
    style TEXT,
    steps INTEGER,
    cfg_scale REAL,
    seed INTEGER,
    image_url TEXT,
    minio_url TEXT,
    local_path TEXT,
    status TEXT DEFAULT 'pending',
    task_id TEXT,
    error_msg TEXT,
    width INTEGER,
    height INTEGER,
    reference_images TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS video_generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    storyboard_id INTEGER,
    drama_id INTEGER,
    provider TEXT,
    prompt TEXT,
    model TEXT,
    image_gen_id INTEGER,
    reference_mode TEXT,
    image_url TEXT,
    first_frame_url TEXT,
    last_frame_url TEXT,
    reference_image_urls TEXT,
    duration INTEGER,
    fps INTEGER,
    resolution TEXT,
    aspect_ratio TEXT,
    style TEXT,
    motion_level INTEGER,
    camera_motion TEXT,
    seed INTEGER,
    video_url TEXT,
    minio_url TEXT,
    local_path TEXT,
    status TEXT DEFAULT 'pending',
    task_id TEXT,
    error_msg TEXT,
    width INTEGER,
    height INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS music_generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER,
    episode_id INTEGER,
    storyboard_id INTEGER,
    provider TEXT,
    model TEXT,
    prompt TEXT NOT NULL,
    description TEXT,
    title TEXT,
    cover_url TEXT,
    audio_url TEXT,
    local_path TEXT,
    duration REAL,
    status TEXT DEFAULT 'pending',
    task_id TEXT,
    error_msg TEXT,
    batch_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS video_merges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER,
    drama_id INTEGER,
    title TEXT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    scenes TEXT,
    merged_url TEXT,
    duration INTEGER,
    task_id TEXT,
    error_msg TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS props (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    description TEXT,
    prompt TEXT,
    image_url TEXT,
    reference_images TEXT,
    local_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER,
    episode_id INTEGER,
    storyboard_id INTEGER,
    storyboard_num INTEGER,
    name TEXT,
    description TEXT,
    type TEXT,
    category TEXT,
    url TEXT,
    thumbnail_url TEXT,
    local_path TEXT,
    file_size INTEGER,
    mime_type TEXT,
    width INTEGER,
    height INTEGER,
    duration INTEGER,
    format TEXT,
    image_gen_id INTEGER,
    video_gen_id INTEGER,
    is_favorite INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
`)

function ensureColumn(table: string, column: string, definition: string) {
  const tableExists = sqlite.prepare(
    `SELECT 1 as ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`,
  ).get(table) as { ok: number } | undefined
  if (!tableExists) return
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some(col => col.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

ensureColumn('episodes', 'image_config_id', 'INTEGER')
ensureColumn('episodes', 'image_model', 'TEXT')
ensureColumn('episodes', 'text_model', 'TEXT')
ensureColumn('episodes', 'text_thinking', 'INTEGER DEFAULT 1')
ensureColumn('episodes', 'video_config_id', 'INTEGER')
ensureColumn('episodes', 'audio_config_id', 'INTEGER')
ensureColumn('storyboards', 'bgm_audio_url', 'TEXT')
ensureColumn('storyboards', 'bgm_generation_id', 'INTEGER')
ensureColumn('characters', 'variant_label', 'TEXT')
ensureColumn('episodes', 'opening_video_url', 'TEXT')
ensureColumn('episodes', 'opening_video_error', 'TEXT')
ensureColumn('episodes', 'opening_audio_url', 'TEXT')
ensureColumn('episodes', 'opening_subtitle_text', 'TEXT')
ensureColumn('episodes', 'opening_picked_images', 'TEXT')
ensureColumn('episodes', 'watermark_text', 'TEXT')
ensureColumn('episodes', 'watermark_animated', 'INTEGER DEFAULT 0')
ensureColumn('episodes', 'refer_previous_episode', 'INTEGER DEFAULT 0')
ensureColumn('episodes', 'title_video_url', 'TEXT')
ensureColumn('episodes', 'title_video_error', 'TEXT')

// 历史默认迁移为 GPT Image（4022 OpenAI 兼容，文生图 + edits 参考图定妆）
// 跳过 ComfyUI / 智谱 CogView / 本地生图配置
try {
  sqlite.exec(`
    UPDATE episodes
    SET image_model = 'gpt-image-2'
    WHERE image_model IS NULL
       OR TRIM(image_model) = ''
       OR image_model = 'gpt-image-2-all'
       OR image_model LIKE 'doubao-seedream%'
       OR image_model LIKE 'qwen-image%'
       OR image_model LIKE 'gemini-%flash-image%'
       OR image_model LIKE 'kling-%'
  `)
  sqlite.exec(`
    UPDATE ai_service_configs
    SET provider = 'chatfire',
        model = '["gpt-image-2","qwen-image-edit-2509","qwen-image-2.0-2026-03-03","qwen-image-max"]',
        updated_at = datetime('now')
    WHERE service_type = 'image'
      AND LOWER(COALESCE(provider, '')) NOT IN ('comfyui', 'local', 'zhipu', 'bigmodel', 'zai', 'agnes')
      AND (
        provider IN ('kling', 'gemini')
        OR model LIKE '%kling%'
        OR model LIKE '%seedream%'
        OR model LIKE '%gemini%flash-image%'
        OR (
          model LIKE '%qwen-image%'
          AND model NOT LIKE '%qwen_image_edit%'
        )
        OR (
          model NOT LIKE '%gpt-image%'
          AND model NOT LIKE '%qwen_image%'
          AND model NOT LIKE '%kolors%'
          AND model NOT LIKE '%sdxl_%'
          AND model NOT LIKE '%flux%'
          AND model NOT LIKE '%wan_%'
          AND model NOT LIKE '%cogview%'
          AND model NOT LIKE '%agnes-image%'
        )
      )
  `)
} catch {
  // ignore migration errors on fresh DB
}

// 管线默认生图：旧 CogView 默认 → Agnes 定妆（支持参考图）
try {
  sqlite.exec(`
    UPDATE episodes
    SET image_model = 'agnes-image-2.0-flash'
    WHERE image_model = 'cogview-3-flash'
      AND drama_id IN (
        SELECT id FROM dramas
        WHERE metadata LIKE '%"production_mode":"narration"%'
           OR metadata LIKE '%"production_mode":"motion_comic"%'
           OR metadata LIKE '%"production_mode":"novel_comic"%'
           OR metadata LIKE '%"production_mode":"local_comic"%'
           OR metadata LIKE '%"production_mode":"dialogue_portrait"%'
      )
  `)
} catch {
  // ignore
}

// 文本模型：默认 Nemotron Ultra 免费；旧 free Flash 别名迁移
try {
  sqlite.exec(`
    UPDATE episodes
    SET text_model = 'nvidia/nemotron-3-ultra-550b-a55b:free'
    WHERE text_model IS NULL
       OR TRIM(text_model) = ''
       OR text_model IN (
         'gemini-3-pro-preview', 'gemini-3-flash-preview', 'google/gemini-3-flash-preview', 'gpt-4.1-mini',
         'deepseek-v4-flash:free', 'openrouter/deepseek-v4-flash:free',
         'nvidia/nemotron-3-ultra:free', 'nvidia/nemotron-3-ultra-550b:free',
         'glm-4.7-flash', 'glm-4-flash-250414'
       )
  `)
  // 历史默认曾把付费 Flash/Pro 短名当 OpenRouter 用，迁移到显式 openrouter/ 前缀
  sqlite.exec(`
    UPDATE episodes
    SET text_model = 'openrouter/deepseek-v4-flash'
    WHERE text_model = 'deepseek-v4-flash'
  `)
  sqlite.exec(`
    UPDATE episodes
    SET text_model = 'openrouter/deepseek-v4-pro'
    WHERE text_model = 'deepseek-v4-pro'
  `)
  sqlite.exec(`
    UPDATE ai_service_configs
    SET model = '["nvidia/nemotron-3-ultra-550b-a55b:free","openrouter/deepseek-v4-flash","openrouter/deepseek-v4-pro"]',
        updated_at = datetime('now')
    WHERE service_type = 'text'
      AND LOWER(COALESCE(provider, '')) = 'openrouter'
  `)
  sqlite.exec(`
    UPDATE ai_service_configs
    SET model = '["deepseek-v4-flash","deepseek-v4-pro"]',
        name = CASE WHEN name IS NULL OR TRIM(name) = '' THEN 'DeepSeek 官网文本' ELSE name END,
        updated_at = datetime('now')
    WHERE service_type = 'text'
      AND LOWER(COALESCE(provider, '')) IN ('openai', 'deepseek')
      AND (
        base_url LIKE '%deepseek.com%'
        OR name LIKE '%DeepSeek%'
        OR name LIKE '%官网%'
      )
  `)
  sqlite.exec(`
    UPDATE agent_configs
    SET model = 'nvidia/nemotron-3-ultra-550b-a55b:free',
        updated_at = datetime('now')
    WHERE model IS NULL
       OR TRIM(model) = ''
       OR model IN (
         'gemini-3-pro-preview', 'gemini-3-flash-preview', 'google/gemini-3-flash-preview', 'gpt-4.1-mini',
         'deepseek-v4-flash:free', 'openrouter/deepseek-v4-flash:free',
         'nvidia/nemotron-3-ultra:free', 'nvidia/nemotron-3-ultra-550b:free',
         'deepseek-v4-flash', 'deepseek-v4-pro',
         'glm-4.7-flash', 'glm-4-flash-250414'
       )
  `)
} catch {
  // ignore
}

// 文本/图片/视频/音频服务统一走 4022 代理
try {
  sqlite.exec(`
    UPDATE ai_service_configs
    SET base_url = 'https://api.4022543.xyz',
        updated_at = datetime('now')
    WHERE service_type IN ('text', 'image', 'music')
      AND (
        base_url IS NULL
        OR TRIM(base_url) = ''
        OR base_url LIKE '%chatfire.site%'
      )
  `)
  sqlite.exec(`
    UPDATE ai_service_configs
    SET base_url = 'https://api.4022543.xyz/minimax',
        updated_at = datetime('now')
    WHERE service_type = 'audio'
      AND provider = 'minimax'
      AND (
        base_url IS NULL
        OR TRIM(base_url) = ''
        OR base_url LIKE '%chatfire.site%'
      )
  `)
  sqlite.exec(`
    UPDATE ai_service_configs
    SET provider = 'vidu',
        base_url = 'https://api.4022543.xyz',
        model = '["viduq3-turbo"]',
        updated_at = datetime('now')
    WHERE service_type = 'video'
      AND (
        provider = 'volcengine'
        OR model LIKE '%seedance%'
        OR base_url LIKE '%chatfire.site%'
      )
  `)
  sqlite.exec(`
    UPDATE ai_service_configs
    SET model = REPLACE(model, 'gpt-image-2-all', 'gpt-image-2'),
        updated_at = datetime('now')
    WHERE service_type = 'image'
      AND model LIKE '%gpt-image-2-all%'
  `)
} catch {
  // ignore
}

// 历史文本服务迁移（兼容旧块）
try {
  sqlite.exec(`
    UPDATE ai_service_configs
    SET base_url = 'https://api.4022543.xyz',
        updated_at = datetime('now')
    WHERE service_type = 'text'
      AND (
        base_url IS NULL
        OR TRIM(base_url) = ''
        OR base_url LIKE '%chatfire.site%'
      )
  `)
} catch {
  // ignore
}

// 旧项目默认 webtoon(Q版) → 短剧动漫(正常比例)
try {
  sqlite.exec(`
    UPDATE dramas
    SET style = 'short-drama', updated_at = datetime('now')
    WHERE style IS NULL OR TRIM(style) = '' OR style = 'webtoon'
  `)
} catch {
  // ignore
}

export const db = drizzle(sqlite, { schema })
export { schema }
export type DB = typeof db

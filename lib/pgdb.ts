import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

// Create a connection pool to Neon/Postgres
const rawUrl = process.env.DATABASE_URL || '';
const needsSSL = rawUrl.includes('neon.tech') || rawUrl.includes('sslmode=require');

let pool: Pool;
try {
  const url = new URL(rawUrl);
  const host = url.hostname;
  const port = url.port ? Number(url.port) : 5432;
  const database = url.pathname.replace(/^\//, '') || undefined;
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const ssl = needsSSL ? { rejectUnauthorized: false } : undefined;

  pool = new Pool({ host, port, database, user, password, ssl });
  // Debug configuration (mask password)
  // eslint-disable-next-line no-console
  console.log('[pgdb] pool config:', { host, port, database, user, passwordLen: (password || '').length, ssl: !!ssl });
} catch {
  // Fallback to connectionString if URL parsing fails
  pool = new Pool({
    connectionString: rawUrl || undefined,
    ssl: needsSSL ? { rejectUnauthorized: false } : undefined,
  });
  // eslint-disable-next-line no-console
  console.log('[pgdb] pool config: using connectionString, ssl:', needsSSL);
}

export async function queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(sql, params);
  return res.rows as T[];
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  const res = await pool.query(sql, params);
  return (res.rows[0] as T) || undefined;
}

export async function execute(sql: string, params: any[] = []): Promise<{ rowCount: number } & Record<string, any>> {
  const isInsert = /^\s*insert\s+/i.test(sql);
  // Determine target table for INSERT
  const tableMatch = sql.match(/insert\s+into\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
  const tableName = tableMatch ? tableMatch[1].toLowerCase() : undefined;
  // Only append RETURNING id for tables known to have an 'id' column
  const tablesWithId = new Set([
    'users',
    'folders',
    'videos',
    'posts',
    'video_shares',
    'folder_shares',
    'deleted_videos',
  ]);
  const canReturnId = tableName ? tablesWithId.has(tableName) : false;
  const needsReturning = isInsert && !/returning\s+/i.test(sql) && canReturnId;
  const finalSql = needsReturning ? `${sql} RETURNING id` : sql;
  const res = await pool.query(finalSql, params);
  const ret: any = { rowCount: res.rowCount };
  if (needsReturning && res.rows[0] && typeof res.rows[0].id !== 'undefined') {
    ret.lastInsertRowid = res.rows[0].id;
  }
  return ret;
}

// Initialize Neon/Postgres schema (idempotent)
export async function initSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT,
        role TEXT DEFAULT 'publisher',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS folders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
        lixstream_dir_id TEXT,
        folder_share_link TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS videos (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        lixstream_file_id TEXT,
        lixstream_upload_id TEXT,
        file_share_link TEXT,
        file_embed_link TEXT,
        thumbnail_url TEXT,
        thumbnail_s3_url TEXT,
        upload_status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        video_ids TEXT NOT NULL,
        telegram_posted BOOLEAN DEFAULT FALSE,
        x_posted BOOLEAN DEFAULT FALSE,
        telegram_message_id TEXT,
        x_tweet_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS video_shares (
        id SERIAL PRIMARY KEY,
        video_id TEXT NOT NULL,
        lixstream_file_id TEXT NOT NULL,
        shared_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        shared_to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(video_id, shared_to_user_id)
      );

      CREATE TABLE IF NOT EXISTS folder_shares (
        id SERIAL PRIMARY KEY,
        folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
        lixstream_dir_id TEXT,
        shared_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        shared_to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(folder_id, shared_to_user_id)
      );

      CREATE TABLE IF NOT EXISTS deleted_videos (
        id SERIAL PRIMARY KEY,
        lixstream_file_id TEXT NOT NULL UNIQUE,
        deleted_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id);
      CREATE INDEX IF NOT EXISTS idx_videos_folder_id ON videos(folder_id);
      CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
      CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
      CREATE INDEX IF NOT EXISTS idx_video_shares_video_id ON video_shares(video_id);
      CREATE INDEX IF NOT EXISTS idx_video_shares_shared_to ON video_shares(shared_to_user_id);
      CREATE INDEX IF NOT EXISTS idx_folder_shares_folder_id ON folder_shares(folder_id);
      CREATE INDEX IF NOT EXISTS idx_folder_shares_shared_to ON folder_shares(shared_to_user_id);
      CREATE INDEX IF NOT EXISTS idx_deleted_videos_file_id ON deleted_videos(lixstream_file_id);
    `);

    const res = await client.query('SELECT COUNT(*) AS count FROM users');
    const count = Number(res.rows[0].count || 0);
    if (count === 0) {
      const defaultPassword = await bcrypt.hash('admin123', 10);
      await client.query(
        `INSERT INTO users (username, password, email, role) VALUES ($1, $2, $3, $4)`,
        ['admin', defaultPassword, 'admin@example.com', 'superuser']
      );
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export default {
  pool,
  queryAll,
  queryOne,
  execute,
  initSchema,
};
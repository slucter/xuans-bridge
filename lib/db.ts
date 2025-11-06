import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const dbPath = path.join(process.cwd(), 'data', 'stream-ops.db');
const dbDir = path.dirname(dbPath);

// Ensure data directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT,
    role TEXT DEFAULT 'publisher',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    parent_id INTEGER,
    lixstream_dir_id TEXT,
    folder_share_link TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    folder_id INTEGER,
    name TEXT NOT NULL,
    lixstream_file_id TEXT,
    lixstream_upload_id TEXT,
    file_share_link TEXT,
    file_embed_link TEXT,
    thumbnail_url TEXT,
    thumbnail_s3_url TEXT,
    upload_status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    video_ids TEXT NOT NULL,
    telegram_posted BOOLEAN DEFAULT 0,
    x_posted BOOLEAN DEFAULT 0,
    telegram_message_id TEXT,
    x_tweet_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS video_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id TEXT NOT NULL,
    lixstream_file_id TEXT NOT NULL,
    shared_by_user_id INTEGER NOT NULL,
    shared_to_user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shared_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (shared_to_user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(video_id, shared_to_user_id)
  );

  CREATE TABLE IF NOT EXISTS folder_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_id INTEGER NOT NULL,
    lixstream_dir_id TEXT,
    shared_by_user_id INTEGER NOT NULL,
    shared_to_user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
    FOREIGN KEY (shared_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (shared_to_user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(folder_id, shared_to_user_id)
  );

  CREATE TABLE IF NOT EXISTS deleted_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lixstream_file_id TEXT NOT NULL UNIQUE,
    deleted_by_user_id INTEGER NOT NULL,
    deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deleted_by_user_id) REFERENCES users(id) ON DELETE CASCADE
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

// Migration: Add folder_share_link column if it doesn't exist
try {
  const columns = db.prepare("PRAGMA table_info(folders)").all() as any[];
  const hasFolderShareLink = columns.some((col: any) => col.name === 'folder_share_link');
  if (!hasFolderShareLink) {
    console.log('Adding folder_share_link column to folders table...');
    db.exec('ALTER TABLE folders ADD COLUMN folder_share_link TEXT');
    console.log('folder_share_link column added successfully');
  }
} catch (error: any) {
  console.log('Folder share link migration check error:', error?.message || error);
  if (!error.message?.includes('duplicate column')) {
    try {
      db.exec('ALTER TABLE folders ADD COLUMN folder_share_link TEXT');
    } catch (e: any) {
      console.log('Failed to add folder_share_link column:', e?.message || e);
    }
  }
}

// Migration: Add parent_id column if it doesn't exist
try {
  const columns = db.prepare("PRAGMA table_info(folders)").all() as any[];
  const hasParentId = columns.some((col: any) => col.name === 'parent_id');
  if (!hasParentId) {
    console.log('Adding parent_id column to folders table...');
    db.exec('ALTER TABLE folders ADD COLUMN parent_id INTEGER');
    db.exec('CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id)');
    console.log('parent_id column added successfully');
  }
} catch (error: any) {
  console.log('Migration check error:', error?.message || error);
  if (!error.message?.includes('duplicate column')) {
    try {
      db.exec('ALTER TABLE folders ADD COLUMN parent_id INTEGER');
      db.exec('CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id)');
    } catch (e: any) {
      console.log('Failed to add parent_id column:', e?.message || e);
    }
  }
}

// Migration: Add role column if it doesn't exist
try {
  const columns = db.prepare("PRAGMA table_info(users)").all() as any[];
  const hasRole = columns.some((col: any) => col.name === 'role');
  if (!hasRole) {
    console.log('Adding role column to users table...');
    db.exec('ALTER TABLE users ADD COLUMN role TEXT DEFAULT "publisher"');
    // Set default admin user as superuser
    db.prepare('UPDATE users SET role = ? WHERE username = ?').run('superuser', 'admin');
    console.log('role column added successfully');
  }
} catch (error: any) {
  console.log('Role migration check error:', error?.message || error);
  if (!error.message?.includes('duplicate column')) {
    try {
      db.exec('ALTER TABLE users ADD COLUMN role TEXT DEFAULT "publisher"');
      db.prepare('UPDATE users SET role = ? WHERE username = ?').run('superuser', 'admin');
    } catch (e: any) {
      console.log('Failed to add role column:', e?.message || e);
    }
  }
}

// Create default admin user (password: admin123)
const defaultPassword = bcrypt.hashSync('admin123', 10);

const stmt = db.prepare('SELECT COUNT(*) as count FROM users');
const { count } = stmt.get() as { count: number };

if (count === 0) {
  db.prepare(`
    INSERT INTO users (username, password, email, role)
    VALUES (?, ?, ?, ?)
  `).run('admin', defaultPassword, 'admin@example.com', 'superuser');
}

export default db;


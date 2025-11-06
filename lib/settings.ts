import db from './db';

/**
 * Get setting value from database, fallback to environment variable
 */
export function getSetting(key: string, envKey?: string): string | null {
  const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  
  if (setting && setting.value) {
    return setting.value;
  }
  
  // Fallback to environment variable
  if (envKey) {
    return process.env[envKey] || null;
  }
  
  return null;
}

/**
 * Set setting value in database
 */
export function setSetting(key: string, value: string | null): void {
  if (value === null || value === '') {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  } else {
    db.prepare(`
      INSERT INTO settings (key, value, updated_at) 
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    `).run(key, value, value);
  }
}

/**
 * Get all settings
 */
export function getAllSettings(): Record<string, string> {
  const settings = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const result: Record<string, string> = {};
  settings.forEach((s) => {
    result[s.key] = s.value;
  });
  return result;
}


import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'data', 'stream-ops.db');
const dbDir = path.dirname(dbPath);

// Ensure data directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

/**
 * Reset database - delete all data except users table
 */
function resetDatabase() {
  console.log('Starting database reset...');
  
  try {
    // Disable foreign keys temporarily to allow deletion
    db.pragma('foreign_keys = OFF');
    
    // Delete all data from tables (except users)
    console.log('Deleting folders...');
    db.prepare('DELETE FROM folders').run();
    
    console.log('Deleting videos...');
    db.prepare('DELETE FROM videos').run();
    
    console.log('Deleting posts...');
    db.prepare('DELETE FROM posts').run();
    
    console.log('Deleting settings...');
    db.prepare('DELETE FROM settings').run();
    
    console.log('Deleting video_shares...');
    db.prepare('DELETE FROM video_shares').run();
    
    console.log('Deleting folder_shares...');
    db.prepare('DELETE FROM folder_shares').run();
    
    console.log('Deleting deleted_videos...');
    db.prepare('DELETE FROM deleted_videos').run();
    
    // Reset auto-increment counters (optional - SQLite will handle this automatically)
    console.log('Resetting auto-increment counters...');
    try {
      // Delete sequence entries for all tables except users
      const sequences = db.prepare("SELECT name FROM sqlite_sequence").all() as any[];
      sequences.forEach((seq: any) => {
        if (seq.name !== 'users') {
          db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(seq.name);
        }
      });
    } catch (error) {
      // sqlite_sequence might not exist, that's okay
      console.log('Note: Could not reset auto-increment counters (this is normal if tables are empty)');
    }
    
    // Re-enable foreign keys
    db.pragma('foreign_keys = ON');
    
    console.log('Database reset completed successfully!');
    console.log('All data deleted except users table.');
    
    // Show remaining users
    const users = db.prepare('SELECT id, username, email, role FROM users').all() as any[];
    console.log(`\nRemaining users (${users.length}):`);
    users.forEach(user => {
      console.log(`  - ID: ${user.id}, Username: ${user.username}, Email: ${user.email || 'N/A'}, Role: ${user.role}`);
    });
    
    db.close();
  } catch (error: any) {
    console.error('Error resetting database:', error);
    db.close();
    throw error;
  }
}

// Run if executed directly
resetDatabase();


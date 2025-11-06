import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';

const dbPath = path.join(process.cwd(), 'data', 'stream-ops.db');
const db = new Database(dbPath);

async function addSuperuser() {
  const username = 'Slucter';
  const password = 'Slucter1337';
  const email = 'slucter@example.com';
  const role = 'superuser';

  try {
    // Check if user already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    
    if (existingUser) {
      console.log(`User "${username}" already exists. Updating password and role...`);
      const hashedPassword = await bcrypt.hash(password, 10);
      db.prepare('UPDATE users SET password = ?, role = ?, email = ? WHERE username = ?')
        .run(hashedPassword, role, email, username);
      console.log(`User "${username}" updated successfully!`);
    } else {
      console.log(`Creating new user "${username}"...`);
      const hashedPassword = await bcrypt.hash(password, 10);
      db.prepare('INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)')
        .run(username, hashedPassword, email, role);
      console.log(`User "${username}" created successfully!`);
    }
    
    console.log(`\nLogin credentials:`);
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);
    console.log(`Role: ${role}`);
  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    db.close();
  }
}

addSuperuser();


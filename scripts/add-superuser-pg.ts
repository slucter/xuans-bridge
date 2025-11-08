import dotenv from 'dotenv';
// Load .env.local first if present, then fallback to .env
dotenv.config({ path: '.env.local' });
dotenv.config();
// Import pgdb dynamically after env is loaded
let queryOne: typeof import('@/lib/pgdb').queryOne;
let execute: typeof import('@/lib/pgdb').execute;
import bcrypt from 'bcryptjs';

async function addSuperuser() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Configure Neon/Postgres connection.');
    process.exit(1);
  }
  // Ensure pgdb is imported after env is ready
  ({ queryOne, execute } = await import('@/lib/pgdb'));

  const username = 'Slucter';
  const password = 'Slucter1337';
  const email = 'slucter@example.com';
  const role = 'superuser';

  try {
    const existing = await queryOne<{ id: number }>(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (existing) {
      console.log(`User "${username}" already exists. Updating password and role...`);
      const hashedPassword = await bcrypt.hash(password, 10);
      await execute('UPDATE users SET password = $1, role = $2, email = $3 WHERE username = $4', [
        hashedPassword,
        role,
        email,
        username,
      ]);
      console.log(`User "${username}" updated successfully!`);
    } else {
      console.log(`Creating new user "${username}"...`);
      const hashedPassword = await bcrypt.hash(password, 10);
      await execute('INSERT INTO users (username, password, email, role) VALUES ($1, $2, $3, $4)', [
        username,
        hashedPassword,
        email,
        role,
      ]);
      console.log(`User "${username}" created successfully!`);
    }

    console.log(`\nLogin credentials:`);
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);
    console.log(`Role: ${role}`);
  } catch (error: any) {
    console.error('Error:', error?.message || error);
    process.exit(1);
  }
}

addSuperuser();
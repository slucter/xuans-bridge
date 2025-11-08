import 'dotenv/config';
import { execute } from '@/lib/pgdb';

async function resetDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Configure Neon/Postgres connection.');
    process.exit(1);
  }

  console.log('Starting Postgres database reset (excluding users)...');
  try {
    // Delete data from dependent tables
    await execute('DELETE FROM folder_shares');
    await execute('DELETE FROM video_shares');
    await execute('DELETE FROM deleted_videos');
    await execute('DELETE FROM settings');
    await execute('DELETE FROM posts');
    await execute('DELETE FROM videos');
    await execute('DELETE FROM folders');

    console.log('Database reset completed successfully! All data deleted except users table.');
  } catch (error: any) {
    console.error('Error resetting database:', error?.message || error);
    process.exit(1);
  }
}

resetDatabase();
import dotenv from 'dotenv';
// Load .env.local first if present, then fallback to .env
dotenv.config({ path: '.env.local' });
dotenv.config();
// Import pgdb dynamically after env is loaded to ensure DATABASE_URL is available

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Please configure Neon connection string.');
    process.exit(1);
  }

  console.log('Initializing Neon/Postgres schema...');
  try {
    const { default: pgdb, initSchema } = await import('@/lib/pgdb');
    // Debug connection URL parsing (mask password)
    try {
      const u = new URL(process.env.DATABASE_URL!);
      console.log('DB host:', u.hostname, 'port:', u.port || '5432', 'db:', u.pathname.replace(/^\//, ''));
      console.log('DB user:', decodeURIComponent(u.username), 'password type:', typeof decodeURIComponent(u.password));
    } catch (e) {
      console.warn('Failed to parse DATABASE_URL for debug:', (e as any)?.message || e);
    }
    await initSchema();
    console.log('Schema initialized successfully.');
  } catch (err: any) {
    console.error('Failed to initialize schema:', err?.message || err);
    process.exit(1);
  } finally {
    // Gracefully end pool
    const { default: pgdb } = await import('@/lib/pgdb');
    await pgdb.pool.end();
  }
}

main();
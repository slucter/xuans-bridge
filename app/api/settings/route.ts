import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { queryAll, execute } from '@/lib/pgdb';

// Get all settings (superuser only)
export async function GET(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = verifyToken(token);
  if (!user || user.role !== 'superuser') {
    return NextResponse.json({ error: 'Forbidden - Superuser access required' }, { status: 403 });
  }

  // Read settings from Postgres (fallback to env if missing)
  const rows = await queryAll<{ key: string; value: string }>('SELECT key, value FROM settings');
  const map: Record<string, string> = {};
  rows.forEach((r) => (map[r.key] = r.value));

  return NextResponse.json({
    settings: {
      lixstream_api_key: map.lixstream_api_key || process.env.LIXSTREAM_API_KEY || '',
      lixstream_api_url: map.lixstream_api_url || process.env.LIXSTREAM_API_URL || 'https://api.luxsioab.com/pub/api',
      telegram_bot_token: map.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || '',
      telegram_channel_id: map.telegram_channel_id || process.env.TELEGRAM_CHANNEL_ID || '',
      telegram_channel_name: map.telegram_channel_name || process.env.TELEGRAM_CHANNEL_NAME || '',
    },
  });
}

// Update settings (superuser only)
export async function PUT(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = verifyToken(token);
  if (!user || user.role !== 'superuser') {
    return NextResponse.json({ error: 'Forbidden - Superuser access required' }, { status: 403 });
  }

  try {
    const {
      lixstream_api_key,
      lixstream_api_url,
      telegram_bot_token,
      telegram_channel_id,
      telegram_channel_name,
    } = await request.json();

    // Upsert into Postgres settings table
    const upsert = async (key: string, value: string | null | undefined) => {
      if (value === undefined) return; // skip if not provided
      if (value === null || value === '') {
        await execute('DELETE FROM settings WHERE key = $1', [key]);
      } else {
        await execute(
          'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
          [key, value]
        );
      }
    };

    await upsert('lixstream_api_key', lixstream_api_key ?? null);
    await upsert('lixstream_api_url', lixstream_api_url ?? null);
    await upsert('telegram_bot_token', telegram_bot_token ?? null);
    await upsert('telegram_channel_id', telegram_channel_id ?? null);
    await upsert('telegram_channel_name', telegram_channel_name ?? null);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Update settings error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update settings' },
      { status: 500 }
    );
  }
}


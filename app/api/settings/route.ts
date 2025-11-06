import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getSetting, setSetting, getAllSettings } from '@/lib/settings';

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

  const settings = getAllSettings();
  
  // Include fallback values from env
  return NextResponse.json({
    settings: {
      lixstream_api_key: settings.lixstream_api_key || process.env.LIXSTREAM_API_KEY || '',
      lixstream_api_url: settings.lixstream_api_url || process.env.LIXSTREAM_API_URL || 'https://api.luxsioab.com/pub/api',
      telegram_bot_token: settings.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || '',
      telegram_channel_id: settings.telegram_channel_id || process.env.TELEGRAM_CHANNEL_ID || '',
      telegram_channel_name: settings.telegram_channel_name || process.env.TELEGRAM_CHANNEL_NAME || '',
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

    if (lixstream_api_key !== undefined) {
      setSetting('lixstream_api_key', lixstream_api_key || null);
    }
    if (lixstream_api_url !== undefined) {
      setSetting('lixstream_api_url', lixstream_api_url || null);
    }
    if (telegram_bot_token !== undefined) {
      setSetting('telegram_bot_token', telegram_bot_token || null);
    }
    if (telegram_channel_id !== undefined) {
      setSetting('telegram_channel_id', telegram_channel_id || null);
    }
    if (telegram_channel_name !== undefined) {
      setSetting('telegram_channel_name', telegram_channel_name || null);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Update settings error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update settings' },
      { status: 500 }
    );
  }
}


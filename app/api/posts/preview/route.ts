import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getSettingAsync } from '@/lib/settings';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = verifyToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const TELEGRAM_CHANNEL_NAME = (await getSettingAsync('telegram_channel_name', 'TELEGRAM_CHANNEL_NAME')) || 'channel telegram';
  
  return NextResponse.json({ channelName: TELEGRAM_CHANNEL_NAME });
}


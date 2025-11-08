import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { queryAll, queryOne, execute } from '@/lib/pgdb';
import { getSettingAsync } from '@/lib/settings';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = verifyToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const title = formData.get('title') as string;
    const videoIdsStr = formData.get('videoIds') as string;
    const postToTelegramStr = formData.get('postToTelegram') as string;
    const image = formData.get('image') as File | null;
    
    const videoIds = JSON.parse(videoIdsStr || '[]');
    const shouldPostToTelegram = postToTelegramStr === 'true';

    if (!title || !videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
      return NextResponse.json(
        { error: 'Title and at least one video ID are required' },
        { status: 400 }
      );
    }

    // Convert videoIds to numbers and validate
    const videoIdsNumbers = videoIds.map((id: any) => {
      const numId = typeof id === 'number' ? id : parseInt(String(id));
      if (isNaN(numId)) {
        throw new Error(`Invalid video ID: ${id}`);
      }
      return numId;
    });

    // Get video links from Postgres
    const idPlaceholders = videoIdsNumbers.map((_, idx) => `$${idx + 1}`).join(',');
    const queryParams = [...videoIdsNumbers, user.id];
    const videos = await queryAll<any>(
      `SELECT id, name, file_share_link, file_embed_link 
       FROM videos 
       WHERE id IN (${idPlaceholders}) AND user_id = $${videoIdsNumbers.length + 1}`,
      queryParams
    );

    if (videos.length === 0) {
      return NextResponse.json({ error: 'No valid videos found' }, { status: 400 });
    }

    // Save post to Postgres
    const postInsert = await execute(
      `INSERT INTO posts (user_id, title, video_ids, telegram_posted, x_posted) 
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.id,
        String(title),
        JSON.stringify(videoIdsNumbers),
        false,
        false,
      ]
    );
    const postId = postInsert.lastInsertRowid;

    // Post to Telegram
    // Use channel ID from Postgres settings (fallback to env)
    const TELEGRAM_CHANNEL_ID = await getSettingAsync('telegram_channel_id', 'TELEGRAM_CHANNEL_ID');
    const channelIdToUse = TELEGRAM_CHANNEL_ID ? TELEGRAM_CHANNEL_ID.trim() : null;
    
    let telegramMessageId: string | null = null;
    let telegramError: string | null = null;
    // Post to Telegram if checkbox is checked and channel ID is available
    if (shouldPostToTelegram === true) {
      if (!channelIdToUse) {
        telegramError = 'Telegram Channel ID not configured. Please configure it in Settings (Users tab > Settings).';
        console.error('Telegram post error:', telegramError);
      } else {
        try {
          telegramMessageId = await postToTelegram(title, videos, channelIdToUse, image);
          if (telegramMessageId) {
            await execute(
              'UPDATE posts SET telegram_posted = $1, telegram_message_id = $2 WHERE id = $3',
              [true, String(telegramMessageId), postId]
            );
          }
        } catch (error: any) {
          telegramError = error.message || 'Failed to post to Telegram';
          console.error('Telegram post error:', telegramError);
        }
      }
    }

    return NextResponse.json({
      success: true,
      postId,
      telegramMessageId,
      telegramError: telegramError || undefined,
    });
  } catch (error: any) {
    console.error('Create post error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create post' },
      { status: 500 }
    );
  }
}

async function postToTelegram(title: string, videos: any[], channelId: string, image?: File | null): Promise<string> {
  const TELEGRAM_BOT_TOKEN = await getSettingAsync('telegram_bot_token', 'TELEGRAM_BOT_TOKEN');
  const TELEGRAM_CHANNEL_NAME = (await getSettingAsync('telegram_channel_name', 'TELEGRAM_CHANNEL_NAME')) || 'channel telegram';
  
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('Telegram bot token not configured. Please configure it in Settings.');
  }

  if (!channelId || !channelId.trim()) {
    throw new Error('Telegram channel ID is required. Please configure it in Settings.');
  }

  const links = videos.map((v) => v.file_share_link || v.file_embed_link).filter(Boolean);
  if (links.length === 0) {
    throw new Error('No video links available to post');
  }

  // Format message according to new template:
  // judul
  // (empty line)
  // link
  // link
  // link
  // (empty line)
  // Join ke channel telegram untuk mendapatkan daily update!
  // TELEGRAM_CHANNEL_NAME (as plain text)
  const message = `${title}\n\n${links.join('\n')}\n\nJoin ke channel telegram untuk mendapatkan daily update!\n\n${TELEGRAM_CHANNEL_NAME || 'channel telegram'}`;

  // If image is provided, use sendPhoto, otherwise use sendMessage
  if (image && image.size > 0) {
    const formData = new FormData();
    formData.append('chat_id', channelId.trim());
    formData.append('photo', image);
    formData.append('caption', message);
    formData.append('parse_mode', 'Markdown');

    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
      {
        method: 'POST',
        body: formData,
      }
    );

    const data = await response.json();
    if (!data.ok) {
      let errorMessage = data.description || 'Failed to post to Telegram';
      
      if (errorMessage.includes('chat not found')) {
        errorMessage = `Channel not found. Please check:
1. Channel ID is correct (use @channel_username or numeric ID like -1001234567890)
2. Bot has been added as administrator to the channel
3. Bot has permission to post messages`;
      } else if (errorMessage.includes('bot was blocked')) {
        errorMessage = 'Bot was blocked by the channel. Please unblock the bot.';
      } else if (errorMessage.includes('not enough rights')) {
        errorMessage = 'Bot does not have permission to post messages. Please make bot an administrator with post permission.';
      }
      
      throw new Error(errorMessage);
    }

    return data.result.message_id.toString();
  }

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: channelId.trim(),
        text: message,
        parse_mode: 'Markdown',
      }),
    }
  );

  const data = await response.json();
  if (!data.ok) {
    // Provide more helpful error messages
    let errorMessage = data.description || 'Failed to post to Telegram';
    
    if (errorMessage.includes('chat not found')) {
      errorMessage = `Channel not found. Please check:
1. Channel ID is correct (use @channel_username or numeric ID like -1001234567890)
2. Bot has been added as administrator to the channel
3. Bot has permission to post messages`;
    } else if (errorMessage.includes('bot was blocked')) {
      errorMessage = 'Bot was blocked by the channel. Please unblock the bot.';
    } else if (errorMessage.includes('not enough rights')) {
      errorMessage = 'Bot does not have permission to post messages. Please make bot an administrator with post permission.';
    }
    
    throw new Error(errorMessage);
  }

  return data.result.message_id.toString();
}



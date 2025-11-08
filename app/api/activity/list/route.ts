import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { queryAll } from '@/lib/pgdb';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = verifyToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(parseInt(searchParams.get('page') || '1'), 1);
  const pageSize = Math.min(Math.max(parseInt(searchParams.get('page_size') || '20'), 1), 100);
  const actionFilter = searchParams.get('action') || null;

  const offset = (page - 1) * pageSize;

  try {
    const args: any[] = [];
    let where = '';
    if (user.role === 'superuser') {
      // Superuser can see all; optional action filter
      if (actionFilter) {
        where = 'WHERE al.action = $1';
        args.push(actionFilter);
      }
    } else {
      // Only own logs
      if (actionFilter) {
        where = 'WHERE al.user_id = $1 AND al.action = $2';
        args.push(user.id, actionFilter);
      } else {
        where = 'WHERE al.user_id = $1';
        args.push(user.id);
      }
    }

    const logs = await queryAll<any>(
      `SELECT al.id, al.user_id, al.action, al.target_type, al.target_id, al.metadata, al.created_at,
              u.username
       FROM activity_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
      [...args, pageSize, offset]
    );

    // Normalize metadata to object
    const normalized = logs.map((l: any) => ({
      ...l,
      metadata: typeof l.metadata === 'string' ? (safeParseJson(l.metadata) ?? null) : l.metadata,
    }));

    return NextResponse.json({
      success: true,
      page,
      pageSize,
      logs: normalized,
    });
  } catch (error: any) {
    console.error('List activity error:', error);
    return NextResponse.json({ error: error.message || 'Failed to list activity' }, { status: 500 });
  }
}

function safeParseJson(str: string): any | null {
  try { return JSON.parse(str); } catch { return null; }
}
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { queryAll, queryOne } from '@/lib/pgdb';

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
  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '7'), 1), 90);
  const userIdFilterParam = searchParams.get('user_id');
  const userIdFilter = userIdFilterParam ? parseInt(userIdFilterParam) : null;

  try {
    // Fetch fresh role from DB to avoid stale token role
    const dbUser = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [user.id]);
    const effectiveRole = dbUser?.role || user.role || 'publisher';

    const whereArgs: any[] = [];
    let where = `WHERE al.created_at >= NOW() - INTERVAL '${days} days'`;
    if (effectiveRole !== 'superuser') {
      // Non-superuser always restricted to own user
      where += ` AND al.user_id = $1`;
      whereArgs.push(user.id);
    } else if (userIdFilter && Number.isFinite(userIdFilter)) {
      // Superuser can filter by a specific user
      where += ` AND al.user_id = $1`;
      whereArgs.push(userIdFilter);
    }

    // Counts by action in window
    const byAction = await queryAll<{ action: string; count: string }>(
      `SELECT al.action, COUNT(*)::text AS count
       FROM activity_logs al
       ${where}
       GROUP BY al.action
       ORDER BY COUNT(*) DESC`,
      whereArgs
    );

    // Total in window
    const totalInWindow = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM activity_logs al ${where}`,
      whereArgs
    );

    // Recent logs (last 20)
    const recentLogs = await queryAll<any>(
      `SELECT al.id, al.user_id, al.action, al.target_type, al.target_id, al.metadata, al.created_at,
              u.username
       FROM activity_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${effectiveRole === 'superuser' && !userIdFilter ? `WHERE al.created_at >= NOW() - INTERVAL '${days} days'` : `WHERE al.created_at >= NOW() - INTERVAL '${days} days' AND al.user_id = $1`}
       ORDER BY al.created_at DESC
       LIMIT 20`,
      effectiveRole === 'superuser' && !userIdFilter ? [] : [userIdFilter || user.id]
    );

    const normalized = recentLogs.map((l: any) => ({
      ...l,
      metadata: typeof l.metadata === 'string' ? (safeParseJson(l.metadata) ?? null) : l.metadata,
    }));

    const byActionMap: Record<string, number> = {};
    byAction.forEach((row) => {
      byActionMap[row.action] = parseInt(row.count || '0');
    });

    // Daily counts for current filter (for potential per-user trend)
    const dailyCounts = await queryAll<{ day: string; count: string }>(
      `SELECT to_char(date_trunc('day', al.created_at), 'YYYY-MM-DD') AS day, COUNT(*)::text AS count
       FROM activity_logs al
       ${where}
       GROUP BY day
       ORDER BY day ASC`,
      whereArgs
    );

    // Overall daily counts across ALL users (superuser only)
    let overallDailyCounts: { day: string; count: string }[] | null = null;
    if (effectiveRole === 'superuser') {
      overallDailyCounts = await queryAll<{ day: string; count: string }>(
        `SELECT to_char(date_trunc('day', al.created_at), 'YYYY-MM-DD') AS day, COUNT(*)::text AS count
         FROM activity_logs al
         WHERE al.created_at >= NOW() - INTERVAL '${days} days'
         GROUP BY day
         ORDER BY day ASC`
      );
    }

    return NextResponse.json({
      success: true,
      windowDays: days,
      total: parseInt(totalInWindow?.count || '0'),
      byAction: byActionMap,
      recent: normalized,
      dailyCounts,
      overallDailyCounts,
    });
  } catch (error: any) {
    console.error('Summary activity error:', error);
    return NextResponse.json({ error: error.message || 'Failed to summarize activity' }, { status: 500 });
  }
}

function safeParseJson(str: string): any | null {
  try { return JSON.parse(str); } catch { return null; }
}
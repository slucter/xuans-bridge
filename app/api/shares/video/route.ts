import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import db from '@/lib/db';

// Share video to publisher
export async function POST(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = verifyToken(token);
  if (!user || user.role !== 'superuser') {
    return NextResponse.json(
      { error: 'Only superuser can share videos' },
      { status: 403 }
    );
  }

  try {
    const { video_id, lixstream_file_id, shared_to_user_id } = await request.json();

    if (!video_id || !lixstream_file_id || !shared_to_user_id) {
      return NextResponse.json(
        { error: 'video_id, lixstream_file_id, and shared_to_user_id are required' },
        { status: 400 }
      );
    }

    // Check if target user exists and is a publisher
    const targetUser = db
      .prepare('SELECT id, role FROM users WHERE id = ?')
      .get(shared_to_user_id) as any;

    if (!targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    if (targetUser.role !== 'publisher') {
      return NextResponse.json(
        { error: 'Can only share to publisher accounts' },
        { status: 400 }
      );
    }

    // Insert or update share
    try {
      db.prepare(
        `INSERT INTO video_shares (video_id, lixstream_file_id, shared_by_user_id, shared_to_user_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(video_id, shared_to_user_id) DO NOTHING`
      ).run(video_id, lixstream_file_id, user.id, shared_to_user_id);

      return NextResponse.json({
        success: true,
        message: 'Video shared successfully',
      });
    } catch (error: any) {
      // Handle unique constraint violation
      if (error.message?.includes('UNIQUE constraint')) {
        return NextResponse.json({
          success: true,
          message: 'Video already shared to this user',
        });
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Share video error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to share video' },
      { status: 500 }
    );
  }
}

// Unshare video from publisher
export async function DELETE(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = verifyToken(token);
  if (!user || user.role !== 'superuser') {
    return NextResponse.json(
      { error: 'Only superuser can unshare videos' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const video_id = searchParams.get('video_id');
    const shared_to_user_id = searchParams.get('shared_to_user_id');

    if (!video_id || !shared_to_user_id) {
      return NextResponse.json(
        { error: 'video_id and shared_to_user_id are required' },
        { status: 400 }
      );
    }

    db.prepare(
      'DELETE FROM video_shares WHERE video_id = ? AND shared_to_user_id = ?'
    ).run(video_id, shared_to_user_id);

    return NextResponse.json({
      success: true,
      message: 'Video unshared successfully',
    });
  } catch (error: any) {
    console.error('Unshare video error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to unshare video' },
      { status: 500 }
    );
  }
}

// Get shared users for a video
export async function GET(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = verifyToken(token);
  if (!user || user.role !== 'superuser') {
    return NextResponse.json(
      { error: 'Only superuser can view shares' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const video_id = searchParams.get('video_id');

    if (!video_id) {
      return NextResponse.json(
        { error: 'video_id is required' },
        { status: 400 }
      );
    }

    const shares = db
      .prepare(
        `SELECT vs.*, u.username, u.email
         FROM video_shares vs
         JOIN users u ON vs.shared_to_user_id = u.id
         WHERE vs.video_id = ?`
      )
      .all(video_id) as any[];

    return NextResponse.json({ shares });
  } catch (error: any) {
    console.error('Get video shares error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get video shares' },
      { status: 500 }
    );
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import db from '@/lib/db';

// Share folder to publisher
export async function POST(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = verifyToken(token);
  if (!user || user.role !== 'superuser') {
    return NextResponse.json(
      { error: 'Only superuser can share folders' },
      { status: 403 }
    );
  }

  try {
    const { folder_id, lixstream_dir_id, shared_to_user_id } = await request.json();

    if (!folder_id || !shared_to_user_id) {
      return NextResponse.json(
        { error: 'folder_id and shared_to_user_id are required' },
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

    // Get folder's lixstream_dir_id if not provided
    let dirId = lixstream_dir_id;
    if (!dirId) {
      const folder = db
        .prepare('SELECT lixstream_dir_id FROM folders WHERE id = ?')
        .get(folder_id) as any;
      if (folder) {
        dirId = folder.lixstream_dir_id;
      }
    }

    // Insert or update share
    try {
      db.prepare(
        `INSERT INTO folder_shares (folder_id, lixstream_dir_id, shared_by_user_id, shared_to_user_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(folder_id, shared_to_user_id) DO NOTHING`
      ).run(folder_id, dirId || null, user.id, shared_to_user_id);

      return NextResponse.json({
        success: true,
        message: 'Folder shared successfully',
      });
    } catch (error: any) {
      // Handle unique constraint violation
      if (error.message?.includes('UNIQUE constraint')) {
        return NextResponse.json({
          success: true,
          message: 'Folder already shared to this user',
        });
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Share folder error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to share folder' },
      { status: 500 }
    );
  }
}

// Unshare folder from publisher
export async function DELETE(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = verifyToken(token);
  if (!user || user.role !== 'superuser') {
    return NextResponse.json(
      { error: 'Only superuser can unshare folders' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const folder_id = searchParams.get('folder_id');
    const shared_to_user_id = searchParams.get('shared_to_user_id');

    if (!folder_id || !shared_to_user_id) {
      return NextResponse.json(
        { error: 'folder_id and shared_to_user_id are required' },
        { status: 400 }
      );
    }

    db.prepare(
      'DELETE FROM folder_shares WHERE folder_id = ? AND shared_to_user_id = ?'
    ).run(folder_id, shared_to_user_id);

    return NextResponse.json({
      success: true,
      message: 'Folder unshared successfully',
    });
  } catch (error: any) {
    console.error('Unshare folder error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to unshare folder' },
      { status: 500 }
    );
  }
}

// Get shared users for a folder
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
    const folder_id = searchParams.get('folder_id');

    if (!folder_id) {
      return NextResponse.json(
        { error: 'folder_id is required' },
        { status: 400 }
      );
    }

    const shares = db
      .prepare(
        `SELECT fs.*, u.username, u.email
         FROM folder_shares fs
         JOIN users u ON fs.shared_to_user_id = u.id
         WHERE fs.folder_id = ?`
      )
      .all(folder_id) as any[];

    return NextResponse.json({ shares });
  } catch (error: any) {
    console.error('Get folder shares error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get folder shares' },
      { status: 500 }
    );
  }
}


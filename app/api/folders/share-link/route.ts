import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import db from '@/lib/db';

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
  const folderId = searchParams.get('folder_id');

  if (!folderId) {
    return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 });
  }

  try {
    const folderIdNum = parseInt(folderId);
    
    // Get folder with share link
    const folder = user.role === 'superuser'
      ? db.prepare('SELECT id, name, folder_share_link, lixstream_dir_id FROM folders WHERE id = ?').get(folderIdNum) as any
      : db.prepare('SELECT id, name, folder_share_link, lixstream_dir_id FROM folders WHERE id = ? AND user_id = ?').get(folderIdNum, user.id) as any;

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }

    return NextResponse.json({
      folder_id: folder.id,
      folder_name: folder.name,
      folder_share_link: folder.folder_share_link || null,
      lixstream_dir_id: folder.lixstream_dir_id || null,
    });
  } catch (error: any) {
    console.error('Get folder share link error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get folder share link' },
      { status: 500 }
    );
  }
}


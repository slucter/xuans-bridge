import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import db from '@/lib/db';

/**
 * Recursively delete a folder and all its contents (subfolders and videos)
 */
function deleteFolderRecursive(folderId: number, userId: number, userRole: string): { deletedFolders: number; deletedVideos: number; errors: string[] } {
  let deletedFoldersCount = 0;
  let deletedVideosCount = 0;
  const errors: string[] = [];

  // Get all subfolders
  const subfolders = userRole === 'superuser'
    ? db.prepare('SELECT id FROM folders WHERE parent_id = ?').all(folderId) as any[]
    : db.prepare('SELECT id FROM folders WHERE parent_id = ? AND user_id = ?').all(folderId, userId) as any[];

  // Recursively delete all subfolders first
  for (const subfolder of subfolders) {
    try {
      const result = deleteFolderRecursive(subfolder.id, userId, userRole);
      deletedFoldersCount += result.deletedFolders;
      deletedVideosCount += result.deletedVideos;
      errors.push(...result.errors);
    } catch (error: any) {
      errors.push(`Failed to delete subfolder ${subfolder.id}: ${error.message}`);
    }
  }

  // Get all videos in this folder
  const videos = userRole === 'superuser'
    ? db.prepare('SELECT id, lixstream_file_id FROM videos WHERE folder_id = ?').all(folderId) as any[]
    : db.prepare('SELECT id, lixstream_file_id FROM videos WHERE folder_id = ? AND user_id = ?').all(folderId, userId) as any[];

  // Delete all videos in this folder
  for (const video of videos) {
    try {
      // Delete video shares first (by video_id and lixstream_file_id)
      if (video.id) {
        db.prepare('DELETE FROM video_shares WHERE video_id = ?').run(video.id.toString());
      }
      if (video.lixstream_file_id) {
        db.prepare('DELETE FROM video_shares WHERE lixstream_file_id = ?').run(video.lixstream_file_id);
        // Mark as deleted in deleted_videos table (for superuser to hide from Lixstream API)
        db.prepare('INSERT OR IGNORE INTO deleted_videos (lixstream_file_id, deleted_by_user_id) VALUES (?, ?)').run(video.lixstream_file_id, userId);
      }
      
      // Delete the video
      if (userRole === 'superuser') {
        db.prepare('DELETE FROM videos WHERE id = ?').run(video.id);
      } else {
        db.prepare('DELETE FROM videos WHERE id = ? AND user_id = ?').run(video.id, userId);
      }
      deletedVideosCount++;
    } catch (error: any) {
      errors.push(`Failed to delete video ${video.id}: ${error.message}`);
    }
  }

  // Delete folder shares
  try {
    db.prepare('DELETE FROM folder_shares WHERE folder_id = ?').run(folderId);
  } catch (error: any) {
    errors.push(`Failed to delete folder shares for folder ${folderId}: ${error.message}`);
  }

  // Delete the folder itself
  try {
    if (userRole === 'superuser') {
      db.prepare('DELETE FROM folders WHERE id = ?').run(folderId);
    } else {
      db.prepare('DELETE FROM folders WHERE id = ? AND user_id = ?').run(folderId, userId);
    }
    deletedFoldersCount++;
  } catch (error: any) {
    errors.push(`Failed to delete folder ${folderId}: ${error.message}`);
    throw error; // Re-throw to stop the process if folder deletion fails
  }

  return {
    deletedFolders: deletedFoldersCount,
    deletedVideos: deletedVideosCount,
    errors,
  };
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = verifyToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('id');

    if (!folderId) {
      return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 });
    }

    const folderIdNum = parseInt(folderId);

    // Check if folder exists
    // Superuser can delete any folder, publisher only their own
    const folder = user.role === 'superuser'
      ? db.prepare('SELECT * FROM folders WHERE id = ?').get(folderIdNum) as any
      : db.prepare('SELECT * FROM folders WHERE id = ? AND user_id = ?').get(folderIdNum, user.id) as any;

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found or unauthorized' }, { status: 404 });
    }

    // Recursively delete folder and all its contents
    const role = user.role || 'publisher';
    const result = deleteFolderRecursive(folderIdNum, user.id, role);

    // If there were errors but some items were deleted, return partial success
    if (result.errors.length > 0 && (result.deletedFolders > 0 || result.deletedVideos > 0)) {
      return NextResponse.json({
        success: true,
        message: `Folder deleted with some errors. Deleted ${result.deletedFolders} folder(s) and ${result.deletedVideos} video(s).`,
        warnings: result.errors,
        deletedFolders: result.deletedFolders,
        deletedVideos: result.deletedVideos,
      });
    }

    // If there were errors and nothing was deleted, return error
    if (result.errors.length > 0) {
      return NextResponse.json(
        { error: `Failed to delete folder: ${result.errors.join('; ')}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Folder and all contents deleted successfully. Deleted ${result.deletedFolders} folder(s) and ${result.deletedVideos} video(s).`,
      deletedFolders: result.deletedFolders,
      deletedVideos: result.deletedVideos,
    });
  } catch (error: any) {
    console.error('Delete folder error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete folder' },
      { status: 500 }
    );
  }
}


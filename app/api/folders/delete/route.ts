import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { queryAll, queryOne, execute } from '@/lib/pgdb';
import { logActivity } from '@/lib/activity';

export const runtime = 'nodejs';

/**
 * Recursively delete a folder and all its contents (subfolders and videos)
 */
async function deleteFolderRecursive(
  folderId: number,
  userId: number,
  userRole: string
): Promise<{ deletedFolders: number; deletedVideos: number; errors: string[] }> {
  let deletedFoldersCount = 0;
  let deletedVideosCount = 0;
  const errors: string[] = [];

  // Get all subfolders
  const subfolders = userRole === 'superuser'
    ? await queryAll<any>('SELECT id FROM folders WHERE parent_id = $1', [folderId])
    : await queryAll<any>('SELECT id FROM folders WHERE parent_id = $1 AND user_id = $2', [folderId, userId]);

  // Recursively delete all subfolders first
  for (const subfolder of subfolders) {
    try {
      const result = await deleteFolderRecursive(subfolder.id, userId, userRole);
      deletedFoldersCount += result.deletedFolders;
      deletedVideosCount += result.deletedVideos;
      errors.push(...result.errors);
    } catch (error: any) {
      errors.push(`Failed to delete subfolder ${subfolder.id}: ${error.message}`);
    }
  }

  // Get all videos in this folder
  const videos = userRole === 'superuser'
    ? await queryAll<any>('SELECT id, lixstream_file_id FROM videos WHERE folder_id = $1', [folderId])
    : await queryAll<any>('SELECT id, lixstream_file_id FROM videos WHERE folder_id = $1 AND user_id = $2', [folderId, userId]);

  // Delete all videos in this folder (DB-only)
  for (const video of videos) {
    try {
      // Delete video shares first (by video_id and lixstream_file_id)
      if (video.id) {
        await execute('DELETE FROM video_shares WHERE video_id = $1', [video.id.toString()]);
      }
      if (video.lixstream_file_id) {
        await execute('DELETE FROM video_shares WHERE lixstream_file_id = $1', [video.lixstream_file_id]);
        // Optional: mark as deleted in deleted_videos table (still DB-only)
        await execute(
          'INSERT INTO deleted_videos (lixstream_file_id, deleted_by_user_id) VALUES ($1, $2) ON CONFLICT (lixstream_file_id) DO NOTHING',
          [video.lixstream_file_id, userId]
        );
      }

      // Delete the video
      if (userRole === 'superuser') {
        await execute('DELETE FROM videos WHERE id = $1', [video.id]);
      } else {
        await execute('DELETE FROM videos WHERE id = $1 AND user_id = $2', [video.id, userId]);
      }
      deletedVideosCount++;
    } catch (error: any) {
      errors.push(`Failed to delete video ${video.id}: ${error.message}`);
    }
  }

  // Delete folder shares
  try {
    await execute('DELETE FROM folder_shares WHERE folder_id = $1', [folderId]);
  } catch (error: any) {
    errors.push(`Failed to delete folder shares for folder ${folderId}: ${error.message}`);
  }

  // Delete the folder itself
  try {
    if (userRole === 'superuser') {
      await execute('DELETE FROM folders WHERE id = $1', [folderId]);
    } else {
      await execute('DELETE FROM folders WHERE id = $1 AND user_id = $2', [folderId, userId]);
    }
    deletedFoldersCount++;
  } catch (error: any) {
    errors.push(`Failed to delete folder ${folderId}: ${error.message}`);
    throw error; // Re-throw to stop the process if folder deletion fails
  }

  return { deletedFolders: deletedFoldersCount, deletedVideos: deletedVideosCount, errors };
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
      ? await queryOne<any>('SELECT * FROM folders WHERE id = $1', [folderIdNum])
      : await queryOne<any>('SELECT * FROM folders WHERE id = $1 AND user_id = $2', [folderIdNum, user.id]);

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found or unauthorized' }, { status: 404 });
    }

    // Recursively delete folder and all its contents
    const role = user.role || 'publisher';
    const result = await deleteFolderRecursive(folderIdNum, user.id, role);

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

    // Log folder deletion
    await logActivity({
      userId: user.id,
      action: 'delete_folder',
      targetType: 'folder',
      targetId: folderIdNum,
      metadata: {
        deletedFolders: result.deletedFolders,
        deletedVideos: result.deletedVideos,
      },
    });

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


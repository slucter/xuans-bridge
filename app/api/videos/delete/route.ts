import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { execute, queryOne } from '@/lib/pgdb';
import { logActivity } from '@/lib/activity';

export const runtime = 'nodejs';

// Delete single or multiple videos (only from local database, not from Lixstream)
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
    const { video_ids } = await request.json();

    if (!video_ids || !Array.isArray(video_ids) || video_ids.length === 0) {
      return NextResponse.json(
        { error: 'video_ids array is required' },
        { status: 400 }
      );
    }

    let deletedCount = 0;
    const errors: string[] = [];

    const isNumeric = (val: any) => {
      if (typeof val === 'number') return Number.isFinite(val);
      if (typeof val === 'string') return /^\d+$/.test(val);
      return false;
    };

    for (const videoId of video_ids) {
      try {
        // For superuser: delete from local database if exists, also delete shares
        if (user.role === 'superuser') {
          // If numeric, treat as local DB id; if not, treat as lixstream_file_id
          let video: any = null;
          if (isNumeric(videoId)) {
            video = await queryOne<any>('SELECT id, lixstream_file_id FROM videos WHERE id = $1', [Number(videoId)]);
          }
          
          if (video) {
            // Video exists in local database
            // Delete video shares first (by video_id and lixstream_file_id)
            if (video.id) {
              await execute('DELETE FROM video_shares WHERE video_id = $1', [video.id]);
            }
            if (video.lixstream_file_id) {
              // Mark as deleted in deleted_videos table
              await execute('DELETE FROM video_shares WHERE lixstream_file_id = $1', [video.lixstream_file_id]);
              await execute(
                `INSERT INTO deleted_videos (lixstream_file_id, deleted_by_user_id)
                 VALUES ($1, $2)
                 ON CONFLICT (lixstream_file_id) DO NOTHING`,
                [video.lixstream_file_id, user.id]
              );
            }
            
            // Delete from local database
            await execute('DELETE FROM videos WHERE id = $1', [Number(videoId)]);
            deletedCount++;
          } else {
            // Video only exists in Lixstream (not in local DB)
            // videoId is actually lixstream_file_id for videos from Lixstream
            const lixstreamFileId = videoId.toString();
            
            // Mark as deleted in deleted_videos table
            await execute(
              `INSERT INTO deleted_videos (lixstream_file_id, deleted_by_user_id)
               VALUES ($1, $2)
               ON CONFLICT (lixstream_file_id) DO NOTHING`,
              [lixstreamFileId, user.id]
            );
            
            // Delete shares if any
            await execute('DELETE FROM video_shares WHERE video_id = $1 OR lixstream_file_id = $1', [lixstreamFileId]);
            
            deletedCount++;
          }
        } else {
          // Publisher: can only delete their own videos from local database
          let video: any = null;
          if (isNumeric(videoId)) {
            video = await queryOne<any>('SELECT id, lixstream_file_id FROM videos WHERE id = $1 AND user_id = $2', [Number(videoId), user.id]);
          }
          
          if (video) {
            // Delete video shares first
            if (video.id) {
              await execute('DELETE FROM video_shares WHERE video_id = $1', [video.id]);
            }
            if (video.lixstream_file_id) {
              await execute('DELETE FROM video_shares WHERE lixstream_file_id = $1', [video.lixstream_file_id]);
            }
            
            // Delete from local database
            await execute('DELETE FROM videos WHERE id = $1 AND user_id = $2', [Number(videoId), user.id]);
            deletedCount++;
          } else {
            // Check if it's a shared video (cannot delete shared videos - they're from Lixstream)
            const sharedVideo = await queryOne<any>('SELECT 1 FROM video_shares WHERE lixstream_file_id = $1 AND shared_to_user_id = $2', [videoId.toString(), user.id]);
            
            if (sharedVideo) {
              errors.push(`Video ${videoId} cannot be deleted (shared video - contact superuser)`);
            } else {
              errors.push(`Video ${videoId} not found or unauthorized`);
            }
          }
        }
      } catch (error: any) {
        errors.push(`Failed to delete video ${videoId}: ${error.message}`);
      }
    }
    // Log deletion activity (aggregate)
    await logActivity({
      userId: user.id,
      action: 'delete_video',
      targetType: 'video',
      targetId: null,
      metadata: {
        video_ids,
        deletedCount,
        errors_count: errors.length,
        role: user.role,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Deleted ${deletedCount} video(s) from local database`,
      deletedCount,
      errors: errors.length > 0 ? errors : undefined,
      note: 'Videos are only deleted from local database. Original files in Lixstream remain unchanged.',
    });
  } catch (error: any) {
    console.error('Delete videos error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete videos' },
      { status: 500 }
    );
  }
}


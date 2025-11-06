import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import db from '@/lib/db';

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

    for (const videoId of video_ids) {
      try {
        // For superuser: delete from local database if exists, also delete shares
        if (user.role === 'superuser') {
          // Check if video exists in local database (by local id)
          const video = db.prepare('SELECT id, lixstream_file_id FROM videos WHERE id = ?').get(videoId) as any;
          
          if (video) {
            // Video exists in local database
            // Delete video shares first (by video_id and lixstream_file_id)
            if (video.id) {
              db.prepare('DELETE FROM video_shares WHERE video_id = ?').run(video.id.toString());
            }
            if (video.lixstream_file_id) {
              db.prepare('DELETE FROM video_shares WHERE lixstream_file_id = ?').run(video.lixstream_file_id);
              // Mark as deleted in deleted_videos table
              db.prepare('INSERT OR IGNORE INTO deleted_videos (lixstream_file_id, deleted_by_user_id) VALUES (?, ?)').run(video.lixstream_file_id, user.id);
            }
            
            // Delete from local database
            db.prepare('DELETE FROM videos WHERE id = ?').run(videoId);
            deletedCount++;
          } else {
            // Video only exists in Lixstream (not in local DB)
            // videoId is actually lixstream_file_id for videos from Lixstream
            const lixstreamFileId = videoId.toString();
            
            // Mark as deleted in deleted_videos table
            db.prepare('INSERT OR IGNORE INTO deleted_videos (lixstream_file_id, deleted_by_user_id) VALUES (?, ?)').run(lixstreamFileId, user.id);
            
            // Delete shares if any
            db.prepare('DELETE FROM video_shares WHERE video_id = ? OR lixstream_file_id = ?').run(lixstreamFileId, lixstreamFileId);
            
            deletedCount++;
          }
        } else {
          // Publisher: can only delete their own videos from local database
          const video = db
            .prepare('SELECT id, lixstream_file_id FROM videos WHERE id = ? AND user_id = ?')
            .get(videoId, user.id) as any;
          
          if (video) {
            // Delete video shares first
            if (video.id) {
              db.prepare('DELETE FROM video_shares WHERE video_id = ?').run(video.id.toString());
            }
            if (video.lixstream_file_id) {
              db.prepare('DELETE FROM video_shares WHERE lixstream_file_id = ?').run(video.lixstream_file_id);
            }
            
            // Delete from local database
            db.prepare('DELETE FROM videos WHERE id = ? AND user_id = ?').run(videoId, user.id);
            deletedCount++;
          } else {
            // Check if it's a shared video (cannot delete shared videos - they're from Lixstream)
            const sharedVideo = db
              .prepare('SELECT * FROM video_shares WHERE lixstream_file_id = ? AND shared_to_user_id = ?')
              .get(videoId.toString(), user.id) as any;
            
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


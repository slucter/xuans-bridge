import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import db from '@/lib/db';
import { getAllFilesFromLixstream } from '@/lib/lixstream';

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
    // Fetch all files from Lixstream
    const lixstreamFiles = await getAllFilesFromLixstream();
    
    // Get all local folders and videos
    const localFolders = user.role === 'superuser'
      ? db.prepare('SELECT * FROM folders').all() as any[]
      : db.prepare('SELECT * FROM folders WHERE user_id = ?').all(user.id) as any[];
    
    const localVideos = user.role === 'superuser'
      ? db.prepare('SELECT * FROM videos').all() as any[]
      : db.prepare('SELECT * FROM videos WHERE user_id = ?').all(user.id) as any[];

    // Print response from Lixstream API (REMOTE)
    console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
    console.log(`║ RESPONSE DARI LIXSTREAM API (REMOTE)                          ║`);
    console.log(`╚═══════════════════════════════════════════════════════════════╝`);
    console.log(`Total files dari Lixstream API: ${lixstreamFiles.length}`);
    if (lixstreamFiles.length > 0) {
      console.log(`\nSample files dari Lixstream API (first 5):`);
      lixstreamFiles.slice(0, 5).forEach((file, index) => {
        console.log(`  [${index + 1}] Name: "${file.name || file.title || 'Unknown'}"`);
        console.log(`      Code: "${file.code || 'N/A'}"`);
        console.log(`      dir_id: "${file.dir_id || 'null'}" (ini adalah folder ID di Lixstream)`);
        if (file.share_link) console.log(`      Share Link: ${file.share_link}`);
        if (file.embed_link) console.log(`      Embed Link: ${file.embed_link}`);
      });
      
      // Show unique dir_ids from Lixstream
      const uniqueDirIds = Array.from(new Set(lixstreamFiles.filter(f => f.dir_id).map(f => f.dir_id)));
      console.log(`\nUnique dir_id yang ditemukan di Lixstream API:`);
      if (uniqueDirIds.length > 0) {
        uniqueDirIds.forEach((dirId, idx) => {
          console.log(`  [${idx + 1}] "${dirId}"`);
        });
      } else {
        console.log(`  (Tidak ada file dengan dir_id - semua file di root)`);
      }
    } else {
      console.log(`⚠️ Tidak ada file ditemukan di Lixstream API`);
    }
    console.log(`╚═══════════════════════════════════════════════════════════════╝\n`);

    // Print folders data from LOCAL DATABASE
    console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
    console.log(`║ DATA FOLDER DARI DATABASE LOKAL (LOCAL DATABASE)               ║`);
    console.log(`╚═══════════════════════════════════════════════════════════════╝`);
    console.log(`Total folder di database lokal: ${localFolders.length}`);
    if (localFolders.length > 0) {
      localFolders.forEach((folder, index) => {
        console.log(`  [${index + 1}] ID Lokal: ${folder.id}`);
        console.log(`      Nama: "${folder.name}"`);
        console.log(`      lixstream_dir_id: "${folder.lixstream_dir_id || 'null'}" (ini adalah folder ID di Lixstream)`);
        console.log(`      parent_id: ${folder.parent_id || 'null'}`);
        console.log(`      created_at: ${folder.created_at || 'N/A'}`);
        console.log(``);
      });
    } else {
      console.log(`⚠️ Tidak ada folder ditemukan di database lokal`);
    }
    console.log(`╚═══════════════════════════════════════════════════════════════╝\n`);

    // Extract unique dir_ids from Lixstream files
    const lixstreamDirIds = new Set<string>();
    lixstreamFiles.forEach((file) => {
      if (file.dir_id) {
        lixstreamDirIds.add(file.dir_id);
      }
    });

    // Extract file codes (identifiers) from Lixstream files
    // File code is the identifier in the share_link/embed_link (e.g., "16xxxneq" from "/s/16xxxneq")
    const lixstreamFileCodes = new Set<string>();
    lixstreamFiles.forEach((file) => {
      if (file.code) {
        lixstreamFileCodes.add(file.code);
      }
      // Also check share_link and embed_link for file codes
      if (file.share_link) {
        const match = file.share_link.match(/\/s\/([^\/\?]+)/);
        if (match) {
          lixstreamFileCodes.add(match[1]);
        }
      }
      if (file.embed_link) {
        const match = file.embed_link.match(/\/e\/([^\/\?]+)/);
        if (match) {
          lixstreamFileCodes.add(match[1]);
        }
      }
    });

    // Comparison summary
    console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
    console.log(`║ RINGKASAN PERBANDINGAN (COMPARISON SUMMARY)                    ║`);
    console.log(`╚═══════════════════════════════════════════════════════════════╝`);
    console.log(`Total files dari Lixstream API: ${lixstreamFiles.length}`);
    console.log(`Total file codes yang diekstrak: ${lixstreamFileCodes.size}`);
    console.log(`Total video di database lokal: ${localVideos.length}`);
    console.log(`Total folder di database lokal: ${localFolders.length}`);
    console.log(`\nUnique dir_id dari file-file Lixstream:`);
    const dirIdsArray = Array.from(lixstreamDirIds);
    if (dirIdsArray.length > 0) {
      dirIdsArray.slice(0, 10).forEach((dirId, idx) => {
        console.log(`  [${idx + 1}] "${dirId}"`);
      });
      if (dirIdsArray.length > 10) {
        console.log(`  ... dan ${dirIdsArray.length - 10} dir_id lainnya`);
      }
    } else {
      console.log(`  (Tidak ada - semua file di root)`);
    }
    console.log(`\nFolder lokal dengan lixstream_dir_id:`);
    const foldersWithDirId = localFolders.filter(f => f.lixstream_dir_id);
    if (foldersWithDirId.length > 0) {
      foldersWithDirId.forEach((folder, idx) => {
        const existsInLixstream = dirIdsArray.some(dirId => dirId.trim().toLowerCase() === folder.lixstream_dir_id.trim().toLowerCase());
        console.log(`  [${idx + 1}] "${folder.name}" (ID: ${folder.id})`);
        console.log(`      lixstream_dir_id: "${folder.lixstream_dir_id}"`);
        console.log(`      Status: ${existsInLixstream ? '✓ Ditemukan di Lixstream' : '❌ TIDAK ditemukan di Lixstream'}`);
      });
    } else {
      console.log(`  (Tidak ada folder dengan lixstream_dir_id)`);
    }
    console.log(`╚═══════════════════════════════════════════════════════════════╝\n`);

    // Find videos that exist locally but not in Lixstream
    // Match by lixstream_file_id (file code) or by share_link/embed_link
    const videosToDelete: number[] = [];
    const videosToUpdate: Array<{ videoId: number; file: any }> = [];
    
    // Helper function to extract file code from a Lixstream file (consistent with how we build lixstreamFileCodes)
    const getFileCode = (file: any): string | null => {
      if (file.code) return file.code;
      if (file.share_link) {
        const match = file.share_link.match(/\/s\/([^\/\?]+)/);
        if (match) return match[1];
      }
      if (file.embed_link) {
        const match = file.embed_link.match(/\/e\/([^\/\?]+)/);
        if (match) return match[1];
      }
      return null;
    };

    localVideos.forEach((video) => {
      let existsInLixstream = false;
      let matchingFile: any = null;
      
      // Extract file code from video (check lixstream_file_id first, then share_link, then embed_link)
      let videoFileCode: string | null = null;
      if (video.lixstream_file_id) {
        videoFileCode = video.lixstream_file_id;
      } else if (video.file_share_link) {
        const match = video.file_share_link.match(/\/s\/([^\/\?]+)/);
        if (match) videoFileCode = match[1];
      } else if (video.file_embed_link) {
        const match = video.file_embed_link.match(/\/e\/([^\/\?]+)/);
        if (match) videoFileCode = match[1];
      }
      
      // Check if video file code exists in Lixstream
      if (videoFileCode && lixstreamFileCodes.has(videoFileCode)) {
        existsInLixstream = true;
        // Find matching file using the same extraction logic
        matchingFile = lixstreamFiles.find((f) => {
          const fileCode = getFileCode(f);
          return fileCode === videoFileCode;
        });
        if (matchingFile) {
          console.log(`✓ Video "${video.name}" (id: ${video.id}) found in Lixstream with file code: ${videoFileCode}`);
        }
      } else if (videoFileCode) {
        console.log(`❌ Video "${video.name}" (id: ${video.id}) NOT found in Lixstream. File code: ${videoFileCode}`);
        console.log(`   Available file codes in Lixstream:`, Array.from(lixstreamFileCodes).slice(0, 10));
      }
      
      // For videos with status "uploading" (especially remote uploads), check by name and folder
      if (!existsInLixstream && video.upload_status === 'uploading') {
        // Try to match by file name and folder
        // First, get folder's lixstream_dir_id if video has folder_id
        let videoDirId: string | undefined;
        if (video.folder_id) {
          const videoFolder = localFolders.find((f) => f.id === video.folder_id);
          if (videoFolder && videoFolder.lixstream_dir_id) {
            videoDirId = videoFolder.lixstream_dir_id;
          }
        }
        
        const matchingByName = lixstreamFiles.find((f) => {
          // Match by name (check both name and title fields)
          const nameMatches = f.name === video.name || f.title === video.name;
          
          // Match by folder:
          // - If video has no folder (folder_id is null), match files with no dir_id
          // - If video has folder, match files with same dir_id
          const folderMatches = 
            (!video.folder_id && !f.dir_id) || // Both in root
            (videoDirId && f.dir_id === videoDirId); // Both in same folder
          
          return nameMatches && folderMatches;
        });
        
        if (matchingByName) {
          existsInLixstream = true;
          matchingFile = matchingByName;
        } else {
          // Video dengan status "uploading" tidak ditemukan di Lixstream
          // Ini berarti video sudah dihapus atau gagal upload
          // Hapus video ini dari database lokal
          videosToDelete.push(video.id);
        }
      }
      
      // Simple rule: if video exists locally but not in remote, delete it
      // But skip videos that are still uploading (they might not appear in API yet)
      if (!existsInLixstream && video.upload_status !== 'uploading' && (video.lixstream_file_id || video.file_share_link || video.file_embed_link)) {
        // Video dengan identifier tidak ditemukan di Lixstream - hapus dari lokal
        console.log(`🗑️ Video "${video.name}" (id: ${video.id}) not found in Lixstream. File code: ${videoFileCode || 'none'}. Will be deleted.`);
        videosToDelete.push(video.id);
      } else if (existsInLixstream && matchingFile && video.upload_status === 'uploading') {
        // Update video status from uploading to completed
        videosToUpdate.push({ videoId: video.id, file: matchingFile });
      }
    });

    // Find folders that exist locally but not in Lixstream
    // NOTE: Folder deletion via sync is DISABLED.
    // Folders will NOT be deleted even if no files use their dir_id.
    // Folders should only be deleted manually by the user.
    const foldersToDelete: number[] = [];
    console.log(`ℹ️ Folder sync deletion is disabled. Folders will not be deleted by sync.`);

    // Delete folders
    let deletedFoldersCount = 0;
    foldersToDelete.forEach((folderId) => {
      try {
        if (user.role === 'superuser') {
          db.prepare('DELETE FROM folders WHERE id = ?').run(folderId);
        } else {
          db.prepare('DELETE FROM folders WHERE id = ? AND user_id = ?').run(folderId, user.id);
        }
        deletedFoldersCount++;
      } catch (error) {
        console.error(`Failed to delete folder ${folderId}:`, error);
      }
    });

    // Delete videos
    let deletedVideosCount = 0;
    videosToDelete.forEach((videoId) => {
      try {
        if (user.role === 'superuser') {
          db.prepare('DELETE FROM videos WHERE id = ?').run(videoId);
        } else {
          db.prepare('DELETE FROM videos WHERE id = ? AND user_id = ?').run(videoId, user.id);
        }
        deletedVideosCount++;
      } catch (error) {
        console.error(`Failed to delete video ${videoId}:`, error);
      }
    });

    // Update videos from uploading to completed
    let updatedVideosCount = 0;
    videosToUpdate.forEach(({ videoId, file }) => {
      try {
        // Extract file code from file
        const fileCode = file.code || 
          (file.share_link ? file.share_link.match(/\/s\/([^\/\?]+)/)?.[1] : null) ||
          (file.embed_link ? file.embed_link.match(/\/e\/([^\/\?]+)/)?.[1] : null);

        // Extract share_link and embed_link
        const shareLink = file.share_link || null;
        const embedLink = file.embed_link || null;
        const thumbnailUrl = file.thumbnail || null;

        if (user.role === 'superuser') {
          db.prepare(
            `UPDATE videos 
             SET upload_status = 'completed',
                 lixstream_file_id = ?,
                 file_share_link = ?,
                 file_embed_link = ?,
                 thumbnail_url = ?
             WHERE id = ?`
          ).run(fileCode, shareLink, embedLink, thumbnailUrl, videoId);
        } else {
          db.prepare(
            `UPDATE videos 
             SET upload_status = 'completed',
                 lixstream_file_id = ?,
                 file_share_link = ?,
                 file_embed_link = ?,
                 thumbnail_url = ?
             WHERE id = ? AND user_id = ?`
          ).run(fileCode, shareLink, embedLink, thumbnailUrl, videoId, user.id);
        }
        updatedVideosCount++;
      } catch (error) {
        console.error(`Failed to update video ${videoId}:`, error);
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Sync completed successfully',
      stats: {
        lixstreamFilesCount: lixstreamFiles.length,
        localFoldersCount: localFolders.length,
        localVideosCount: localVideos.length,
        deletedFoldersCount,
        deletedVideosCount,
        updatedVideosCount,
      },
    });
  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to sync with Lixstream' },
      { status: 500 }
    );
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { queryAll, queryOne, execute } from '@/lib/pgdb';
import { createUploadTask, confirmUpload, getAllFilesFromLixstream, getFilesByDirFromLixstream } from '@/lib/lixstream';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  console.log('[GET /api/videos] Start request');
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = verifyToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const folderIdParam = searchParams.get('folder_id');
  const pageParam = searchParams.get('page');
  const pageSizeParam = searchParams.get('page_size');
  
  // Handle special case for root folder (folder_id=root means folder_id IS NULL)
  let folderId: number | null | undefined;
  if (folderIdParam === 'root') {
    folderId = null; // Explicitly set to null for root folder
  } else if (folderIdParam) {
    folderId = parseInt(folderIdParam);
  } else {
    folderId = undefined; // No folder filter
  }
  // Fetch latest role from DB to avoid stale JWT after role change
  const dbUser = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [user.id]);
  const effectiveRole = dbUser?.role || user.role || 'publisher';
  console.log('[GET /api/videos] User role:', effectiveRole, 'folderIdParam:', folderIdParam, 'resolved folderId:', folderId, 'page:', pageParam, 'page_size:', pageSizeParam);

  // Superuser can see all videos from Lixstream API directly
  // Publisher only sees their own videos from local database
  let videos;
  if (effectiveRole === 'superuser') {
    // Fetch global files from Lixstream API (used to compute root files)
    const globalFiles = await getAllFilesFromLixstream();
    
    // Get all folders to map dir_id to folder name and local folder_id
    const allFolders = await queryAll<any>('SELECT * FROM folders');
    const folderMapByName = new Map<string, string>(); // Map dir_id (normalized) -> folder name
    const folderMapById = new Map<string, number>(); // Map dir_id (normalized) -> local folder_id
    
    // Normalize dir_id for matching (trim, lowercase)
    const normalizeDirId = (dirId: string | null | undefined): string | null => {
      if (!dirId) return null;
      return dirId.trim().toLowerCase();
    };
    
    allFolders.forEach((f) => {
      if (f.lixstream_dir_id) {
        const normalizedId = normalizeDirId(f.lixstream_dir_id);
        if (normalizedId) {
          folderMapByName.set(normalizedId, f.name);
          folderMapById.set(normalizedId, f.id);
        }
      }
    });

    // Log for debugging
    console.log('=== AVAILABLE FOLDERS IN DATABASE ===');
    allFolders.forEach(f => {
      console.log(`Folder ID: ${f.id}, Name: "${f.name}", lixstream_dir_id: "${f.lixstream_dir_id}"`);
    });
    console.log('=== END FOLDERS IN DATABASE ===\n');
    
    console.log('=== LIXSTREAM API RESPONSE (FILES) ===');
    console.log(`Total files from Lixstream (global): ${globalFiles.length}`);
    console.log('Sample files with dir_id:');
    globalFiles.filter(f => f.dir_id).slice(0, 10).forEach(file => {
      console.log(`  - Name: "${file.name || file.title}", dir_id: "${file.dir_id}", code: "${file.code}"`);
    });
    console.log('Sample files WITHOUT dir_id (root):');
    globalFiles.filter(f => !f.dir_id).slice(0, 5).forEach(file => {
      console.log(`  - Name: "${file.name || file.title}", code: "${file.code}"`);
    });
    console.log('=== END LIXSTREAM API RESPONSE ===\n');

    // Get list of deleted video IDs (lixstream_file_id) to filter out
    const deletedRows = await queryAll<any>('SELECT lixstream_file_id FROM deleted_videos');
    const deletedVideoIds = new Set(
      deletedRows
        .map((d) => d.lixstream_file_id)
        .filter((id): id is string => id !== null && id !== undefined)
    );

    // Fetch files per-folder and convert
    const perFolderFiles: Array<{ folderId: number; folderName: string; dirId: string; files: any[] }> = [];
    for (const f of allFolders) {
      if (!f.lixstream_dir_id) continue;
      try {
        const files = await getFilesByDirFromLixstream(f.lixstream_dir_id);
        perFolderFiles.push({ folderId: f.id, folderName: f.name, dirId: f.lixstream_dir_id, files });
        console.log(`[Per-folder fetch] folder="${f.name}" (localId=${f.id}, dirId=${f.lixstream_dir_id}) -> files=${files.length}`);
      } catch (err) {
        console.warn(`[Per-folder fetch] Failed for folder "${f.name}" (dirId=${f.lixstream_dir_id}):`, err);
      }
    }

    const codesInKnownFolders = new Set<string>();
    for (const pf of perFolderFiles) {
      for (const raw of pf.files) {
        const code = raw?.code || (raw?.share_link ? raw.share_link.match(/\/s\/([^\/\?]+)/)?.[1] : null) || (raw?.embed_link ? raw.embed_link.match(/\/e\/([^\/\?]+)/)?.[1] : null);
        if (code) codesInKnownFolders.add(code);
      }
    }

    // deletedVideoIds already computed above; avoid redeclaration

    const videosFromFolders: any[] = [];
    for (const pf of perFolderFiles) {
      for (const file of pf.files) {
        const fileCode = file?.code || (file?.share_link ? file.share_link.match(/\/s\/([^\/\?]+)/)?.[1] : null) || (file?.embed_link ? file.embed_link.match(/\/e\/([^\/\?]+)/)?.[1] : null);
        if (fileCode && deletedVideoIds.has(fileCode)) continue;
        videosFromFolders.push({
          id: fileCode || `lixstream-${Date.now()}-${Math.random()}`,
          name: file.name || file.title || 'Unknown',
          folder_id: pf.folderId,
          folder_name: pf.folderName,
          lixstream_file_id: fileCode,
          file_share_link: file.share_link || null,
          file_embed_link: file.embed_link || null,
          thumbnail_url: file.thumbnail || null,
          upload_status: 'completed',
          user_id: null,
          created_at: new Date().toISOString(),
        });
      }
    }

    // Root files = global files not in known folders
    const videosFromRoot: any[] = [];
    for (const file of globalFiles) {
      const fileCode = file.code || (file.share_link ? file.share_link.match(/\/s\/([^\/\?]+)/)?.[1] : null) || (file.embed_link ? file.embed_link.match(/\/e\/([^\/\?]+)/)?.[1] : null);
      if (!fileCode) continue;
      if (codesInKnownFolders.has(fileCode)) continue;
      if (deletedVideoIds.has(fileCode)) continue;
      videosFromRoot.push({
        id: fileCode || `lixstream-${Date.now()}-${Math.random()}`,
        name: file.name || file.title || 'Unknown',
        folder_id: null,
        folder_name: 'Root',
        lixstream_file_id: fileCode,
        file_share_link: file.share_link || null,
        file_embed_link: file.embed_link || null,
        thumbnail_url: file.thumbnail || null,
        upload_status: 'completed',
        user_id: null,
        created_at: new Date().toISOString(),
      });
    }

    console.log(`[Aggregate] per-folder videos=${videosFromFolders.length}, root videos=${videosFromRoot.length}`);

    // Also get videos from local database (for recently uploaded videos that may not appear in Lixstream API yet)
    let localVideos: any[] = [];
    if (folderId === null) {
      localVideos = await queryAll<any>(
        `SELECT v.*, 'Root' as folder_name 
         FROM videos v 
         WHERE v.folder_id IS NULL
         ORDER BY v.created_at DESC`
      );
    } else if (folderId !== undefined) {
      localVideos = await queryAll<any>(
        `SELECT v.*, f.name as folder_name 
         FROM videos v 
         LEFT JOIN folders f ON v.folder_id = f.id 
         WHERE v.folder_id = $1
         ORDER BY v.created_at DESC`,
        [folderId]
      );
    } else {
      localVideos = await queryAll<any>(
        `SELECT v.*, f.name as folder_name 
         FROM videos v 
         LEFT JOIN folders f ON v.folder_id = f.id 
         ORDER BY v.created_at DESC`
      );
    }

    // Create a Set of lixstream_file_id from Lixstream API to avoid duplicates
    const lixstreamFileIds = new Set(
      [...videosFromFolders, ...videosFromRoot]
        .map((v) => v.lixstream_file_id)
        .filter((id): id is string => id !== null && id !== undefined)
    );

    // Filter local videos: only include those that are not already in Lixstream API
    // or those that are still uploading (may not appear in API yet)
    const localVideosFiltered = localVideos.filter((v) => {
      // Include if:
      // 1. Video is still uploading (not yet in Lixstream API)
      // 2. Video has lixstream_file_id but not found in Lixstream API (recently uploaded, may have delay)
      // 3. Video doesn't have lixstream_file_id yet (still uploading)
      if (v.upload_status === 'uploading') {
        return true;
      }
      if (v.lixstream_file_id && !lixstreamFileIds.has(v.lixstream_file_id)) {
        return true;
      }
      return false;
    });

    // Convert local videos to Video format
    const localVideosFormatted = localVideosFiltered.map((v) => ({
      id: v.id,
      name: v.name,
      folder_id: v.folder_id,
      folder_name: v.folder_name || (v.folder_id === null ? 'Root' : null),
      lixstream_file_id: v.lixstream_file_id,
      file_share_link: v.file_share_link,
      file_embed_link: v.file_embed_link,
      thumbnail_url: v.thumbnail_url,
      upload_status: v.upload_status,
      user_id: v.user_id,
      created_at: v.created_at,
    }));

    // Combine videos from Lixstream API and local database
    videos = [...videosFromFolders, ...videosFromRoot, ...localVideosFormatted];
    console.log(`[Combine] Lixstream per-folder: ${videosFromFolders.length}, root: ${videosFromRoot.length}, local videos (filtered): ${localVideosFiltered.length}, combined: ${videos.length}`);

    // Filter by folder if specified
    if (folderId === null) {
      const beforeCount = videos.length;
      videos = videos.filter((v) => v.folder_id === null);
      console.log(`[Filter Root] before=${beforeCount}, after=${videos.length}`);
    } else if (folderId !== undefined) {
      // Specific folder: filter by local folder_id
      const beforeCount = videos.length;
      videos = videos.filter((v) => v.folder_id === folderId);
      console.log(`[Filter Folder=${folderId}] before=${beforeCount}, after=${videos.length}`);
    }
    // If folderId is undefined, show all videos (already done)

    // Sort by created_at descending
    videos.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } else {
    // Publisher: see their own videos from database + shared videos from Lixstream
    console.log('[GET /api/videos] Publisher flow');
    // First, get their own videos from database
    let ownVideos: any[] = [];
    if (folderId === null) {
      ownVideos = await queryAll<any>(
        `SELECT v.*, 'Root' as folder_name 
         FROM videos v 
         WHERE v.user_id = $1 AND v.folder_id IS NULL
         ORDER BY v.created_at DESC`,
        [user.id]
      );
    } else if (folderId !== undefined) {
      ownVideos = await queryAll<any>(
        `SELECT v.*, f.name as folder_name 
         FROM videos v 
         LEFT JOIN folders f ON v.folder_id = f.id 
         WHERE v.user_id = $1 AND v.folder_id = $2
         ORDER BY v.created_at DESC`,
        [user.id, folderId]
      );
    } else {
      ownVideos = await queryAll<any>(
        `SELECT v.*, f.name as folder_name 
         FROM videos v 
         LEFT JOIN folders f ON v.folder_id = f.id 
         WHERE v.user_id = $1
         ORDER BY v.created_at DESC`,
        [user.id]
      );
    }

    // Get shared video IDs
    const sharedVideoIds = await queryAll<any>(
      'SELECT DISTINCT lixstream_file_id FROM video_shares WHERE shared_to_user_id = $1',
      [user.id]
    );

    if (sharedVideoIds.length > 0) {
      // Fetch shared videos from Lixstream
      const lixstreamFiles = await getAllFilesFromLixstream();
      const sharedFileIds = new Set(sharedVideoIds.map((s) => s.lixstream_file_id));
      
      // Get all folders to map dir_id to folder name
      const allFolders = await queryAll<any>(
        `SELECT DISTINCT f.* 
         FROM folders f 
         LEFT JOIN folder_shares fs ON fs.folder_id = f.id AND fs.shared_to_user_id = $1
         WHERE f.user_id = $2 OR fs.shared_to_user_id = $3`,
        [user.id, user.id, user.id]
      );
      
      const folderMap = new Map<string, string>();
      allFolders.forEach((f) => {
        if (f.lixstream_dir_id) {
          folderMap.set(f.lixstream_dir_id, f.name);
        }
      });

      // Filter shared videos from Lixstream
      const sharedVideos = lixstreamFiles
        .filter((file) => {
          const fileCode = file.code || 
            (file.share_link ? file.share_link.match(/\/s\/([^\/\?]+)/)?.[1] : null) ||
            (file.embed_link ? file.embed_link.match(/\/e\/([^\/\?]+)/)?.[1] : null);
          return fileCode && sharedFileIds.has(fileCode);
        })
        .map((file) => {
          const fileCode = file.code || 
            (file.share_link ? file.share_link.match(/\/s\/([^\/\?]+)/)?.[1] : null) ||
            (file.embed_link ? file.embed_link.match(/\/e\/([^\/\?]+)/)?.[1] : null);
          
          // If dir_id exists but not mapped, use placeholder to avoid displaying as Root
          const folderName = file.dir_id ? folderMap.get(file.dir_id) || '(Unmapped Folder)' : 'Root';
          const localFolder = allFolders.find((f) => f.lixstream_dir_id === file.dir_id);

          return {
            id: fileCode || `lixstream-${Date.now()}-${Math.random()}`,
            name: file.name || file.title || 'Unknown',
            folder_id: localFolder?.id || null,
            folder_name: folderName,
            lixstream_file_id: fileCode,
            file_share_link: file.share_link || null,
            file_embed_link: file.embed_link || null,
            thumbnail_url: file.thumbnail || null,
            upload_status: 'completed',
            user_id: null, // Shared video, not owned by publisher
            created_at: new Date().toISOString(),
            is_shared: true, // Flag to indicate this is a shared video
          };
        });

      // Filter shared videos by folder if specified
      let filteredSharedVideos = sharedVideos;
      if (folderId === null) {
        filteredSharedVideos = sharedVideos.filter((v) => !v.folder_id);
      } else if (folderId !== undefined) {
        filteredSharedVideos = sharedVideos.filter((v) => v.folder_id === folderId);
      }

      // Combine own videos and shared videos
      videos = [...ownVideos, ...filteredSharedVideos];
      console.log(`[Combine Publisher] own=${ownVideos.length}, shared=${filteredSharedVideos.length}, combined=${videos.length}`);
      
      // Sort by created_at descending
      videos.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      videos = ownVideos;
    }
  }

  // Apply pagination
  const page = Math.max(1, parseInt(pageParam || '1', 10) || 1);
  const pageSize = Math.max(1, parseInt(pageSizeParam || '15', 10) || 15);
  const total = Array.isArray(videos) ? videos.length : 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = Math.min((page - 1) * pageSize, total);
  const pagedVideos = Array.isArray(videos) ? videos.slice(startIndex, startIndex + pageSize) : [];
  console.log('[GET /api/videos] End request, total:', total, 'page:', page, 'pageSize:', pageSize, 'returned:', pagedVideos.length);
  return NextResponse.json({ 
    videos: pagedVideos,
    pagination: { page, page_size: pageSize, total, total_pages: totalPages }
  });
}

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
    const contentType = request.headers.get('content-type') || '';
    let fileName: string | undefined;
    let folderIdStr: string | null = null;

    if (contentType.includes('application/json')) {
      const { name, folder_id } = await request.json();
      if (!name || typeof name !== 'string') {
        return NextResponse.json({ error: 'File name is required' }, { status: 400 });
      }
      fileName = name;
      folderIdStr = folder_id !== undefined && folder_id !== null ? String(folder_id) : null;
    } else {
      // Fallback: support multipart/form-data for backward compatibility
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const nameFromForm = (formData.get('name') as string) || file?.name;
      folderIdStr = formData.get('folder_id') as string | null;
      if (!nameFromForm) {
        return NextResponse.json({ error: 'File name is required' }, { status: 400 });
      }
      fileName = nameFromForm;
    }

    // Get lixstream_dir_id if folder is selected
    let lixstreamDirId: string | undefined;
    let localFolderId: number | null = null;
    
    if (folderIdStr) {
      localFolderId = parseInt(folderIdStr);
      // Get folder's lixstream_dir_id
      // For superuser, don't filter by user_id since they can see all folders
      const folder = user.role === 'superuser'
        ? await queryOne<any>('SELECT lixstream_dir_id FROM folders WHERE id = $1', [localFolderId])
        : await queryOne<any>('SELECT lixstream_dir_id FROM folders WHERE id = $1 AND user_id = $2', [localFolderId, user.id]);
      
      if (folder) {
        lixstreamDirId = folder.lixstream_dir_id;
      }
    }

    // Step 1: Create upload task
    const uploadTask = await createUploadTask(String(fileName), lixstreamDirId);

    // Save video record to database
    const videoResult = await execute(
      `INSERT INTO videos (user_id, folder_id, name, lixstream_upload_id, upload_status) 
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.id,
        localFolderId,
        String(fileName),
        uploadTask.data.id,
        'uploading',
      ]
    );

    const videoId = videoResult.lastInsertRowid;

    return NextResponse.json({
      success: true,
      uploadTask: uploadTask.data,
      videoId,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create upload task' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = verifyToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { videoId, uploadId, result, fileData } = await request.json();

    if (!videoId || !uploadId) {
      return NextResponse.json(
        { error: 'Video ID and Upload ID are required' },
        { status: 400 }
      );
    }

    // Step 3: Confirm upload
    const callbackResponse = await confirmUpload(uploadId, result || true);

    // Extract file_id from share_link or embed_link if available
    // share_link format: https://xxx.xxxx.com/s/16xxxneq
    // embed_link format: https://xxx.xxxx.com/e/16xxxneq
    // The file code is the identifier after /s/ or /e/
    let lixstreamFileId: string | null = null;
    if (callbackResponse.data.file_share_link) {
      const match = callbackResponse.data.file_share_link.match(/\/s\/([^\/\?]+)/);
      if (match) {
        lixstreamFileId = match[1];
      }
    } else if (callbackResponse.data.file_embed_link) {
      const match = callbackResponse.data.file_embed_link.match(/\/e\/([^\/\?]+)/);
      if (match) {
        lixstreamFileId = match[1];
      }
    }

    // Update video record
    const video = await queryOne<any>('SELECT folder_id FROM videos WHERE id = $1', [videoId]);
    
    // Update folder share link if dir_share_link is available
    if (callbackResponse.data.dir_share_link && video?.folder_id) {
      await execute('UPDATE folders SET folder_share_link = $1 WHERE id = $2', [
        callbackResponse.data.dir_share_link,
        video.folder_id,
      ]);
    }

    await execute(
      `UPDATE videos 
       SET upload_status = $1, 
           lixstream_file_id = $2,
           file_share_link = $3, 
           file_embed_link = $4,
           thumbnail_url = $5
       WHERE id = $6 AND user_id = $7`,
      [
        result ? 'completed' : 'failed',
        lixstreamFileId,
        callbackResponse.data.file_share_link || null,
        callbackResponse.data.file_embed_link || null,
        callbackResponse.data.thumbnail_url || null,
        videoId,
        user.id,
      ]
    );

    return NextResponse.json({
      success: true,
      data: callbackResponse.data,
    });
  } catch (error: any) {
    console.error('Confirm upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to confirm upload' },
      { status: 500 }
    );
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { queryOne, execute } from '@/lib/pgdb';
import { remoteUpload } from '@/lib/lixstream';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = verifyToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only superuser can use remote upload
  if (user.role !== 'superuser') {
    return NextResponse.json(
      { error: 'Only superuser can use remote upload' },
      { status: 403 }
    );
  }

  try {
    const { url, name, folder_id } = await request.json();

    if (!url || !name) {
      return NextResponse.json(
        { error: 'URL and name are required' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Get lixstream_dir_id if folder is selected
    let lixstreamDirId: string | undefined;
    let localFolderId: number | null = null;
    
    if (folder_id) {
      localFolderId = parseInt(folder_id.toString());
      // Get folder's lixstream_dir_id
      // For superuser, don't filter by user_id since they can see all folders
      const folder = user.role === 'superuser'
        ? await queryOne<any>('SELECT id, lixstream_dir_id, name FROM folders WHERE id = $1', [localFolderId])
        : await queryOne<any>('SELECT id, lixstream_dir_id, name FROM folders WHERE id = $1 AND user_id = $2', [localFolderId, user.id]);

      if (folder) {
        if (folder.lixstream_dir_id) {
          lixstreamDirId = folder.lixstream_dir_id;
          console.log(`Found folder "${folder.name}" (id: ${localFolderId}) with lixstream_dir_id: ${lixstreamDirId}`);
        } else {
          console.warn(`Folder "${folder.name}" (id: ${localFolderId}) found but has no lixstream_dir_id`);
          return NextResponse.json(
            { error: `Folder "${folder.name}" has no Lixstream directory ID. Please recreate the folder.` },
            { status: 400 }
          );
        }
      } else {
        console.warn(`Folder with id ${localFolderId} not found`);
        return NextResponse.json(
          { error: `Folder not found` },
          { status: 404 }
        );
      }
    }

    console.log(`Remote upload: folder_id=${folder_id}, lixstreamDirId=${lixstreamDirId || 'null (root)'}`);

    // Call Lixstream remote upload API
    const remoteUploadResponse = await remoteUpload(url, name, lixstreamDirId);

    // Log response for debugging
    console.log('Remote upload response:', JSON.stringify(remoteUploadResponse, null, 2));

    // Check if response is valid
    if (!remoteUploadResponse || !remoteUploadResponse.data) {
      console.error('Invalid remote upload response:', remoteUploadResponse);
      throw new Error('Invalid response from Lixstream API. Response: ' + JSON.stringify(remoteUploadResponse));
    }

    // Check if response indicates success
    if (remoteUploadResponse.code !== 200) {
      throw new Error(remoteUploadResponse.msg || 'Failed to create remote upload task');
    }

    const taskId = remoteUploadResponse.data.id;
    if (!taskId) {
      throw new Error('Task ID not returned from Lixstream API');
    }

    // Update folder share link if dir_share_link is available and folder_id is provided
    if (remoteUploadResponse.data.dir_share_link && localFolderId) {
      await execute('UPDATE folders SET folder_share_link = $1 WHERE id = $2', [
        remoteUploadResponse.data.dir_share_link,
        localFolderId,
      ]);
    }

    // Remote upload does not save to database
    // Superuser will see videos directly from Lixstream API

    return NextResponse.json({
      success: true,
      taskId,
      dirShareLink: remoteUploadResponse.data.dir_share_link || null,
    });
  } catch (error: any) {
    console.error('Remote upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create remote upload task' },
      { status: 500 }
    );
  }
}


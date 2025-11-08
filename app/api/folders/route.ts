import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { queryAll, queryOne, execute } from '@/lib/pgdb';
import { createFolder as createLixstreamFolder } from '@/lib/lixstream';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = verifyToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dbUser = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [user.id]);
  const effectiveRole = dbUser?.role || user.role || 'publisher';

  // Superuser can see all folders, publisher sees their own + shared folders
  const allFolders = effectiveRole === 'superuser'
    ? await queryAll<any>('SELECT * FROM folders ORDER BY created_at DESC')
    : await queryAll<any>(
        `SELECT DISTINCT f.*
         FROM folders f
         LEFT JOIN folder_shares fs ON fs.folder_id = f.id AND fs.shared_to_user_id = $1
         WHERE f.user_id = $2 OR fs.shared_to_user_id = $3
         ORDER BY f.created_at DESC`,
        [user.id, user.id, user.id]
      );

  // Check if there are videos in root folder (folder_id = null)
  const rootVideosCount = effectiveRole === 'superuser'
    ? Number((await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM videos WHERE folder_id IS NULL'))?.count || 0)
    : Number((await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM videos WHERE folder_id IS NULL AND user_id = $1', [user.id]))?.count || 0);

  // Build nested structure
  const folderMap = new Map<number, any>();
  const rootFolders: any[] = [];

  // First pass: create map
  allFolders.forEach((folder) => {
    folder.children = [];
    folderMap.set(folder.id, folder);
  });

  // Second pass: build tree
  allFolders.forEach((folder) => {
    // Handle both null and undefined for parent_id
    const parentId = folder.parent_id ?? null;
    if (parentId && folderMap.has(parentId)) {
      folderMap.get(parentId).children.push(folder);
    } else {
      rootFolders.push(folder);
    }
  });

  // Build path for each folder
  const buildPath = (folder: any, path: string = ''): string => {
    const currentPath = path ? `${path} / ${folder.name}` : folder.name;
    if (folder.children && folder.children.length > 0) {
      folder.children.forEach((child: any) => {
        child.path = buildPath(child, currentPath);
      });
    }
    return currentPath;
  };

  rootFolders.forEach((folder) => {
    folder.path = buildPath(folder);
  });

  // Add virtual "Root" folder - always show it, even if there are no folders or videos
  // All folders with parent_id = null should be children of Root folder
  const rootFolder: any = {
    id: null, // Use null as ID to identify root folder
    name: 'Root',
    path: 'Root',
    parent_id: null,
    lixstream_dir_id: null,
    user_id: user.id,
    created_at: null,
    children: [...rootFolders], // All folders without parent become children of Root
    isRoot: true, // Flag to identify virtual root folder
  };
  // Build path for children of Root
  rootFolder.children.forEach((child: any) => {
    child.path = `Root / ${child.name}`;
  });
  // Return only Root folder as the single root item
  return NextResponse.json({ folders: [rootFolder], allFolders });
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
  const dbUser2 = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [user.id]);
  const effectiveRole2 = dbUser2?.role || user.role || 'publisher';

  try {
    const { name, parent_id } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
    }

    // Normalize parent_id: convert empty string, undefined, or 0 to null
    const normalizedParentId = parent_id && parent_id !== '' && parent_id !== 0 
      ? parseInt(parent_id.toString()) 
      : null;

    // Get parent folder's lixstream_dir_id if parent_id is provided
    let parentLixstreamId: string | undefined;
    if (normalizedParentId) {
      // For superuser, don't filter by user_id
      const parentFolder = effectiveRole2 === 'superuser'
        ? await queryOne<any>('SELECT lixstream_dir_id FROM folders WHERE id = $1', [normalizedParentId])
        : await queryOne<any>('SELECT lixstream_dir_id FROM folders WHERE id = $1 AND user_id = $2', [normalizedParentId, user.id]);
      
      if (!parentFolder) {
        return NextResponse.json({ error: 'Parent folder not found' }, { status: 400 });
      }
      parentLixstreamId = parentFolder.lixstream_dir_id;
    }

    // Create folder in Lixstream
    const lixstreamResponse = await createLixstreamFolder(name.trim(), parentLixstreamId);
    const lixstreamDirId = lixstreamResponse.data.dir_id;

    // Save to Postgres database
    const result = await execute(
      'INSERT INTO folders (user_id, name, parent_id, lixstream_dir_id) VALUES ($1, $2, $3, $4)',
      [user.id, name.trim(), normalizedParentId, lixstreamDirId]
    );

    return NextResponse.json({
      success: true,
      folder: {
        id: result.lastInsertRowid,
        name: name.trim(),
        parent_id: normalizedParentId,
        lixstream_dir_id: lixstreamDirId,
      },
    });
  } catch (error: any) {
    console.error('Create folder error:', error);
    const errorMessage = error.response?.data?.error || error.message || 'Failed to create folder';
    console.error('Error details:', {
      message: errorMessage,
      stack: error.stack,
      name: error.name,
    });
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}


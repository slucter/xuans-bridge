import axios from 'axios';
import { getSettingAsync } from './settings';

async function getLixstreamApiUrl(): Promise<string> {
  return (await getSettingAsync('lixstream_api_url', 'LIXSTREAM_API_URL')) || 'https://api.luxsioab.com/pub/api';
}

async function getLixstreamApiKey(): Promise<string> {
  return (await getSettingAsync('lixstream_api_key', 'LIXSTREAM_API_KEY')) || '';
}

export interface CreateUploadTaskResponse {
  data: {
    url: string;
    header: {
      'Content-Type': string;
    };
    id: string;
  };
  code: number;
  msg: string;
  timestamp: string;
}

export interface UploadCallbackResponse {
  data: {
    file_name: string;
    thumbnail_url?: string;
    screenshots?: string[];
    dir_share_link?: string;
    file_share_link?: string;
    file_embed_link?: string;
  };
  code: number;
  msg: string;
  timestamp: string;
}

export interface CreateFolderResponse {
  data: {
    dir_id: string;
  };
  code: number;
  msg: string;
  timestamp: string;
}

export interface RemoteUploadResponse {
  data: {
    id: string;
    dir_share_link?: string;
  };
  code: number;
  msg: string;
  timestamp: string;
}

// Get all files from Lixstream (paginated)
// Based on API docs, response structure:
// {
//   "data": {
//     "files": [
//       {
//         "code": "16xxxneq",  // This is the file identifier
//         "name": "file.mp4",
//         "share_link": "https://xxx.xxxx.com/s/16xxxneq",
//         "embed_link": "https://xxx.xxxx.com/e/16xxxneq",
//         "thumbnail": "...",
//         ...
//       }
//     ],
//     "total": 100,
//     ...
//   }
// }
export interface LixstreamFile {
  code: string; // File identifier
  name: string;
  title?: string; // Display title (may differ from name)
  share_link?: string;
  embed_link?: string;
  thumbnail?: string;
  dir_id?: string; // Directory ID if file is in a folder
}

export interface FileListResponse {
  data: {
    files: LixstreamFile[];
    total?: number;
    total_pages?: number;
    total_elements?: number;
    page_num?: number;
    page_size?: number;
  };
  code: number;
  msg: string;
  timestamp: string;
}

// Step 1: Create upload task
export async function createUploadTask(
  fileName: string,
  dirId?: string
): Promise<CreateUploadTaskResponse> {
  const LIXSTREAM_API_URL = await getLixstreamApiUrl();
  const LIXSTREAM_API_KEY = await getLixstreamApiKey();
  
  const response = await axios.post(
    `${LIXSTREAM_API_URL}/local/upload`,
    {
      key: LIXSTREAM_API_KEY,
      name: fileName,
      dir_id: dirId || null,
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data;
}

// Step 2: Upload file to object storage (handled by client)
// Step 3: Callback to confirm upload
export async function confirmUpload(
  uploadId: string,
  result: boolean
): Promise<UploadCallbackResponse> {
  const LIXSTREAM_API_URL = await getLixstreamApiUrl();
  const LIXSTREAM_API_KEY = await getLixstreamApiKey();
  
  const response = await axios.post(
    `${LIXSTREAM_API_URL}/local/upload/callback`,
    {
      key: LIXSTREAM_API_KEY,
      id: uploadId,
      result,
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data;
}

// Create folder
export async function createFolder(name: string, parentId?: string): Promise<CreateFolderResponse> {
  const LIXSTREAM_API_URL = await getLixstreamApiUrl();
  const LIXSTREAM_API_KEY = await getLixstreamApiKey();
  
  try {
    const response = await axios.post(
      `${LIXSTREAM_API_URL}/directory/create`,
      {
        key: LIXSTREAM_API_KEY,
        name,
        parent_id: parentId || null,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (response.data.code !== 200) {
      throw new Error(response.data.msg || 'Failed to create folder in Lixstream');
    }
    
    return response.data;
  } catch (error: any) {
    if (error.response?.data) {
      throw new Error(error.response.data.msg || error.response.data.error || 'Failed to create folder in Lixstream');
    }
    throw error;
  }
}

// Remote upload
export async function remoteUpload(
  url: string,
  name: string,
  dirId?: string
): Promise<RemoteUploadResponse> {
  const LIXSTREAM_API_URL = await getLixstreamApiUrl();
  const LIXSTREAM_API_KEY = await getLixstreamApiKey();
  
  try {
    // Build request body - only include dir_id if it's provided and not null
    const requestBody: any = {
      key: LIXSTREAM_API_KEY,
      name,
      url,
    };
    
    // Only add dir_id if it's provided and not null/undefined
    if (dirId) {
      requestBody.dir_id = dirId;
    }
    
    console.log('Remote upload request body:', JSON.stringify(requestBody, null, 2));
    
    const response = await axios.post(
      `${LIXSTREAM_API_URL}/remote/upload`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    console.log('Remote upload response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.code !== 200) {
      const errorMsg = response.data.msg || 'Failed to create remote upload task';
      console.error('Remote upload failed:', errorMsg, response.data);
      throw new Error(errorMsg);
    }
    
    return response.data;
  } catch (error: any) {
    console.error('Remote upload error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      statusText: error.response?.statusText,
    });
    
    if (error.response?.data) {
      const errorMsg = error.response.data.msg || error.response.data.error || 'Failed to create remote upload task';
      throw new Error(errorMsg);
    }
    throw new Error(error.message || 'Failed to create remote upload task');
  }
}

// Get all files from Lixstream (paginated)
export async function getAllFilesFromLixstream(): Promise<LixstreamFile[]> {
  const LIXSTREAM_API_URL = await getLixstreamApiUrl();
  const LIXSTREAM_API_KEY = await getLixstreamApiKey();
  
  const allFiles: LixstreamFile[] = [];
  let pageNum = 1;
  const pageSize = 100; // Maximum page size
  
  while (true) {
    try {
      const response = await axios.post(
        `${LIXSTREAM_API_URL}/file/page`,
        {
          key: LIXSTREAM_API_KEY,
          page_num: pageNum,
          page_size: pageSize,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.data.code !== 200) {
        throw new Error(response.data.msg || 'Failed to fetch files from Lixstream');
      }
      
      const files = response.data.data?.files || [];
      if (files.length === 0) {
        break; // No more files
      }
      
      // Log response for debugging (only first page)
      if (pageNum === 1) {
        console.log('=== LIXSTREAM API RESPONSE (RAW) ===');
        console.log('Page:', pageNum);
        console.log('Total elements:', response.data.data?.total_elements || response.data.data?.total || 0);
        console.log('Total pages:', response.data.data?.total_pages || 0);
        console.log('Files in this page:', files.length);
        console.log('Sample file objects:', JSON.stringify(files.slice(0, 3), null, 2));
        console.log('=== END RAW RESPONSE ===\n');
      }
      
      // Normalize file shape to ensure dir_id and code are consistently available
      const normalized = files.map((raw: any) => {
        // Extract/normalize dir_id from possible variant keys
        const rawDirId =
          raw?.dir_id ??
          raw?.dirId ??
          raw?.dirID ??
          raw?.directory_id ??
          raw?.dir_code ??
          raw?.dirCode ??
          raw?.dir_id_str ??
          raw?.dirIdStr ??
          raw?.parent_dir_id ??
          raw?.parentId;

        const dir_id = rawDirId != null && rawDirId !== '' ? String(rawDirId) : undefined;

        // Extract code from share/embed links if not present
        let code: string | undefined = raw?.code;
        if (!code && typeof raw?.share_link === 'string') {
          const m = raw.share_link.match(/\/s\/([^\/\?]+)/);
          if (m) code = m[1];
        }
        if (!code && typeof raw?.embed_link === 'string') {
          const m = raw.embed_link.match(/\/e\/([^\/\?]+)/);
          if (m) code = m[1];
        }

        return {
          ...raw,
          code,
          dir_id,
        } as LixstreamFile;
      });

      allFiles.push(...normalized);
      
      // Check if there are more pages
      const totalElements = response.data.data?.total_elements || response.data.data?.total || 0;
      const totalPages = response.data.data?.total_pages || Math.ceil(totalElements / pageSize);
      
      if (pageNum >= totalPages || files.length < pageSize) {
        break; // All files fetched
      }
      
      pageNum++;
    } catch (error: any) {
      if (error.response?.data) {
        throw new Error(error.response.data.msg || error.response.data.error || 'Failed to fetch files from Lixstream');
      }
      throw error;
    }
  }
  
  return allFiles;
}

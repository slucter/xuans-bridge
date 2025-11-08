'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Folder, User } from '@/types';
import { Link, X, CheckCircle, AlertCircle, Loader2, Info } from 'lucide-react';

interface RemoteUploadProps {
  folders: Folder[];
  selectedFolder: Folder | null;
  onFolderSelect: (folder: Folder | null) => void;
  onUploadSuccess: () => void;
  user?: User;
}

interface RemoteUploadItem {
  id: string;
  url: string;
  name: string;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
  taskId?: string;
}

export default function RemoteUpload({
  folders,
  selectedFolder,
  onFolderSelect,
  onUploadSuccess,
  user,
}: RemoteUploadProps) {
  const [urls, setUrls] = useState<string>('');
  const [uploadFolderId, setUploadFolderId] = useState<number | null>(selectedFolder?.id || null);
  const [uploadItems, setUploadItems] = useState<RemoteUploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showRules, setShowRules] = useState(false);

  // Flatten folders for dropdown
  const flattenFolders = (folders: Folder[], result: Folder[] = [], prefix: string = ''): Folder[] => {
    folders.forEach((folder) => {
      result.push({ ...folder, displayName: prefix + folder.name });
      if (folder.children && folder.children.length > 0) {
        flattenFolders(folder.children, result, prefix + folder.name + ' / ');
      }
    });
    return result;
  };

  const allFoldersFlat = flattenFolders(folders);

  // Update uploadFolderId when selectedFolder changes
  useEffect(() => {
    if (selectedFolder) {
      setUploadFolderId(selectedFolder.id);
    }
  }, [selectedFolder?.id]);

  const parseUrls = (urlText: string): string[] => {
    return urlText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && isValidUrl(line));
  };

  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const extractFileName = (url: string): string => {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const fileName = pathname.split('/').pop() || 'video.mp4';
      return fileName.includes('.') ? fileName : `${fileName}.mp4`;
    } catch {
      return 'video.mp4';
    }
  };

  const handleUpload = async () => {
    const urlList = parseUrls(urls);
    
    if (urlList.length === 0) {
      alert('Please enter at least one valid URL');
      return;
    }

    if (urlList.length > 20) {
      alert('Maximum 20 URLs allowed at a time');
      return;
    }

    // Initialize upload items
    const items: RemoteUploadItem[] = urlList.map((url, index) => ({
      id: `${Date.now()}-${index}`,
      url,
      name: extractFileName(url),
      status: 'pending',
    }));

    setUploadItems(items);
    setIsUploading(true);

    // Upload each URL sequentially
    let completedCount = 0;
    let failedCount = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      try {
        // Update status to uploading
        setUploadItems((prev) => {
          const updated = [...prev];
          const index = updated.findIndex((it) => it.id === item.id);
          if (index !== -1) {
            updated[index] = { ...updated[index], status: 'uploading' };
          }
          return updated;
        });

        // Call remote upload API
        // Pass folder_id directly - API will handle lixstream_dir_id lookup
        // Ensure we pass null if uploadFolderId is null (for root folder)
        const folderIdToSend = uploadFolderId === null ? null : uploadFolderId;
        
        console.log(`Remote upload request: url=${item.url}, name=${item.name}, folder_id=${folderIdToSend}`);
        
        const response = await axios.post('/api/videos/remote', {
          url: item.url,
          name: item.name,
          folder_id: folderIdToSend,
        });

        // Update status to completed
        setUploadItems((prev) => {
          const updated = [...prev];
          const index = updated.findIndex((it) => it.id === item.id);
          if (index !== -1) {
            updated[index] = {
              ...updated[index],
              status: 'completed',
              taskId: response.data.taskId,
            };
          }
          return updated;
        });
        completedCount++;
      } catch (error: any) {
        // Update status to error
        setUploadItems((prev) => {
          const updated = [...prev];
          const index = updated.findIndex((it) => it.id === item.id);
          if (index !== -1) {
            updated[index] = {
              ...updated[index],
              status: 'error',
              error: error.response?.data?.error || error.message || 'Upload failed',
            };
          }
          return updated;
        });
        failedCount++;
      }
    }

    setIsUploading(false);

    // Check if all completed and trigger success callback
    if (completedCount + failedCount === items.length) {
      setTimeout(() => {
        onUploadSuccess();
      }, 2000);
    }
  };

  const handleClear = () => {
    setUrls('');
    setUploadItems([]);
  };

  const urlCount = parseUrls(urls).length;
  const completedCount = uploadItems.filter((item) => item.status === 'completed').length;
  const errorCount = uploadItems.filter((item) => item.status === 'error').length;
  const pendingCount = uploadItems.filter((item) => item.status === 'pending' || item.status === 'uploading').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Remote Upload
        </h2>
        <button
          onClick={() => setShowRules(!showRules)}
          className="px-4 py-2 text-sm bg-yellow-500 hover:bg-yellow-600 text-gray-900 rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <Info className="h-4 w-4" />
          Upload rules
        </button>
      </div>

      {showRules && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <h3 className="font-semibold text-yellow-900 dark:text-yellow-200 mb-2">Upload Rules:</h3>
          <ul className="list-disc list-inside text-sm text-yellow-800 dark:text-yellow-300 space-y-1">
            <li>Enter one URL per line</li>
            <li>Maximum 20 URLs can be uploaded at a time</li>
            <li>Only valid HTTP/HTTPS URLs are accepted</li>
            <li>The file name will be extracted from the URL automatically</li>
            <li>Remote upload may take some time depending on file size and source server speed</li>
          </ul>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-6">
        {/* Folder Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Upload to:
          </label>
          <div className="flex gap-2">
            <select
              value={uploadFolderId || ''}
              onChange={(e) => setUploadFolderId(e.target.value ? parseInt(e.target.value) : null)}
              disabled={isUploading}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white disabled:opacity-50"
            >
              <option value="">Root (All file)</option>
              {allFoldersFlat.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {(folder as any).displayName || folder.path || folder.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                // You can add folder selection modal here if needed
              }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
              title="Select folder"
            >
              📁
            </button>
          </div>
        </div>

        {/* URL Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            URL <span className="text-red-500">*</span>{' '}
            <span className="text-xs text-gray-500 dark:text-gray-400">
              (Up to 20 links can be uploaded at a time)
            </span>
          </label>
          <textarea
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            disabled={isUploading}
            rows={8}
            placeholder="Please fill in the link (please enter one link per line)"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white disabled:opacity-50 font-mono text-sm"
          />
          {urlCount > 0 && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {urlCount} URL(s) detected
            </p>
          )}
        </div>

        {/* Upload Status List */}
        {uploadItems.length > 0 && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Upload Status ({uploadItems.length})
              </h3>
              <div className="flex gap-2 text-xs text-gray-500 dark:text-gray-400">
                {completedCount > 0 && (
                  <span className="text-green-600 dark:text-green-400">
                    ✓ {completedCount} completed
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="text-red-600 dark:text-red-400">
                    ✗ {errorCount} failed
                  </span>
                )}
                {pendingCount > 0 && (
                  <span className="text-blue-600 dark:text-blue-400">
                    ⏳ {pendingCount} pending
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {uploadItems.map((item) => (
                <div
                  key={item.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {item.status === 'completed' && (
                          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                        )}
                        {item.status === 'error' && (
                          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                        )}
                        {item.status === 'uploading' && (
                          <Loader2 className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-spin flex-shrink-0" />
                        )}
                        {item.status === 'pending' && (
                          <div className="h-5 w-5 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {item.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {item.url}
                          </p>
                        </div>
                      </div>
                      {item.error && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                          {item.error}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleUpload}
            disabled={isUploading || urlCount === 0 || urlCount > 20}
            className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              <>
                <Link className="h-5 w-5" />
                <span>OK</span>
              </>
            )}
          </button>
          {!isUploading && (
            <button
              onClick={handleClear}
              className="px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


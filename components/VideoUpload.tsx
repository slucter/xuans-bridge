'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Folder, User } from '@/types';
import { Upload, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import RemoteUpload from './RemoteUpload';

interface VideoUploadProps {
  folders: Folder[];
  selectedFolder: Folder | null;
  onFolderSelect: (folder: Folder | null) => void;
  onUploadSuccess: () => void;
  user?: User;
}

interface UploadFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  progress: number;
  error?: string;
  videoId?: number;
}

export default function VideoUpload({
  folders,
  selectedFolder,
  onFolderSelect,
  onUploadSuccess,
  user,
}: VideoUploadProps) {
  type UIFolder = Folder & { displayName?: string };
  const [uploadType, setUploadType] = useState<'local' | 'remote'>('local');
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [uploadFolderId, setUploadFolderId] = useState<number | null>(selectedFolder?.id || null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Flatten folders for dropdown
  const flattenFolders = (folders: Folder[], result: UIFolder[] = [], prefix: string = ''): UIFolder[] => {
    folders.forEach((folder) => {
      result.push({ ...folder, displayName: prefix + folder.name });
      if (folder.children && folder.children.length > 0) {
        flattenFolders(folder.children, result, prefix + folder.name + ' / ');
      }
    });
    return result;
  };

  const allFoldersFlat: UIFolder[] = flattenFolders(folders);

  // Update uploadFolderId when selectedFolder changes
  useEffect(() => {
    if (selectedFolder) {
      setUploadFolderId(selectedFolder.id);
    }
  }, [selectedFolder?.id]);

  const addFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;

    const videoFiles = Array.from(fileList).filter((file) => file.type.startsWith('video/'));
    
    const newFiles: UploadFile[] = videoFiles.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      status: 'pending' as const,
      progress: 0,
    }));

    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const uploadSingleFile = async (uploadFile: UploadFile): Promise<void> => {
    try {
      // Update status to uploading
      setFiles((prev) => {
        const fileIndex = prev.findIndex((f) => f.id === uploadFile.id);
        if (fileIndex === -1) return prev;
        const updated = [...prev];
        updated[fileIndex] = { ...updated[fileIndex], status: 'uploading', progress: 10 };
        return updated;
      });

      // Step 1: Create upload task
      const formData = new FormData();
      formData.append('file', uploadFile.file);
      if (uploadFolderId) {
        formData.append('folder_id', uploadFolderId.toString());
      }

      const createResponse = await axios.post('/api/videos', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const { uploadTask, videoId } = createResponse.data;

      setFiles((prev) => {
        const fileIndex = prev.findIndex((f) => f.id === uploadFile.id);
        if (fileIndex === -1) return prev;
        const updated = [...prev];
        updated[fileIndex] = { ...updated[fileIndex], progress: 30, videoId };
        return updated;
      });

      // Step 2: Upload file to object storage
      const uploadResponse = await fetch(uploadTask.url, {
        method: 'PUT',
        headers: uploadTask.header,
        body: uploadFile.file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to storage');
      }

      setFiles((prev) => {
        const fileIndex = prev.findIndex((f) => f.id === uploadFile.id);
        if (fileIndex === -1) return prev;
        const updated = [...prev];
        updated[fileIndex] = { ...updated[fileIndex], progress: 70 };
        return updated;
      });

      // Step 3: Confirm upload
      await axios.put('/api/videos', {
        videoId,
        uploadId: uploadTask.id,
        result: true,
      });

      setFiles((prev) => {
        const fileIndex = prev.findIndex((f) => f.id === uploadFile.id);
        if (fileIndex === -1) return prev;
        const updated = [...prev];
        updated[fileIndex] = { ...updated[fileIndex], status: 'completed', progress: 100 };
        return updated;
      });
    } catch (error: any) {
      setFiles((prev) => {
        const fileIndex = prev.findIndex((f) => f.id === uploadFile.id);
        if (fileIndex === -1) return prev;
        const updated = [...prev];
        updated[fileIndex] = {
          ...updated[fileIndex],
          status: 'error',
          error: error.response?.data?.error || error.message || 'Upload failed',
        };
        return updated;
      });
      throw error;
    }
  };

  const handleUploadAll = async () => {
    // Get current pending files
    const currentFiles = files.filter((f) => f.status === 'pending' || f.status === 'error');
    if (currentFiles.length === 0) return;

    setIsUploading(true);

    // Upload files sequentially to avoid overwhelming the server
    for (const file of currentFiles) {
      try {
        await uploadSingleFile(file);
      } catch (error) {
        // Continue with next file even if one fails
        console.error(`Failed to upload ${file.file.name}:`, error);
      }
    }

    setIsUploading(false);

    // Check if all files are completed after a short delay
    setTimeout(() => {
      setFiles((current) => {
        const allCompleted = current.every((f) => f.status === 'completed' || f.status === 'error');
        if (allCompleted && current.length > 0) {
          setTimeout(() => {
            onUploadSuccess();
          }, 2000);
        }
        return current;
      });
    }, 500);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const pendingCount = files.filter((f) => f.status === 'pending' || f.status === 'error').length;
  const completedCount = files.filter((f) => f.status === 'completed').length;
  const errorCount = files.filter((f) => f.status === 'error').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Upload Videos
        </h2>
        {user?.role === 'superuser' && (
          <div className="flex gap-2 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setUploadType('local')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                uploadType === 'local'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Local Upload
            </button>
            <button
              onClick={() => setUploadType('remote')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                uploadType === 'remote'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Remote Upload
            </button>
          </div>
        )}
      </div>

      {user?.role === 'superuser' && uploadType === 'remote' ? (
        <RemoteUpload
          folders={folders}
          selectedFolder={selectedFolder}
          onFolderSelect={onFolderSelect}
          onUploadSuccess={onUploadSuccess}
          user={user}
        />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-6">
        {/* Folder Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select Folder (Optional)
          </label>
          <select
            value={uploadFolderId || ''}
            onChange={(e) => setUploadFolderId(e.target.value ? parseInt(e.target.value) : null)}
            disabled={isUploading}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white disabled:opacity-50"
          >
            <option value="">Root (No Folder)</option>
            {allFoldersFlat.filter((f) => f.id !== null).map((folder) => (
              <option key={folder.id!} value={folder.id!}>
                {folder.displayName || folder.path || folder.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Select a folder to organize your videos
          </p>
        </div>

        {/* Drag & Drop Zone */}
        <div
          ref={dropZoneRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center transition-colors
            ${isDragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
            }
            ${isUploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
          `}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            multiple
            onChange={handleFileSelect}
            disabled={isUploading}
            className="hidden"
          />
          <Upload className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500 mb-4" />
          <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
            Drag & drop video files here, or click to select
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            You can select multiple video files at once
          </p>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Selected Files ({files.length})
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
              {files.map((uploadFile) => (
                <div
                  key={uploadFile.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {uploadFile.status === 'completed' && (
                          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                        )}
                        {uploadFile.status === 'error' && (
                          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                        )}
                        {uploadFile.status === 'uploading' && (
                          <Loader2 className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-spin flex-shrink-0" />
                        )}
                        {uploadFile.status === 'pending' && (
                          <div className="h-5 w-5 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" />
                        )}
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {uploadFile.file.name}
                        </p>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatFileSize(uploadFile.file.size)}
                      </p>
                      {uploadFile.error && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                          {uploadFile.error}
                        </p>
                      )}
                      {uploadFile.status === 'uploading' && (
                        <div className="mt-2">
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                            <div
                              className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                              style={{ width: `${uploadFile.progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {uploadFile.progress}%
                          </p>
                        </div>
                      )}
                    </div>
                    {uploadFile.status !== 'uploading' && (
                      <button
                        onClick={() => removeFile(uploadFile.id)}
                        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors flex-shrink-0"
                        title="Remove file"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload Button */}
        {files.length > 0 && (
          <div className="flex gap-3">
            <button
              onClick={handleUploadAll}
              disabled={isUploading || pendingCount === 0}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  <span>Upload All ({pendingCount})</span>
                </>
              )}
            </button>
            {!isUploading && (
              <button
                onClick={() => setFiles([])}
                className="px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
              >
                Clear All
              </button>
            )}
          </div>
        )}
      </div>
      )}
    </div>
  );
}

'use client';

import { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { Folder, User } from '@/types';
import { Upload, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import RemoteUpload from './RemoteUpload';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: Folder[];
  selectedFolder: Folder | null;
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

const BATCH_SIZE = 5;

export default function UploadModal({
  isOpen,
  onClose,
  folders,
  selectedFolder,
  onUploadSuccess,
  user,
}: UploadModalProps) {
  const [uploadType, setUploadType] = useState<'local' | 'remote'>('local');
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Determine folder ID - use selected folder or default to root (null)
  const uploadFolderId = selectedFolder?.id || null;

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
      // Only append folder_id if it's not null (root folder)
      if (uploadFolderId !== null && uploadFolderId !== undefined) {
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

    // Upload files in batches of BATCH_SIZE (max 5 concurrent uploads)
    for (let i = 0; i < currentFiles.length; i += BATCH_SIZE) {
      const batch = currentFiles.slice(i, i + BATCH_SIZE);
      
      // Upload all files in batch concurrently
      await Promise.allSettled(
        batch.map((file) => uploadSingleFile(file))
      );
    }

    setIsUploading(false);

    // Check if all files are completed after a short delay
    setTimeout(() => {
      setFiles((current) => {
        const allCompleted = current.every((f) => f.status === 'completed' || f.status === 'error');
        if (allCompleted && current.length > 0) {
          setTimeout(() => {
            onUploadSuccess();
            handleClose();
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

  const handleClose = () => {
    if (!isUploading) {
      setFiles([]);
      setUploadType('local');
      onClose();
    }
  };

  const pendingCount = files.filter((f) => f.status === 'pending' || f.status === 'error').length;
  const completedCount = files.filter((f) => f.status === 'completed').length;
  const errorCount = files.filter((f) => f.status === 'error').length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={handleClose}
        />

        {/* Modal */}
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Upload Files
            </h2>
            <button
              onClick={handleClose}
              disabled={isUploading}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Upload Type Toggle (only for superuser) */}
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

            {/* Remote Upload */}
            {user?.role === 'superuser' && uploadType === 'remote' ? (
              <RemoteUpload
                folders={folders}
                selectedFolder={selectedFolder}
                onFolderSelect={() => {}}
                onUploadSuccess={() => {
                  onUploadSuccess();
                  handleClose();
                }}
                user={user}
              />
            ) : (
              <>
                {/* Folder Info */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    <span className="font-medium">Upload destination:</span>{' '}
                    {selectedFolder ? selectedFolder.name : 'Root folder'}
                  </p>
                </div>

                {/* Drag & Drop Zone */}
                <div
                  ref={dropZoneRef}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                >
                  <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Drag and drop video files here
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    or click to select files
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="video/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Select Files
                  </button>
                </div>

                {/* Files List */}
                {files.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                        Selected Files ({files.length})
                      </h3>
                      <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <span>Pending: {pendingCount}</span>
                        <span className="text-green-600 dark:text-green-400">Completed: {completedCount}</span>
                        {errorCount > 0 && (
                          <span className="text-red-600 dark:text-red-400">Errors: {errorCount}</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {files.map((uploadFile) => (
                        <div
                          key={uploadFile.id}
                          className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {uploadFile.file.name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {formatFileSize(uploadFile.file.size)}
                            </p>
                            {uploadFile.status === 'uploading' && (
                              <div className="mt-2 w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                                <div
                                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                  style={{ width: `${uploadFile.progress}%` }}
                                />
                              </div>
                            )}
                            {uploadFile.status === 'error' && uploadFile.error && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                {uploadFile.error}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {uploadFile.status === 'pending' && (
                              <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
                            )}
                            {uploadFile.status === 'uploading' && (
                              <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                            )}
                            {uploadFile.status === 'completed' && (
                              <CheckCircle className="h-5 w-5 text-green-600" />
                            )}
                            {uploadFile.status === 'error' && (
                              <AlertCircle className="h-5 w-5 text-red-600" />
                            )}
                            {!isUploading && (
                              <button
                                onClick={() => removeFile(uploadFile.id)}
                                className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                              >
                                <X className="h-5 w-5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Upload Button */}
                    {pendingCount > 0 && (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={handleClose}
                          disabled={isUploading}
                          className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleUploadAll}
                          disabled={isUploading}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                        >
                          {isUploading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            `Upload All (${pendingCount})`
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


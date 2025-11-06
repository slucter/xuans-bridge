'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Folder, User } from '@/types';
import UploadModal from './UploadModal';
import { ChevronRight, ChevronDown, Folder as FolderIcon, Trash2, Plus, Upload } from 'lucide-react';

interface FolderListProps {
  folders: Folder[];
  selectedFolder: Folder | null;
  onFolderSelect: (folder: Folder | null) => void;
  onFolderCreated: () => void;
  onFolderDeleted?: () => void;
  onUploadSuccess?: () => void;
  user?: User;
}

interface FolderItemProps {
  folder: Folder;
  level: number;
  selectedFolder: Folder | null;
  onSelect: (folder: Folder) => void;
  allFolders: Folder[];
  onDelete: (folderId: number) => void;
}

function FolderItem({ folder, level, selectedFolder, onSelect, allFolders, onDelete }: FolderItemProps) {
  const [expanded, setExpanded] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isSelected = selectedFolder?.id === folder.id;
  const hasChildren = folder.children && folder.children.length > 0;
  const isRootFolder = folder.id === null || (folder as any).isRoot;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await axios.delete(`/api/folders/delete?id=${folder.id}`);
      setShowDeleteConfirm(false);
      onDelete(folder.id!);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete folder');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div
        className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors ${
          isSelected
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        {/* Expand/Collapse Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) {
              setExpanded(!expanded);
            }
          }}
          className={`flex-shrink-0 w-4 h-4 flex items-center justify-center transition-transform ${
            hasChildren ? 'cursor-pointer' : 'cursor-default opacity-0'
          }`}
        >
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            )
          ) : null}
        </button>

        {/* Folder Icon */}
        <FolderIcon className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`} />

        {/* Folder Name */}
        <button
          onClick={() => onSelect(folder)}
          className="flex-1 text-left text-sm font-medium truncate min-w-0"
        >
          {folder.name}
        </button>

        {/* Delete Button */}
        {!isRootFolder && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirm(true);
            }}
            className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-opacity"
            title="Delete folder"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Delete Folder
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Are you sure you want to delete "{folder.name}"? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg transition-colors"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Children */}
      {hasChildren && expanded && (
        <div>
          {folder.children!.map((child) => (
            <FolderItem
              key={child.id}
              folder={child}
              level={level + 1}
              selectedFolder={selectedFolder}
              onSelect={onSelect}
              allFolders={allFolders}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FolderList({
  folders,
  selectedFolder,
  onFolderSelect,
  onFolderCreated,
  onFolderDeleted,
  onUploadSuccess,
  user,
}: FolderListProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [parentId, setParentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Flatten folders for dropdown
  const flattenFolders = (folders: Folder[], result: Folder[] = []): Folder[] => {
    folders.forEach((folder) => {
      result.push(folder);
      if (folder.children && folder.children.length > 0) {
        flattenFolders(folder.children, result);
      }
    });
    return result;
  };

  const allFoldersFlat = flattenFolders(folders);

  // Auto-set parent folder when create form is opened and a folder is selected
  useEffect(() => {
    if (showCreateForm && selectedFolder && selectedFolder.id !== null) {
      // If a folder is selected (not Root/All Videos), set it as parent
      setParentId(selectedFolder.id);
    } else if (showCreateForm && selectedFolder === null) {
      // If "All Videos" is selected, reset to no parent (Root)
      setParentId(null);
    }
  }, [showCreateForm, selectedFolder]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload: any = { name: folderName };
      if (parentId) {
        payload.parent_id = parentId;
      }
      
      await axios.post('/api/folders', payload);
      setFolderName('');
      setParentId(null);
      setShowCreateForm(false);
      onFolderCreated();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create folder');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFolder = (folderId: number) => {
    if (selectedFolder?.id === folderId) {
      onFolderSelect(null);
    }
    if (onFolderDeleted) {
      onFolderDeleted();
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Folders</h3>
        <div className="flex gap-1.5">
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors shadow-sm"
            title="Upload File"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload</span>
          </button>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors shadow-sm ${
              showCreateForm
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
            title="Create Folder"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{showCreateForm ? 'Cancel' : 'New'}</span>
          </button>
        </div>
      </div>

      {/* Create Folder Form */}
      {showCreateForm && (
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <form onSubmit={handleCreateFolder} className="space-y-2">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-3 py-2 rounded text-xs">
                {error}
              </div>
            )}
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              required
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              placeholder="Folder name"
            />
            <select
              value={parentId || ''}
              onChange={(e) => setParentId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            >
              <option value="">Root (No Parent)</option>
              {allFoldersFlat.map((folder) => (
                <option key={folder.id} value={folder.id || ''}>
                  {folder.path || folder.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={loading}
              className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-md transition-colors"
            >
              {loading ? 'Creating...' : 'Create Folder'}
            </button>
          </form>
        </div>
      )}

      {/* Folder Tree */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Root/All Videos Button */}
        <button
          onClick={() => onFolderSelect(null)}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium transition-colors mb-1 ${
            selectedFolder === null
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
          }`}
        >
          <FolderIcon className="w-4 h-4" />
          <span>All Videos</span>
        </button>

        {/* Folders Tree */}
        {folders.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-500 dark:text-gray-400">
            No folders yet
          </div>
        ) : (
          <div className="space-y-0.5">
            {folders.map((folder) => (
              <FolderItem
                key={folder.id === null ? 'root' : folder.id}
                folder={folder}
                level={0}
                selectedFolder={selectedFolder}
                onSelect={onFolderSelect}
                allFolders={folders}
                onDelete={handleDeleteFolder}
              />
            ))}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        folders={folders}
        selectedFolder={selectedFolder}
        onUploadSuccess={() => {
          if (onUploadSuccess) {
            onUploadSuccess();
          }
        }}
        user={user}
      />
    </div>
  );
}

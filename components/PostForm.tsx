'use client';

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Video, Folder } from '@/types';

interface PostFormProps {
  videos: Video[];
}

interface FolderWithVideos extends Folder {
  videos?: Video[];
}

export default function PostForm({ videos }: PostFormProps) {
  const [title, setTitle] = useState('');
  const [selectedVideoIds, setSelectedVideoIds] = useState<Array<string | number>>([]);
  const [postImage, setPostImage] = useState<File | null>(null);
  const [postToTelegram, setPostToTelegram] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [channelName, setChannelName] = useState('channel telegram');
  const [showVideoDialog, setShowVideoDialog] = useState(false);
  const [folders, setFolders] = useState<FolderWithVideos[]>([]);
  const [rootVideos, setRootVideos] = useState<Video[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Allow all completed videos, regardless of local DB id presence
  // Some videos may come from Lixstream (id string, links available)
  const completedVideos = videos.filter((v) => v.upload_status === 'completed');

  useEffect(() => {
    // Fetch channel name from API
    axios.get('/api/posts/preview')
      .then((res) => {
        if (res.data.channelName) {
          setChannelName(res.data.channelName);
        }
      })
      .catch(() => {
        // Use default if API fails
      });
  }, []);

  useEffect(() => {
    // Load folders when dialog opens
    if (showVideoDialog) {
      loadFoldersWithVideos();
      setSearchQuery(''); // Reset search when dialog opens
      // Auto-expand all folders when search is active
      if (searchQuery) {
        const allFolderIds = new Set<number>();
        const collectFolderIds = (folders: FolderWithVideos[]) => {
          folders.forEach((folder) => {
            if (folder.id !== null) {
              allFolderIds.add(folder.id);
            }
            if (folder.children) {
              collectFolderIds(folder.children as FolderWithVideos[]);
            }
          });
        };
        collectFolderIds(folders);
        setExpandedFolders(allFolderIds);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVideoDialog]);

  // Auto-expand folders when searching
  useEffect(() => {
    if (searchQuery && folders.length > 0) {
      const allFolderIds = new Set<number>();
      const collectFolderIds = (folders: FolderWithVideos[]) => {
        folders.forEach((folder) => {
          if (folder.id !== null) {
            allFolderIds.add(folder.id);
          }
          if (folder.children) {
            collectFolderIds(folder.children as FolderWithVideos[]);
          }
        });
      };
      collectFolderIds(folders);
      setExpandedFolders(allFolderIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const loadFoldersWithVideos = async () => {
    try {
      const response = await axios.get('/api/folders');
      const foldersData = response.data.folders || [];
      
      // Group videos by folder_id
      const videosByFolder = new Map<number | null, Video[]>();
      completedVideos.forEach((video) => {
        const folderId = video.folder_id || null;
        if (!videosByFolder.has(folderId)) {
          videosByFolder.set(folderId, []);
        }
        videosByFolder.get(folderId)!.push(video);
      });

      // Add videos to folders recursively
      const addVideosToFolders = (folders: FolderWithVideos[]): FolderWithVideos[] => {
        return folders.map((folder) => {
          const folderVideos = videosByFolder.get(folder.id) || [];
          const folderWithVideos: FolderWithVideos = {
            ...folder,
            videos: folderVideos,
          };
          if (folder.children && folder.children.length > 0) {
            folderWithVideos.children = addVideosToFolders(folder.children as FolderWithVideos[]);
          }
          return folderWithVideos;
        });
      };

      const foldersWithVideos = addVideosToFolders(foldersData);
      
      // Add root videos (videos with folder_id = null)
      const rootVideosList = videosByFolder.get(null) || [];
      
      setFolders(foldersWithVideos);
      setRootVideos(rootVideosList);
    } catch (error) {
      console.error('Failed to load folders:', error);
    }
  };

  const toggleFolderExpand = (folderId: number) => {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  const toggleVideoSelection = (videoId: string | number) => {
    setSelectedVideoIds((prev) =>
      prev.includes(videoId)
        ? prev.filter((id) => id !== videoId)
        : [...prev, videoId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (selectedVideoIds.length === 0) {
      setError('Please select at least one video');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('title', title);
      // Split into numeric IDs (local DB videos) and direct links (remote/shared videos)
      const selectedVideos = completedVideos.filter((v) => selectedVideoIds.includes(v.id));
      const numericIds = selectedVideos
        .filter((v) => typeof (v as any).id === 'number')
        .map((v) => v.id as unknown as number);
      // Prefer embed links; fallback to share if embed not available
      const links = selectedVideos
        .map((v) => v.file_embed_link || v.file_share_link)
        .filter((l): l is string => !!l);

      formData.append('videoIds', JSON.stringify(numericIds));
      formData.append('links', JSON.stringify(links));
      formData.append('postToTelegram', postToTelegram.toString());
      if (postImage) {
        formData.append('image', postImage);
      }

      const response = await axios.post('/api/posts', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const { telegramError, telegramMessageId } = response.data;
      
      if (telegramError) {
        setError(`Post created but Telegram posting failed: ${telegramError}`);
      } else if (telegramMessageId) {
        setSuccess('Post created and posted to Telegram successfully!');
      } else {
        setSuccess('Post created successfully!');
      }
      
      setTitle('');
      setSelectedVideoIds([]);
      setPostImage(null);
      setPostToTelegram(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create post');
    } finally {
      setLoading(false);
    }
  };

  const generatePreview = () => {
    if (!title || selectedVideoIds.length === 0) return '';

    const selectedVideos = completedVideos.filter((v) =>
      selectedVideoIds.includes(v.id)
    );
    // Prefer embed links; fallback to share if embed not available
    const links = selectedVideos
      .map((v) => v.file_embed_link || v.file_share_link)
      .filter(Boolean);

    // Format according to new template:
    // judul
    // (empty line)
    // link
    // link
    // link
    // (empty line)
    // Join ke channel telegram untuk mendapatkan daily update!
    // TELEGRAM_CHANNEL_NAME (as plain text)
    return `${title}\n\n${links.join('\n')}\n\nJoin ke channel telegram untuk mendapatkan daily update!\n\n${channelName}`;
  };

  const copyPreviewToClipboard = () => {
    const previewText = generatePreview();
    if (previewText) {
      navigator.clipboard.writeText(previewText);
      // Show temporary success message
      const originalSuccess = success;
      setSuccess('Preview text copied to clipboard!');
      setTimeout(() => {
        setSuccess(originalSuccess);
      }, 2000);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
        Auto Post to Social Media
      </h2>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Post Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            placeholder="Enter post title"
          />
        </div>

        {/* Video Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select Videos * (Select multiple)
          </label>
          {completedVideos.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No completed videos available. Upload and complete videos first.
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowVideoDialog(true)}
                className="w-full px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 transition-colors text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900"
              >
                {selectedVideoIds.length > 0 
                  ? `${selectedVideoIds.length} video(s) selected - Click to change`
                  : 'Click to select videos'}
              </button>
              {selectedVideoIds.length > 0 && (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {completedVideos.filter(v => selectedVideoIds.includes(v.id)).map(v => v.name).join(', ')}
                </p>
              )}
            </>
          )}
        </div>

        {/* Image Upload (Optional) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Post Image (Optional)
          </label>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => setPostImage(e.target.files?.[0] || null)}
            disabled={loading}
            className="block w-full text-sm text-gray-500 dark:text-gray-400
              file:mr-4 file:py-2 file:px-4
              file:rounded-lg file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/30 dark:file:text-blue-300
              hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50
              cursor-pointer disabled:opacity-50"
          />
          {postImage && (
            <div className="mt-2">
              <img
                src={URL.createObjectURL(postImage)}
                alt="Preview"
                className="max-w-xs max-h-48 object-contain rounded border border-gray-300 dark:border-gray-600"
              />
            </div>
          )}
        </div>

        {/* Social Media Options */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="telegram"
              checked={postToTelegram}
              onChange={(e) => setPostToTelegram(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="telegram" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Post to Telegram Channel
            </label>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              (Using channel from environment)
            </span>
          </div>
        </div>

        {/* Preview */}
        {title && selectedVideoIds.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Preview
              </label>
              <button
                type="button"
                onClick={copyPreviewToClipboard}
                className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1"
              >
                📋 Copy
              </button>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg p-4">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-mono">
                {generatePreview()}
              </pre>
            </div>
          </div>
        )}

        {/* Messages */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded">
            {success}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || selectedVideoIds.length === 0}
          className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
        >
          {loading ? 'Posting...' : 'Create Post'}
        </button>
      </form>

      {/* Video Selection Dialog */}
      {showVideoDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Dialog Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                Select Videos
              </h3>
              <button
                onClick={() => setShowVideoDialog(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>

            {/* Dialog Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Search Input */}
              <div className="mb-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by folder name or video name..."
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>

              {/* Root Videos */}
              {rootVideos.filter((video) =>
                searchQuery
                  ? video.name.toLowerCase().includes(searchQuery.toLowerCase())
                  : true
              ).length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">📁</span>
                    <h4 className="font-semibold text-gray-900 dark:text-white">Root</h4>
                  </div>
                  <div className="ml-8 space-y-2">
                    {rootVideos
                      .filter((video) =>
                        searchQuery
                          ? video.name.toLowerCase().includes(searchQuery.toLowerCase())
                          : true
                      )
                      .map((video) => (
                      <label
                        key={video.id}
                        className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border border-gray-200 dark:border-gray-700 rounded-lg"
                      >
                        <input
                          type="checkbox"
                          checked={selectedVideoIds.includes(video.id)}
                          onChange={() => toggleVideoSelection(video.id)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {video.name}
                          </div>
                        </div>
                        {video.thumbnail_url || video.thumbnail_s3_url ? (
                          <img
                            src={video.thumbnail_url || video.thumbnail_s3_url}
                            alt={video.name}
                            className="h-12 w-20 object-cover rounded"
                          />
                        ) : null}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Folders Tree */}
              {folders.length > 0 && (
                <div>
                  {folders
                    .filter((folder) => {
                      if (!searchQuery) return true;
                      const folderMatches = folder.name.toLowerCase().includes(searchQuery.toLowerCase());
                      const hasMatchingVideos = folder.videos?.some((video) =>
                        video.name.toLowerCase().includes(searchQuery.toLowerCase())
                      );
                      const hasMatchingChildren = folder.children?.some((child) =>
                        child.name.toLowerCase().includes(searchQuery.toLowerCase())
                      );
                      return folderMatches || hasMatchingVideos || hasMatchingChildren;
                    })
                    .map((folder) => (
                      <FolderTreeItem
                        key={folder.id}
                        folder={folder}
                        level={0}
                        expandedFolders={expandedFolders}
                        selectedVideoIds={selectedVideoIds}
                        onToggleFolder={toggleFolderExpand}
                        onToggleVideo={toggleVideoSelection}
                        searchQuery={searchQuery}
                      />
                    ))}
                </div>
              )}

              {folders.length === 0 && rootVideos.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No videos available
                </div>
              )}
            </div>

            {/* Dialog Footer */}
            <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {selectedVideoIds.length} video(s) selected
              </div>
              <button
                onClick={() => setShowVideoDialog(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface FolderTreeItemProps {
  folder: FolderWithVideos;
  level: number;
  expandedFolders: Set<number>;
  selectedVideoIds: Array<string | number>;
  onToggleFolder: (folderId: number) => void;
  onToggleVideo: (videoId: string | number) => void;
  searchQuery?: string;
}

function FolderTreeItem({
  folder,
  level,
  expandedFolders,
  selectedVideoIds,
  onToggleFolder,
  onToggleVideo,
  searchQuery = '',
}: FolderTreeItemProps) {
  // Always expand Root (id === null) so its children are visible
  const isExpanded = folder.id === null ? true : expandedFolders.has(folder.id);
  const hasChildren = folder.children && folder.children.length > 0;
  const hasVideos = folder.videos && folder.videos.length > 0;

  // Filter videos based on search query
  const folderNameMatches = searchQuery
    ? folder.name.toLowerCase().includes(searchQuery.toLowerCase())
    : false;
  // If folder name matches the search, show all videos inside this folder
  const filteredVideos = folderNameMatches
    ? (folder.videos || [])
    : (searchQuery
        ? folder.videos?.filter((video) =>
            video.name.toLowerCase().includes(searchQuery.toLowerCase())
          ) || []
        : folder.videos || []);

  // Filter children recursively based on search query
  const filterChildren = (children: Folder[]): FolderWithVideos[] => {
    // If folder name itself matches, show all children normally
    if (!searchQuery || folderNameMatches) return children as FolderWithVideos[];

    return children.flatMap((child) => {
      const childWithVideos = child as FolderWithVideos;
      const childMatches = child.name.toLowerCase().includes(searchQuery.toLowerCase());
      const hasMatchingVideos = childWithVideos.videos?.some((video) =>
        video.name.toLowerCase().includes(searchQuery.toLowerCase())
      ) || false;
      const filteredChildChildren = childWithVideos.children
        ? filterChildren(childWithVideos.children as Folder[])
        : [];
      const hasMatchingChildren = filteredChildChildren.length > 0;

      if (childMatches || hasMatchingVideos || hasMatchingChildren) {
        return [{
          ...childWithVideos,
          children: filteredChildChildren,
        }];
      }
      return [];
    });
  };

  const filteredChildren = hasChildren ? filterChildren(folder.children!) : [];

  // Check if folder matches search or has matching children/videos
  const folderMatchesSearch = searchQuery
    ? folder.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      filteredVideos.length > 0 ||
      filteredChildren.length > 0
    : true;

  if (!folderMatchesSearch) return null;

  return (
    <div className="mb-4">
      {/* Folder Header */}
      <div
        className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer"
        style={{ paddingLeft: `${level * 1.5 + 0.5}rem` }}
      >
        <button
          onClick={() => {
            if (folder.id !== null) {
              onToggleFolder(folder.id);
            }
          }}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          disabled={!hasChildren && !hasVideos}
        >
          {(hasChildren || hasVideos) ? (isExpanded ? '▼' : '▶') : <span className="w-4" />}
        </button>
        <span className="text-lg">📁</span>
        <span className="font-medium text-gray-900 dark:text-white">{folder.name}</span>
        {folder.path && folder.path !== folder.name && (
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
            ({folder.path})
          </span>
        )}
      </div>

      {/* Videos and Children */}
      {isExpanded && (
        <div style={{ paddingLeft: `${(level + 1) * 1.5 + 0.5}rem` }}>
          {/* Videos in this folder */}
          {filteredVideos.length > 0 && (
            <div className="space-y-2 mb-2">
              {filteredVideos.map((video) => (
                <label
                  key={video.id}
                  className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <input
                    type="checkbox"
                    checked={selectedVideoIds.includes(video.id)}
                    onChange={() => onToggleVideo(video.id)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {video.name}
                    </div>
                  </div>
                  {video.thumbnail_url || video.thumbnail_s3_url ? (
                    <img
                      src={video.thumbnail_url || video.thumbnail_s3_url}
                      alt={video.name}
                      className="h-12 w-20 object-cover rounded"
                    />
                  ) : null}
                </label>
              ))}
            </div>
          )}

          {/* Child folders */}
          {filteredChildren.length > 0 && (
            <div>
              {filteredChildren.map((child) => (
                <FolderTreeItem
                  key={child.id}
                  folder={child as FolderWithVideos}
                  level={level + 1}
                  expandedFolders={expandedFolders}
                  selectedVideoIds={selectedVideoIds}
                  onToggleFolder={onToggleFolder}
                  onToggleVideo={onToggleVideo}
                  searchQuery={searchQuery}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


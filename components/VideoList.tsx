'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Video, Folder, User } from '@/types';
import { Share2, X, Users, Trash2, CheckSquare, Square } from 'lucide-react';

interface VideoListProps {
  videos: Video[];
  selectedFolder: Folder | null;
  onFolderSelect: (folder: Folder | null) => void;
  onRefresh: () => void;
  user?: User;
}

export default function VideoList({
  videos,
  selectedFolder,
  onFolderSelect,
  onRefresh,
  user,
}: VideoListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [showBulkShareModal, setShowBulkShareModal] = useState(false);
  const [showFolderShareLinkModal, setShowFolderShareLinkModal] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [selectedFolderForShare, setSelectedFolderForShare] = useState<Folder | null>(null);
  const [folderShareLink, setFolderShareLink] = useState<string | null>(null);
  const [loadingFolderShareLink, setLoadingFolderShareLink] = useState(false);
  const [publishers, setPublishers] = useState<User[]>([]);
  const [selectedPublishers, setSelectedPublishers] = useState<number[]>([]);
  const [sharedUsers, setSharedUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string | number>>(new Set());
  const [deletingVideoId, setDeletingVideoId] = useState<string | number | null>(null);

  useEffect(() => {
    if (showShareModal && user?.role === 'superuser') {
      loadPublishers();
      if (selectedVideo) {
        loadVideoShares(selectedVideo.id.toString());
      } else if (selectedFolderForShare) {
        loadFolderShares(selectedFolderForShare.id!);
      }
    }
  }, [showShareModal, selectedVideo, selectedFolderForShare, user]);

  const loadPublishers = async () => {
    try {
      const response = await axios.get('/api/users');
      const publisherUsers = response.data.users.filter((u: User) => u.role === 'publisher');
      setPublishers(publisherUsers);
    } catch (error) {
      console.error('Failed to load publishers:', error);
    }
  };

  const loadVideoShares = async (videoId: string) => {
    try {
      const response = await axios.get(`/api/shares/video?video_id=${videoId}`);
      setSharedUsers(response.data.shares || []);
      setSelectedPublishers(response.data.shares.map((s: any) => s.shared_to_user_id));
    } catch (error) {
      console.error('Failed to load video shares:', error);
    }
  };

  const loadFolderShares = async (folderId: number) => {
    try {
      const response = await axios.get(`/api/shares/folder?folder_id=${folderId}`);
      setSharedUsers(response.data.shares || []);
      setSelectedPublishers(response.data.shares.map((s: any) => s.shared_to_user_id));
    } catch (error) {
      console.error('Failed to load folder shares:', error);
    }
  };

  const handleShareClick = (video?: Video, folder?: Folder) => {
    if (video) {
      setSelectedVideo(video);
      setSelectedFolderForShare(null);
      setShowShareModal(true);
    } else if (folder) {
      // For folder, show folder share link modal instead of share to publisher modal
      handleGetFolderShareLink(folder);
    }
  };

  const handleGetFolderShareLink = async (folder: Folder) => {
    if (!folder || folder.id === null) return;
    
    setLoadingFolderShareLink(true);
    setSelectedFolderForShare(folder);
    setFolderShareLink(null);
    
    try {
      const response = await axios.get(`/api/folders/share-link?folder_id=${folder.id}`);
      setFolderShareLink(response.data.folder_share_link || null);
      setShowFolderShareLinkModal(true);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to get folder share link');
    } finally {
      setLoadingFolderShareLink(false);
    }
  };

  const handleShare = async () => {
    if (selectedPublishers.length === 0) {
      alert('Please select at least one publisher');
      return;
    }

    setLoading(true);
    try {
      if (selectedVideo) {
        // Share video
        for (const publisherId of selectedPublishers) {
          await axios.post('/api/shares/video', {
            video_id: selectedVideo.id.toString(),
            lixstream_file_id: selectedVideo.lixstream_file_id || selectedVideo.id.toString(),
            shared_to_user_id: publisherId,
          });
        }
        // Unshare from deselected publishers
        const currentSharedIds = sharedUsers.map((s) => s.shared_to_user_id);
        const toUnshare = currentSharedIds.filter((id) => !selectedPublishers.includes(id));
        for (const publisherId of toUnshare) {
          await axios.delete(
            `/api/shares/video?video_id=${selectedVideo.id.toString()}&shared_to_user_id=${publisherId}`
          );
        }
      } else if (selectedFolderForShare) {
        // Share folder
        for (const publisherId of selectedPublishers) {
          await axios.post('/api/shares/folder', {
            folder_id: selectedFolderForShare.id,
            lixstream_dir_id: selectedFolderForShare.lixstream_dir_id || null,
            shared_to_user_id: publisherId,
          });
        }
        // Unshare from deselected publishers
        const currentSharedIds = sharedUsers.map((s) => s.shared_to_user_id);
        const toUnshare = currentSharedIds.filter((id) => !selectedPublishers.includes(id));
        for (const publisherId of toUnshare) {
          await axios.delete(
            `/api/shares/folder?folder_id=${selectedFolderForShare.id}&shared_to_user_id=${publisherId}`
          );
        }
      }
      alert('Share updated successfully');
      setShowShareModal(false);
      setSelectedVideo(null);
      setSelectedFolderForShare(null);
      setSelectedPublishers([]);
      setSharedUsers([]);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update share');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkShare = async () => {
    if (selectedPublishers.length === 0) {
      alert('Please select at least one publisher');
      return;
    }

    if (selectedVideoIds.size === 0) {
      alert('Please select at least one video');
      return;
    }

    setLoading(true);
    try {
      const selectedVideos = filteredVideos.filter((v) => selectedVideoIds.has(v.id));
      
      for (const video of selectedVideos) {
        for (const publisherId of selectedPublishers) {
          await axios.post('/api/shares/video', {
            video_id: video.id.toString(),
            lixstream_file_id: video.lixstream_file_id || video.id.toString(),
            shared_to_user_id: publisherId,
          });
        }
      }
      
      alert(`Successfully shared ${selectedVideos.length} video(s) to ${selectedPublishers.length} publisher(s)`);
      setShowBulkShareModal(false);
      setSelectedVideoIds(new Set());
      setSelectedPublishers([]);
      setSharedUsers([]);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to share videos');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedVideoIds.size === 0) {
      alert('Please select at least one video');
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedVideoIds.size} video(s)?`)) {
      return;
    }

    setLoading(true);
    try {
      const videoIdsArray = Array.from(selectedVideoIds);
      const response = await axios.delete('/api/videos/delete', {
        data: { video_ids: videoIdsArray },
      });

      if (response.data.errors && response.data.errors.length > 0) {
        alert(`Deleted ${response.data.deletedCount} video(s). Errors: ${response.data.errors.join(', ')}`);
      } else {
        alert(`Successfully deleted ${response.data.deletedCount} video(s)`);
      }

      setSelectedVideoIds(new Set());
      onRefresh();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to delete videos');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSingle = async (videoId: string | number) => {
    if (!confirm('Are you sure you want to delete this video?')) {
      return;
    }

    setDeletingVideoId(videoId);
    try {
      const response = await axios.delete('/api/videos/delete', {
        data: { video_ids: [videoId] },
      });

      if (response.data.errors && response.data.errors.length > 0) {
        alert(`Error: ${response.data.errors.join(', ')}`);
      } else {
        alert('Video deleted successfully');
      }

      onRefresh();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to delete video');
    } finally {
      setDeletingVideoId(null);
    }
  };

  const toggleSelectVideo = (videoId: string | number) => {
    const newSelected = new Set(selectedVideoIds);
    if (newSelected.has(videoId)) {
      newSelected.delete(videoId);
    } else {
      newSelected.add(videoId);
    }
    setSelectedVideoIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedVideoIds.size === filteredVideos.length) {
      setSelectedVideoIds(new Set());
    } else {
      setSelectedVideoIds(new Set(filteredVideos.map((v) => v.id)));
    }
  };

  const filteredVideos = videos.filter((video) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      video.name.toLowerCase().includes(query) ||
      (video.folder_name && video.folder_name.toLowerCase().includes(query))
    );
  });

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          {selectedFolder ? selectedFolder.name : 'All Videos'}
        </h2>
        <div className="flex gap-2 w-full sm:w-auto">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search videos..."
            className="flex-1 sm:w-48 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
          />
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium transition-colors whitespace-nowrap"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedVideoIds.size > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-center justify-between">
          <div className="text-sm font-medium text-blue-900 dark:text-blue-200">
            {selectedVideoIds.size} video(s) selected
          </div>
          <div className="flex gap-2">
            {user?.role === 'superuser' && (
              <button
                onClick={() => {
                  setShowBulkShareModal(true);
                  loadPublishers();
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Share2 className="h-4 w-4" />
                Share Selected
              </button>
            )}
            <button
              onClick={handleBulkDelete}
              disabled={loading}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete Selected
            </button>
            <button
              onClick={() => setSelectedVideoIds(new Set())}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Video Table Container */}
      <div className="flex-1 overflow-y-auto">
        {videos.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No videos found. Upload your first video!
          </div>
        ) : filteredVideos.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No videos found matching "{searchQuery}"
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10">
                    <button
                      onClick={toggleSelectAll}
                      className="flex items-center justify-center"
                      title="Select all"
                    >
                      {selectedVideoIds.size === filteredVideos.length && filteredVideos.length > 0 ? (
                        <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <Square className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Thumbnail
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="hidden sm:table-cell px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Folder
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="hidden md:table-cell px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Links
                  </th>
                  <th className="hidden lg:table-cell px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredVideos.map((video) => (
                  <tr key={video.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedVideoIds.has(video.id)}
                        onChange={() => toggleSelectVideo(video.id)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2">
                      {video.thumbnail_url || video.thumbnail_s3_url ? (
                        <img
                          src={video.thumbnail_url || video.thumbnail_s3_url}
                          alt={video.name}
                          className="h-10 w-16 object-cover rounded"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3Ctext fill="%23999" x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="12"%3ENo Image%3C/text%3E%3C/svg%3E';
                          }}
                        />
                      ) : (
                        <div className="h-10 w-16 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
                          <span className="text-[10px] text-gray-400">No img</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-xs">
                        {video.name}
                      </div>
                      <div className="sm:hidden text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {video.folder_name || 'Root'}
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2 whitespace-nowrap">
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {video.folder_name || 'Root'}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full ${
                          video.upload_status === 'completed'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : video.upload_status === 'uploading'
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                            : video.upload_status === 'failed'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {video.upload_status}
                      </span>
                    </td>
                    <td className="hidden md:table-cell px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                      <div className="flex flex-col gap-0.5">
                        {video.file_share_link && (
                          <a
                            href={video.file_share_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[120px]"
                          >
                            Share
                          </a>
                        )}
                        {video.file_embed_link && (
                          <a
                            href={video.file_embed_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[120px]"
                          >
                            Embed
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="hidden lg:table-cell px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                      {new Date(video.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">
                      <div className="flex items-center gap-1.5">
                        {user?.role === 'superuser' && (
                          <button
                            onClick={() => handleShareClick(video)}
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1"
                            title="Share video"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteSingle(video.id)}
                          disabled={deletingVideoId === video.id}
                          className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 flex items-center gap-1 disabled:opacity-50"
                          title="Delete video"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        )}
      </div>

      {/* Share Modal */}
      {showShareModal && user?.role === 'superuser' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                Share {selectedVideo ? 'Video' : 'Folder'}
              </h3>
              <button
                onClick={() => {
                  setShowShareModal(false);
                  setSelectedVideo(null);
                  setSelectedFolderForShare(null);
                  setSelectedPublishers([]);
                  setSharedUsers([]);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {selectedVideo ? `Video: ${selectedVideo.name}` : `Folder: ${selectedFolderForShare?.name}`}
                </p>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Select publishers to share with:
                </p>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {publishers.map((publisher) => (
                  <label
                    key={publisher.id}
                    className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPublishers.includes(publisher.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPublishers([...selectedPublishers, publisher.id]);
                        } else {
                          setSelectedPublishers(selectedPublishers.filter((id) => id !== publisher.id));
                        }
                      }}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {publisher.username}
                      </div>
                      {publisher.email && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">{publisher.email}</div>
                      )}
                    </div>
                  </label>
                ))}
                {publishers.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    No publishers available
                  </p>
                )}
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button
                onClick={handleShare}
                disabled={loading || selectedPublishers.length === 0}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Share2 className="h-4 w-4" />
                {loading ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setShowShareModal(false);
                  setSelectedVideo(null);
                  setSelectedFolderForShare(null);
                  setSelectedPublishers([]);
                  setSharedUsers([]);
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Share Modal */}
      {showBulkShareModal && user?.role === 'superuser' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                Share {selectedVideoIds.size} Video(s)
              </h3>
              <button
                onClick={() => {
                  setShowBulkShareModal(false);
                  setSelectedPublishers([]);
                  setSharedUsers([]);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {selectedVideoIds.size} video(s) selected
                </p>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Select publishers to share with:
                </p>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {publishers.map((publisher) => (
                  <label
                    key={publisher.id}
                    className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPublishers.includes(publisher.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPublishers([...selectedPublishers, publisher.id]);
                        } else {
                          setSelectedPublishers(selectedPublishers.filter((id) => id !== publisher.id));
                        }
                      }}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {publisher.username}
                      </div>
                      {publisher.email && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">{publisher.email}</div>
                      )}
                    </div>
                  </label>
                ))}
                {publishers.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    No publishers available
                  </p>
                )}
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button
                onClick={handleBulkShare}
                disabled={loading || selectedPublishers.length === 0}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Share2 className="h-4 w-4" />
                {loading ? 'Sharing...' : 'Share'}
              </button>
              <button
                onClick={() => {
                  setShowBulkShareModal(false);
                  setSelectedPublishers([]);
                  setSharedUsers([]);
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Folder Button */}
      {user?.role === 'superuser' && selectedFolder && selectedFolder.id !== null && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => handleShareClick(undefined, selectedFolder)}
            disabled={loadingFolderShareLink}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <Share2 className="h-4 w-4" />
            {loadingFolderShareLink ? 'Loading...' : `Share Folder "${selectedFolder.name}"`}
          </button>
        </div>
      )}

      {/* Folder Share Link Modal */}
      {showFolderShareLinkModal && selectedFolderForShare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Folder Share Link
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Share link for folder: <strong>{selectedFolderForShare.name}</strong>
            </p>
            {folderShareLink ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <input
                    type="text"
                    value={folderShareLink}
                    readOnly
                    className="flex-1 bg-transparent border-none text-sm text-gray-900 dark:text-white focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(folderShareLink);
                      alert('Link copied to clipboard!');
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md transition-colors"
                  >
                    Copy
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  No share link available. Upload a file to this folder to generate a share link.
                </p>
              </div>
            )}
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => {
                  setShowFolderShareLinkModal(false);
                  setSelectedFolderForShare(null);
                  setFolderShareLink(null);
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


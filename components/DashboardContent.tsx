'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import { RefreshCw, ChevronDown, LogOut } from 'lucide-react';
import FolderList from '@/components/FolderList';
import VideoUpload from '@/components/VideoUpload';
import VideoList from '@/components/VideoList';
import PostForm from '@/components/PostForm';
import ProfilePage from '@/components/ProfilePage';
import RoleManagementPage from '@/components/RoleManagementPage';
import { Folder, Video, User } from '@/types';

interface DashboardContentProps {
  user: User;
}

export default function DashboardContent({ user }: DashboardContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Get tab from URL query params, default to 'folders'
  const tabFromUrl = searchParams.get('tab') as 'folders' | 'upload' | 'videos' | 'post' | 'profile' | 'master' | null;
  const validTabs = ['folders', 'upload', 'videos', 'post', 'profile', 'master'];
  const initialTab = tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : 'folders';
  
  const [activeTab, setActiveTab] = useState<'folders' | 'upload' | 'videos' | 'post' | 'profile' | 'master'>(initialTab);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  // Sync activeTab with URL query params
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab') as 'folders' | 'upload' | 'videos' | 'post' | 'profile' | 'master' | null;
    const validTabsList = ['folders', 'upload', 'videos', 'post', 'profile', 'master'];
    if (tabFromUrl && validTabsList.includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    } else if (!tabFromUrl) {
      // If no tab in URL, set default and update URL
      router.push('/dashboard?tab=folders', { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    loadFolders();
    loadVideos();
  }, []);

  // Reload videos when selectedFolder changes
  useEffect(() => {
    if (selectedFolder) {
      loadVideos(selectedFolder.id);
    } else {
      // Load all videos when no folder selected
      loadVideos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolder?.id]);

  const loadFolders = async () => {
    try {
      const response = await axios.get('/api/folders');
      setFolders(response.data.folders || []);
    } catch (error) {
      console.error('Failed to load folders:', error);
    }
  };

  const loadVideos = async (folderId?: number | null) => {
    try {
      // If folderId is explicitly null (Root folder selected), use special parameter
      // If folderId is undefined (no folder selected), load all videos
      const url = folderId === null
        ? '/api/videos?folder_id=root'
        : folderId
        ? `/api/videos?folder_id=${folderId}`
        : '/api/videos';
      const response = await axios.get(url);
      setVideos(response.data.videos || []);
    } catch (error) {
      console.error('Failed to load videos:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout');
      router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await axios.post('/api/sync');
      const { stats } = response.data;
      
      alert(
        `Sync completed!\n\n` +
        `Lixstream files: ${stats.lixstreamFilesCount}\n` +
        `Deleted folders: ${stats.deletedFoldersCount}\n` +
        `Deleted videos: ${stats.deletedVideosCount}\n` +
        `Updated videos: ${stats.updatedVideosCount || 0}`
      );
      
      // Reload data after sync
      loadFolders();
      loadVideos();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to sync with Lixstream');
    } finally {
      setSyncing(false);
    }
  };

  const handleTabChange = (tab: 'folders' | 'upload' | 'videos' | 'post' | 'profile' | 'master') => {
    setActiveTab(tab);
    // Update URL without page reload
    router.push(`/dashboard?tab=${tab}`, { scroll: false });
  };

  const handleFolderSelect = (folder: Folder | null) => {
    setSelectedFolder(folder);
    if (folder) {
      // If folder.id is null, it's the Root folder
      loadVideos(folder.id === null ? null : folder.id);
    } else {
      loadVideos();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-lg font-medium text-gray-900 dark:text-white">
              Xuans Bridge
            </h1>
                    <div className="flex items-center gap-4">
                      {/* Sync button is hidden */}
                      {/* <button
                        onClick={handleSync}
                        disabled={syncing}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-normal text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-50 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Sync with Lixstream platform"
                      >
                        <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                        <span>{syncing ? 'Syncing...' : 'Sync'}</span>
                      </button> */}
                      
                      {/* User Dropdown */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-normal text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <span>{user.username}</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                </button>
                
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                    <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{user.username}</p>
                      {user.email && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{user.email}</p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        handleLogout();
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8 overflow-x-auto scrollbar-hide">
            {[
              { id: 'folders', label: 'Folders' },
              { id: 'upload', label: 'Upload Video' },
              { id: 'videos', label: 'Video List' },
              { id: 'post', label: 'Auto Post' },
              { id: 'profile', label: 'Profile' },
              ...(user.role === 'superuser' ? [{ id: 'master', label: 'Master' }] : []),
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'folders' && (
          <div className="space-y-6">
            <FolderList
              folders={folders}
              selectedFolder={selectedFolder}
              onFolderSelect={handleFolderSelect}
              onFolderCreated={loadFolders}
              onFolderDeleted={() => {
                loadFolders();
                if (selectedFolder) {
                  if (selectedFolder.id === null) {
                    loadVideos(null);
                  } else {
                    loadVideos(selectedFolder.id);
                  }
                } else {
                  loadVideos();
                }
              }}
            />
            {selectedFolder && (
              <div className="mt-6">
                <VideoList
                  videos={videos}
                  selectedFolder={selectedFolder}
                  onFolderSelect={handleFolderSelect}
                  onRefresh={() => {
                    if (selectedFolder.id === null) {
                      loadVideos(null);
                    } else {
                      loadVideos(selectedFolder.id);
                    }
                  }}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'upload' && (
          <VideoUpload
            folders={folders}
            selectedFolder={selectedFolder}
            onFolderSelect={handleFolderSelect}
            onUploadSuccess={() => {
              if (selectedFolder?.id === null) {
                loadVideos(null);
              } else {
                loadVideos(selectedFolder?.id);
              }
              setActiveTab('videos');
            }}
            user={user}
          />
        )}

        {activeTab === 'videos' && (
          <VideoList
            videos={videos}
            selectedFolder={selectedFolder}
            onFolderSelect={handleFolderSelect}
            onRefresh={() => {
              if (selectedFolder?.id === null) {
                loadVideos(null);
              } else {
                loadVideos(selectedFolder?.id);
              }
            }}
            user={user}
          />
        )}

        {activeTab === 'post' && (
          <PostForm videos={videos} />
        )}

        {activeTab === 'profile' && (
          <ProfilePage user={user} />
        )}

        {activeTab === 'master' && user.role === 'superuser' && (
          <RoleManagementPage />
        )}
      </main>
    </div>
  );
}


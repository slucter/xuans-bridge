'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import FolderList from '@/components/FolderList';
import VideoList from '@/components/VideoList';
import LoadingPlaceholder from '@/components/LoadingPlaceholder';
import { Folder, Video, User } from '@/types';

export default function FoldersPage() {
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    loadFolders();
    loadUser();
    // Load all videos initially (when no folder selected)
    loadVideos();
  }, []);

  useEffect(() => {
    if (selectedFolder !== null) {
      // If folder.id is null, it's the Root folder
      loadVideos(selectedFolder.id === null ? null : selectedFolder.id);
    } else {
      // Load all videos when no folder selected
      loadVideos();
    }
  }, [selectedFolder?.id]);

  const loadUser = async () => {
    setLoadingUser(true);
    try {
      const response = await axios.get('/api/auth/me');
      if (response.data.user) {
        setUser(response.data.user);
      }
    } catch (error) {
      console.error('Failed to load user:', error);
    } finally {
      setLoadingUser(false);
    }
  };

  const loadFolders = async () => {
    setLoadingFolders(true);
    try {
      const response = await axios.get('/api/folders');
      setFolders(response.data.folders || []);
    } catch (error) {
      console.error('Failed to load folders:', error);
    } finally {
      setLoadingFolders(false);
    }
  };

  const loadVideos = async (folderId?: number | null) => {
    setLoadingVideos(true);
    try {
      const url = folderId === null
        ? '/api/videos?folder_id=root'
        : folderId
        ? `/api/videos?folder_id=${folderId}`
        : '/api/videos';
      const response = await axios.get(url);
      setVideos(response.data.videos || []);
    } catch (error) {
      console.error('Failed to load videos:', error);
    } finally {
      setLoadingVideos(false);
    }
  };

  const handleFolderSelect = (folder: Folder | null) => {
    setSelectedFolder(folder);
  };

  if (loadingUser || loadingFolders) {
    return (
      <div className="h-full flex gap-4">
        <div className="w-64 flex-shrink-0">
          <LoadingPlaceholder type="folders" count={5} />
        </div>
        <div className="flex-1 min-w-0">
          <LoadingPlaceholder type="videos" count={5} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex gap-4">
      {/* Left Sidebar - Folder Tree */}
      <div className="w-64 flex-shrink-0">
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
          onUploadSuccess={() => {
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
          user={user || undefined}
        />
      </div>

      {/* Right Content - Video List */}
      <div className="flex-1 min-w-0">
        {loadingVideos ? (
          <LoadingPlaceholder type="videos" count={5} />
        ) : (
          <VideoList
            videos={videos}
            selectedFolder={selectedFolder}
            onFolderSelect={handleFolderSelect}
            onRefresh={() => {
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
            user={user || undefined}
          />
        )}
      </div>
    </div>
  );
}

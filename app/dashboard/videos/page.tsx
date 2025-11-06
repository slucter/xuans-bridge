'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import VideoList from '@/components/VideoList';
import LoadingPlaceholder from '@/components/LoadingPlaceholder';
import { Video, User } from '@/types';

export default function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    // Always load all videos without folder filter, sorted by date (newest first)
    loadAllVideos();
    loadUser();
  }, []);

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

  const loadAllVideos = async () => {
    setLoadingVideos(true);
    try {
      // Load all videos without folder filter
      const response = await axios.get('/api/videos');
      const allVideos = response.data.videos || [];
      // Sort by created_at descending (newest first)
      const sortedVideos = allVideos.sort((a: Video, b: Video) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateB - dateA;
      });
      setVideos(sortedVideos);
    } catch (error) {
      console.error('Failed to load videos:', error);
    } finally {
      setLoadingVideos(false);
    }
  };

  if (loadingUser || loadingVideos) {
    return <LoadingPlaceholder type="videos" count={5} />;
  }

  return (
    <div className="h-full">
      <VideoList
        videos={videos}
        selectedFolder={null} // Always null - no folder filter
        onFolderSelect={() => {}} // No-op since we don't want folder selection here
        onRefresh={loadAllVideos}
        user={user || undefined}
      />
    </div>
  );
}


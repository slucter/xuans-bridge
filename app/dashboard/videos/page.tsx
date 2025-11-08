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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    // Load first page
    loadVideos(1);
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

  const loadVideos = async (targetPage: number) => {
    setLoadingVideos(true);
    try {
      const response = await axios.get('/api/videos', {
        params: { page: targetPage, page_size: pageSize },
      });
      const pageVideos = response.data.videos || [];
      setVideos(pageVideos);
      const meta = response.data.pagination || { total_pages: 1 };
      setTotalPages(meta.total_pages || 1);
      setPage(targetPage);
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
        onRefresh={() => loadVideos(page)}
        user={user || undefined}
        pagination={{ page, totalPages, pageSize }}
        onPageChange={(p) => {
          if (p < 1 || p > totalPages) return;
          loadVideos(p);
        }}
      />
    </div>
  );
}


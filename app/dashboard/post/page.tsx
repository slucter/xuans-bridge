'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import PostForm from '@/components/PostForm';
import LoadingPlaceholder from '@/components/LoadingPlaceholder';
import { Video } from '@/types';

export default function PostPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllVideos();
  }, []);

  const loadAllVideos = async () => {
    setLoading(true);
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
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingPlaceholder type="form" count={3} />;
  }

  return <PostForm videos={videos} />;
}


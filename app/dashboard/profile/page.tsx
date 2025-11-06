'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import ProfilePage from '@/components/ProfilePage';
import LoadingPlaceholder from '@/components/LoadingPlaceholder';

export default function ProfilePageWrapper() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    setLoading(true);
    axios.get('/api/auth/me').then((res) => {
      if (res.data.user) {
        setUser(res.data.user);
      }
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  if (loading || !user) {
    return <LoadingPlaceholder type="form" count={4} />;
  }

  return <ProfilePage user={user} />;
}

export interface User {
  id: number;
  username: string;
  email?: string;
  role?: 'superuser' | 'publisher';
}

export interface Folder {
  id: number | null; // null for virtual Root folder
  user_id: number;
  name: string;
  parent_id?: number | null;
  lixstream_dir_id?: string | null;
  created_at: string | null;
  children?: Folder[];
  path?: string; // Full path for display
  isRoot?: boolean; // Flag to identify virtual root folder
}

export interface Video {
  id: number;
  user_id: number;
  folder_id?: number;
  folder_name?: string;
  name: string;
  lixstream_file_id?: string;
  lixstream_upload_id?: string;
  file_share_link?: string;
  file_embed_link?: string;
  thumbnail_url?: string;
  thumbnail_s3_url?: string;
  upload_status: 'pending' | 'uploading' | 'completed' | 'failed';
  created_at: string;
}

export interface Post {
  id: number;
  user_id: number;
  title: string;
  video_ids: string;
  telegram_posted: boolean;
  x_posted: boolean;
  telegram_message_id?: string;
  x_tweet_id?: string;
  created_at: string;
}


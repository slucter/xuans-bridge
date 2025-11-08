import { execute } from '@/lib/pgdb';

export type ActivityAction =
  | 'login'
  | 'upload_local'
  | 'upload_remote'
  | 'delete_video'
  | 'delete_folder'
  | 'create_folder'
  | 'create_post';

interface LogParams {
  userId: number | null;
  action: ActivityAction;
  targetType?: string | null;
  targetId?: string | number | null;
  metadata?: Record<string, any> | null;
}

export async function logActivity({
  userId,
  action,
  targetType = null,
  targetId = null,
  metadata = null,
}: LogParams): Promise<void> {
  try {
    await execute(
      `INSERT INTO activity_logs (user_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, targetType, targetId !== null ? String(targetId) : null, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (e) {
    // Swallow errors to avoid breaking primary flows; log to console
    console.warn('[activity] failed to log activity', { userId, action, targetType, targetId, error: (e as any)?.message || e });
  }
}
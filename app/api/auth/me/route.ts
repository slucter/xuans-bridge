import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { queryOne } from '@/lib/pgdb';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ user: null });
  }

  const user = verifyToken(token);
  if (!user) {
    return NextResponse.json({ user: null });
  }

  // Get fresh user data from Neon/Postgres including role
  const dbUser = await queryOne<{ id: number; username: string; email: string | null; role: string }>(
    'SELECT id, username, email, role FROM users WHERE id = $1',
    [user.id]
  );
  
  if (!dbUser) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({ 
    user: {
      id: dbUser.id,
      username: dbUser.username,
      email: dbUser.email,
      role: dbUser.role || 'publisher',
    }
  });
}


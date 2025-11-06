import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import db from '@/lib/db';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ user: null });
  }

  const user = verifyToken(token);
  if (!user) {
    return NextResponse.json({ user: null });
  }

  // Get fresh user data from database including role
  const dbUser = db.prepare('SELECT id, username, email, role FROM users WHERE id = ?').get(user.id) as any;
  
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


import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, clearAuthCookie } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ success: true });
  }

  const user = verifyToken(token);
  if (!user) {
    const response = NextResponse.json({ success: true });
    clearAuthCookie(response);
    return response;
  }

  const response = NextResponse.json({ success: true });
  clearAuthCookie(response);
  return response;
}


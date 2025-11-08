import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { queryOne } from '@/lib/pgdb';
import { createToken, setAuthCookie } from '@/lib/auth';
import { logActivity } from '@/lib/activity';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    const user = await queryOne<any>(
      'SELECT id, username, password, email, role FROM users WHERE username = $1',
      [username]
    );

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const token = createToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role || 'publisher',
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role || 'publisher',
      },
    });

    setAuthCookie(response, token);
    // Log successful login
    await logActivity({
      userId: user.id,
      action: 'login',
      targetType: 'user',
      targetId: user.id,
      metadata: { username: user.username },
    });
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


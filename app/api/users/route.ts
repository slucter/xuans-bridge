import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { queryAll, queryOne, execute } from '@/lib/pgdb';
import bcrypt from 'bcryptjs';

// Get all users (superuser only)
export async function GET(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = verifyToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch fresh role from DB to avoid stale token role
  const dbUser = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [user.id]);
  if (!dbUser || dbUser.role !== 'superuser') {
    return NextResponse.json({ error: 'Forbidden - Superuser access required' }, { status: 403 });
  }

  const users = await queryAll<any>(
    'SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC'
  );

  return NextResponse.json({ users });
}

// Create new user (superuser only)
export async function POST(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = verifyToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dbUser = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [user.id]);
  if (!dbUser || dbUser.role !== 'superuser') {
    return NextResponse.json({ error: 'Forbidden - Superuser access required' }, { status: 403 });
  }

  try {
    const { username, password, email, role } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    if (role && !['superuser', 'publisher'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be superuser or publisher' },
        { status: 400 }
      );
    }

    // Check if username already exists (Postgres)
    const existingUser = await queryOne<any>('SELECT id FROM users WHERE username = $1', [username]);
    if (existingUser) {
      return NextResponse.json(
        { error: 'Username already exists' },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userRole = role || 'publisher';

    const result = await execute(
      'INSERT INTO users (username, password, email, role) VALUES ($1, $2, $3, $4)',
      [username, hashedPassword, email || null, userRole]
    );

    return NextResponse.json({
      success: true,
      user: {
        id: result.lastInsertRowid,
        username,
        email: email || null,
        role: userRole,
      },
    });
  } catch (error: any) {
    console.error('Create user error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create user' },
      { status: 500 }
    );
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { execute, queryOne } from '@/lib/pgdb';
import bcrypt from 'bcryptjs';

// Update user role (superuser only)
export async function PUT(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = verifyToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Check fresh role from DB to avoid stale token
  const dbUser = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [user.id]);
  if (!dbUser || dbUser.role !== 'superuser') {
    return NextResponse.json({ error: 'Forbidden - Superuser access required' }, { status: 403 });
  }

  try {
    const { id, role, password } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Prevent changing own role
    if (id === user.id) {
      return NextResponse.json({ error: 'Cannot modify your own role' }, { status: 400 });
    }

    if (role && !['superuser', 'publisher'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be superuser or publisher' },
        { status: 400 }
      );
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (role) {
      // push value first, then reference its index using $n syntax
      values.push(role);
      updates.push(`role = $${values.length}`);
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      values.push(hashedPassword);
      updates.push(`password = $${values.length}`);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const idNum = typeof id === 'string' ? parseInt(id, 10) : id;
    if (!idNum || Number.isNaN(idNum)) {
      return NextResponse.json({ error: 'Invalid User ID' }, { status: 400 });
    }

    values.push(idNum);
    const idParamIndex = values.length;

    await execute(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idParamIndex}`, values);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Update user error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update user' },
      { status: 500 }
    );
  }
}

// Delete user (superuser only)
export async function DELETE(request: NextRequest) {
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
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const userIdNum = parseInt(userId);
    if (isNaN(userIdNum)) {
      return NextResponse.json({ error: 'Invalid User ID' }, { status: 400 });
    }

    // Prevent deleting yourself
    if (userIdNum === user.id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    await execute('DELETE FROM users WHERE id = $1', [userIdNum]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete user error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete user' },
      { status: 500 }
    );
  }
}


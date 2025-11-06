import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import db from '@/lib/db';
import bcrypt from 'bcryptjs';

// Update user role (superuser only)
export async function PUT(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = verifyToken(token);
  if (!user || user.role !== 'superuser') {
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
      updates.push('role = ?');
      values.push(role);
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push('password = ?');
      values.push(hashedPassword);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    values.push(id);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

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
  if (!user || user.role !== 'superuser') {
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

    db.prepare('DELETE FROM users WHERE id = ?').run(userIdNum);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete user error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete user' },
      { status: 500 }
    );
  }
}


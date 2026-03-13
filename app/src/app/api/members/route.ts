import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Member } from '@/types/index';

export async function GET() {
  try {
    const db = getDb();
    const members = db.prepare('SELECT * FROM members WHERE active = 1').all() as Member[];
    return NextResponse.json({ members });
  } catch (error) {
    console.error('Failed to fetch members:', error);
    return NextResponse.json(
      { error: 'Failed to fetch members' },
      { status: 500 }
    );
  }
}

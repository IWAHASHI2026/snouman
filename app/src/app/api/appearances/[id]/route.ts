import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Appearance, Member } from '@/types/index';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const appearance = db.prepare('SELECT * FROM appearances WHERE id = ?').get(Number(id)) as Appearance | undefined;

    if (!appearance) {
      return NextResponse.json(
        { error: 'Appearance not found' },
        { status: 404 }
      );
    }

    const members = db.prepare(`
      SELECT m.*
      FROM members m
      JOIN appearance_members am ON m.id = am.member_id
      WHERE am.appearance_id = ?
    `).all(appearance.id) as Member[];

    return NextResponse.json({
      ...appearance,
      members,
    });
  } catch (error) {
    console.error('Failed to fetch appearance:', error);
    return NextResponse.json(
      { error: 'Failed to fetch appearance' },
      { status: 500 }
    );
  }
}

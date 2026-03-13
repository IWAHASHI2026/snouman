import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Appearance, Member } from '@/types/index';

function toJSTDateString(date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split('T')[0];
}

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const searchParams = request.nextUrl.searchParams;

    const now = new Date();
    const fromDate = searchParams.get('from') || toJSTDateString(now);
    const defaultTo = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const toDate = searchParams.get('to') || toJSTDateString(defaultTo);
    const memberIds = searchParams.get('member_ids') || searchParams.get('member');
    const mediaType = searchParams.get('media_type') || searchParams.get('media');

    let query = `
      SELECT DISTINCT a.*
      FROM appearances a
      LEFT JOIN appearance_members am ON a.id = am.appearance_id
      WHERE a.start_at >= ? AND a.start_at <= ?
    `;
    const params: (string | number)[] = [
      fromDate + 'T00:00:00+09:00',
      toDate + 'T23:59:59+09:00',
    ];

    if (memberIds) {
      const ids = memberIds.split(',').map(Number).filter(Boolean);
      if (ids.length > 0) {
        query += ` AND am.member_id IN (${ids.map(() => '?').join(',')})`;
        params.push(...ids);
      }
    }

    if (mediaType) {
      const types = mediaType.split(',').map(t => t.trim()).filter(Boolean);
      if (types.length > 0) {
        query += ` AND a.media_type IN (${types.map(() => '?').join(',')})`;
        params.push(...types);
      }
    }

    query += ' ORDER BY a.start_at ASC';

    const appearances = db.prepare(query).all(...params) as Appearance[];

    // Fetch members for each appearance
    const memberQuery = db.prepare(`
      SELECT m.*
      FROM members m
      JOIN appearance_members am ON m.id = am.member_id
      WHERE am.appearance_id = ?
    `);

    const appearancesWithMembers = appearances.map(appearance => ({
      ...appearance,
      members: memberQuery.all(appearance.id) as Member[],
    }));

    return NextResponse.json(appearancesWithMembers);
  } catch (error) {
    console.error('Failed to fetch appearances:', error);
    return NextResponse.json(
      { error: 'Failed to fetch appearances' },
      { status: 500 }
    );
  }
}

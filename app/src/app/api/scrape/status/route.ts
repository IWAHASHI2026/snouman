import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { ScrapeStatus } from '@/types/index';

export async function GET() {
  try {
    const db = getDb();
    const row = db.prepare(
      'SELECT * FROM scrape_logs ORDER BY executed_at DESC LIMIT 1'
    ).get() as { executed_at: string; status: string; items_count: number; error_message: string | null } | undefined;

    const status: ScrapeStatus = row
      ? {
          last_run: row.executed_at,
          status: row.status,
          items_count: row.items_count,
          error_message: row.error_message,
        }
      : {
          last_run: null,
          status: null,
          items_count: 0,
          error_message: null,
        };

    return NextResponse.json(status);
  } catch (error) {
    console.error('Failed to fetch scrape status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scrape status' },
      { status: 500 }
    );
  }
}

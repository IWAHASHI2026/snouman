import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Settings } from '@/types/index';

interface SettingsRow {
  notification_enabled: number;
  notification_timing: number;
  notification_members: string;
  notification_media: string;
}

function readSettings(): Settings {
  const db = getDb();
  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get() as SettingsRow | undefined;

  if (!row) {
    return {
      notification_enabled: true,
      notification_timing: 30,
      notification_members: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      notification_media: ['TV', 'RADIO', 'MOVIE'],
    };
  }

  return {
    notification_enabled: !!row.notification_enabled,
    notification_timing: row.notification_timing,
    notification_members: JSON.parse(row.notification_members),
    notification_media: JSON.parse(row.notification_media),
  };
}

export async function GET() {
  try {
    const settings = readSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Failed to read settings:', error);
    return NextResponse.json(
      { error: 'Failed to read settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const db = getDb();

    db.prepare(`
      UPDATE settings SET
        notification_enabled = ?,
        notification_timing = ?,
        notification_members = ?,
        notification_media = ?
      WHERE id = 1
    `).run(
      body.notification_enabled ? 1 : 0,
      body.notification_timing ?? 30,
      JSON.stringify(body.notification_members ?? []),
      JSON.stringify(body.notification_media ?? []),
    );

    const settings = readSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Failed to update settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}

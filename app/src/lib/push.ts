import webpush from 'web-push';
import db from '@/lib/db';
import type { AppearanceWithMembers, MediaType, PushSubscriptionRecord } from '@/types';

// Configure VAPID details from environment variables
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const MEDIA_EMOJI: Record<MediaType, string> = {
  TV: '\u{1F4FA}',      // 📺
  RADIO: '\u{1F4FB}',   // 📻
  MOVIE: '\u{1F3AC}',   // 🎬
};

function formatNotificationBody(appearance: AppearanceWithMembers): { title: string; body: string } {
  const emoji = MEDIA_EMOJI[appearance.media_type] || '';
  const memberNames = appearance.members.map((m) => m.name).join(', ');
  const startDate = new Date(appearance.start_at);
  const timeStr = startDate.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const dateStr = startDate.toLocaleDateString('ja-JP', {
    month: 'long',
    day: 'numeric',
  });

  const title = `${emoji} ${appearance.title}`;
  const parts: string[] = [];
  parts.push(`${dateStr} ${timeStr}`);
  if (appearance.channel) {
    parts.push(appearance.channel);
  }
  parts.push(memberNames);

  return { title, body: parts.join(' / ') };
}

export async function sendNotification(appearance: AppearanceWithMembers): Promise<number> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[push] VAPID keys not configured, skipping notification');
    return 0;
  }

  const subscriptions = db
    .prepare('SELECT id, endpoint, p256dh, auth, created_at FROM push_subscriptions')
    .all() as PushSubscriptionRecord[];

  if (subscriptions.length === 0) {
    return 0;
  }

  const { title, body } = formatNotificationBody(appearance);
  const payload = JSON.stringify({
    title,
    body,
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    data: {
      appearance_id: appearance.id,
      url: `/appearances/${appearance.id}`,
    },
  });

  let sentCount = 0;
  const expiredIds: number[] = [];

  for (const sub of subscriptions) {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    try {
      await webpush.sendNotification(pushSubscription, payload);
      sentCount++;
    } catch (error: unknown) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Subscription expired or unsubscribed - mark for deletion
        expiredIds.push(sub.id);
        console.log(`[push] Subscription ${sub.id} expired (status ${statusCode}), removing`);
      } else {
        console.error(`[push] Failed to send to subscription ${sub.id}:`, error);
      }
    }
  }

  // Delete expired subscriptions
  if (expiredIds.length > 0) {
    const placeholders = expiredIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM push_subscriptions WHERE id IN (${placeholders})`).run(...expiredIds);
    console.log(`[push] Removed ${expiredIds.length} expired subscription(s)`);
  }

  return sentCount;
}

export async function checkAndSendNotifications(): Promise<void> {
  // Get settings
  const settingsRow = db.prepare('SELECT * FROM settings WHERE id = 1').get() as {
    notification_enabled: number;
    notification_timing: number;
    notification_members: string;
    notification_media: string;
  } | undefined;

  if (!settingsRow || !settingsRow.notification_enabled) {
    return;
  }

  const timing = settingsRow.notification_timing; // minutes before start
  const memberFilter: number[] = JSON.parse(settingsRow.notification_members);
  const mediaFilter: MediaType[] = JSON.parse(settingsRow.notification_media);

  // Find appearances that are upcoming within the notification timing window and not yet notified
  const now = new Date();
  const windowEnd = new Date(now.getTime() + timing * 60 * 1000);

  const appearances = db
    .prepare(
      `SELECT a.* FROM appearances a
       WHERE a.notified = 0
         AND a.start_at > ?
         AND a.start_at <= ?
         AND a.media_type IN (${mediaFilter.map(() => '?').join(',')})
       ORDER BY a.start_at ASC`
    )
    .all(now.toISOString(), windowEnd.toISOString(), ...mediaFilter) as AppearanceWithMembers[];

  for (const appearance of appearances) {
    // Get members for this appearance
    const members = db
      .prepare(
        `SELECT m.* FROM members m
         INNER JOIN appearance_members am ON am.member_id = m.id
         WHERE am.appearance_id = ?`
      )
      .all(appearance.id) as AppearanceWithMembers['members'];

    appearance.members = members;

    // Check if any of the appearance members are in the notification filter
    const hasFilteredMember = members.some((m) => memberFilter.includes(m.id));
    if (!hasFilteredMember && memberFilter.length > 0) {
      continue;
    }

    // Send notification
    const sentCount = await sendNotification(appearance);
    console.log(`[push] Sent ${sentCount} notification(s) for "${appearance.title}"`);

    // Mark as notified
    db.prepare('UPDATE appearances SET notified = 1, updated_at = datetime(?) WHERE id = ?').run(
      now.toISOString(),
      appearance.id
    );
  }
}

import * as cheerio from 'cheerio';
import db from '@/lib/db';
import { findMemberIds } from '@/lib/members';
import type { MediaType } from '@/types';

const USER_AGENT = 'SnowManReminder/1.0 (Personal Use)';
const CRAWL_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja,en;q=0.5',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
  }

  return response.text();
}

function logScrape(source: string, status: 'SUCCESS' | 'ERROR', itemsCount: number, errorMessage: string | null): void {
  db.prepare(
    `INSERT INTO scrape_logs (source, status, items_count, error_message, executed_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(source, status, itemsCount, errorMessage);
}

function insertAppearance(
  title: string,
  mediaType: MediaType,
  channel: string | null,
  startAt: string,
  endAt: string | null,
  description: string | null,
  sourceUrl: string | null,
  memberIds: number[]
): boolean {
  try {
    const result = db
      .prepare(
        `INSERT OR IGNORE INTO appearances (title, media_type, channel, start_at, end_at, description, source_url, notified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))`
      )
      .run(title, mediaType, channel, startAt, endAt, description, sourceUrl);

    if (result.changes === 0) {
      return false;
    }

    const appearanceId = result.lastInsertRowid as number;

    const insertMember = db.prepare(
      'INSERT OR IGNORE INTO appearance_members (appearance_id, member_id) VALUES (?, ?)'
    );

    const insertMembers = db.transaction((ids: number[]) => {
      for (const memberId of ids) {
        insertMember.run(appearanceId, memberId);
      }
    });

    insertMembers(memberIds);
    return true;
  } catch (error) {
    console.error(`[scraper] Failed to insert appearance "${title}":`, error);
    return false;
  }
}

function detectMediaType(title: string, channel: string | null): MediaType {
  const lowerTitle = title.toLowerCase();
  const lowerChannel = (channel || '').toLowerCase();

  if (
    lowerTitle.includes('ラジオ') ||
    lowerTitle.includes('radio') ||
    lowerChannel.includes('ラジオ') ||
    lowerChannel.includes('fm') ||
    lowerChannel.includes('am') ||
    lowerChannel.includes('ニッポン放送') ||
    lowerChannel.includes('文化放送') ||
    lowerChannel.includes('tbsラジオ')
  ) {
    return 'RADIO';
  }

  if (lowerTitle.includes('映画') || lowerTitle.includes('movie')) {
    return 'MOVIE';
  }

  return 'TV';
}

// Parse Japanese date/time format like "2026年3月14日(土)" and "昼4:30" or "夜7:00"
function parseJapaneseDateTime(dateText: string, timeText: string): { startAt: string; endAt: string | null } | null {
  // Extract year, month, day
  const dateMatch = dateText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!dateMatch) return null;

  const year = dateMatch[1];
  const month = dateMatch[2].padStart(2, '0');
  const day = dateMatch[3].padStart(2, '0');

  // Parse time - handles formats like "昼4:30", "夜7:00", "朝8:00", "深夜1:00"
  const timeRange = timeText.match(/(\d{1,2}):(\d{2})(?:\s*[-～〜]\s*(\d{1,2}):(\d{2}))?/);
  if (!timeRange) {
    return { startAt: `${year}-${month}-${day}T00:00:00+09:00`, endAt: null };
  }

  let startHour = parseInt(timeRange[1], 10);
  const startMin = timeRange[2];

  // Adjust hour based on time-of-day prefix
  if (timeText.includes('深夜') || timeText.includes('午前')) {
    // 深夜1:00 means 25:00 (1 AM next day concept in Japanese TV)
    // but we keep it as-is for simplicity
  } else if (timeText.includes('昼') || timeText.includes('午後')) {
    if (startHour < 12) startHour += 12;
  } else if (timeText.includes('夜')) {
    if (startHour < 12) startHour += 12;
  } else if (timeText.includes('朝')) {
    // morning, keep as-is
  }

  const startAt = `${year}-${month}-${day}T${String(startHour).padStart(2, '0')}:${startMin}:00+09:00`;

  let endAt: string | null = null;
  if (timeRange[3] && timeRange[4]) {
    let endHour = parseInt(timeRange[3], 10);
    const endMin = timeRange[4];
    if (timeText.includes('夜') || timeText.includes('昼') || timeText.includes('午後')) {
      if (endHour < 12) endHour += 12;
    }
    endAt = `${year}-${month}-${day}T${String(endHour).padStart(2, '0')}:${endMin}:00+09:00`;
  }

  return { startAt, endAt };
}

// Scrape Snow Man group page on ザテレビジョン
export async function scrapeTheTV(): Promise<number> {
  const source = 'thetv';
  let totalInserted = 0;

  try {
    console.log('[scraper] Starting ザテレビジョン scrape...');

    // Snow Man group page
    const groupUrl = 'https://thetv.jp/person/2000024159/';
    const html = await fetchPage(groupUrl);
    const $ = cheerio.load(html);

    console.log(`[scraper] Fetched Snow Man group page`);

    // Find all links that point to /program/ pages
    const programLinks = $('a[href*="/program/"]');
    console.log(`[scraper] Found ${programLinks.length} program links`);

    const seen = new Set<string>();

    for (let i = 0; i < programLinks.length; i++) {
      const el = $(programLinks[i]);
      const href = el.attr('href') || '';
      const fullUrl = href.startsWith('http') ? href : `https://thetv.jp${href}`;

      // Deduplicate by program URL
      const programBase = href.replace(/\/\d+\/$/, '/');
      if (seen.has(programBase)) continue;
      seen.add(programBase);

      // Get the surrounding text context for title and schedule info
      const container = el.closest('li, div, article, section');
      const contextText = container.length ? container.text() : el.text();
      const title = el.text().trim();

      if (!title || title.length < 2) continue;

      // Try to parse date/time from context
      const parsed = parseJapaneseDateTime(contextText, contextText);

      if (!parsed) {
        console.log(`[scraper] Skipping "${title}" - no date found`);
        continue;
      }

      // Extract channel from context
      const channelMatch = contextText.match(/(TBS|フジテレビ|日本テレビ|テレビ朝日|テレビ東京|NHK[^\s]*|MBS|ABC|関西テレビ|読売テレビ|BS[^\s]*|WOWOW|Eテレ|NTV)/);
      const channel = channelMatch ? channelMatch[1] : null;

      // Detect media type
      const mediaType = detectMediaType(title, channel);

      // For group page, identify members from title or default to all
      const memberIds = findMemberIds(contextText);

      const inserted = insertAppearance(
        title,
        mediaType,
        channel,
        parsed.startAt,
        parsed.endAt,
        null,
        fullUrl,
        memberIds.length > 0 ? memberIds : [1, 2, 3, 4, 5, 6, 7, 8, 9]
      );

      if (inserted) {
        totalInserted++;
        console.log(`[scraper] Inserted: "${title}" at ${parsed.startAt}`);
      }

      if (i < programLinks.length - 1) {
        await sleep(CRAWL_DELAY_MS);
      }
    }

    // Also scrape individual member pages for solo appearances
    const memberPages: { id: number; name: string; url: string }[] = [
      { id: 1, name: '岩本照', url: 'https://thetv.jp/person/1000089370/' },
      { id: 2, name: '深澤辰哉', url: 'https://thetv.jp/person/1000089371/' },
      { id: 3, name: 'ラウール', url: 'https://thetv.jp/person/2000039356/' },
      { id: 4, name: '渡辺翔太', url: 'https://thetv.jp/person/1000089372/' },
      { id: 5, name: '向井康二', url: 'https://thetv.jp/person/1000073109/' },
      { id: 6, name: '阿部亮平', url: 'https://thetv.jp/person/2000024165/' },
      { id: 7, name: '目黒蓮', url: 'https://thetv.jp/person/2000002192/' },
      { id: 8, name: '宮舘涼太', url: 'https://thetv.jp/person/2000024163/' },
      { id: 9, name: '佐久間大介', url: 'https://thetv.jp/person/2000024162/' },
    ];

    for (const member of memberPages) {
      try {
        await sleep(CRAWL_DELAY_MS);
        console.log(`[scraper] Fetching page for ${member.name}...`);
        const memberHtml = await fetchPage(member.url);
        const $m = cheerio.load(memberHtml);

        const memberProgramLinks = $m('a[href*="/program/"]');

        for (let j = 0; j < memberProgramLinks.length; j++) {
          const el = $m(memberProgramLinks[j]);
          const mHref = el.attr('href') || '';
          const mFullUrl = mHref.startsWith('http') ? mHref : `https://thetv.jp${mHref}`;

          const mProgramBase = mHref.replace(/\/\d+\/$/, '/');
          if (seen.has(mProgramBase)) continue;
          seen.add(mProgramBase);

          const mContainer = el.closest('li, div, article, section');
          const mContextText = mContainer.length ? mContainer.text() : el.text();
          const mTitle = el.text().trim();

          if (!mTitle || mTitle.length < 2) continue;

          const mParsed = parseJapaneseDateTime(mContextText, mContextText);
          if (!mParsed) continue;

          const mChannelMatch = mContextText.match(/(TBS|フジテレビ|日本テレビ|テレビ朝日|テレビ東京|NHK[^\s]*|MBS|ABC|関西テレビ|読売テレビ|BS[^\s]*|WOWOW|Eテレ|NTV)/);
          const mChannel = mChannelMatch ? mChannelMatch[1] : null;

          const mMediaType = detectMediaType(mTitle, mChannel);
          const mMemberIds = findMemberIds(mContextText);

          const mInserted = insertAppearance(
            mTitle,
            mMediaType,
            mChannel,
            mParsed.startAt,
            mParsed.endAt,
            null,
            mFullUrl,
            mMemberIds.length > 0 ? mMemberIds : [member.id]
          );

          if (mInserted) {
            totalInserted++;
            console.log(`[scraper] Inserted (${member.name}): "${mTitle}" at ${mParsed.startAt}`);
          }
        }
      } catch (memberError) {
        console.error(`[scraper] Failed to scrape ${member.name}:`, memberError);
      }
    }

    logScrape(source, 'SUCCESS', totalInserted, null);
    console.log(`[scraper] ザテレビジョン: inserted ${totalInserted} new appearance(s)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logScrape(source, 'ERROR', totalInserted, message);
    console.error(`[scraper] ザテレビジョン scrape failed:`, error);
  }

  return totalInserted;
}

export async function scrapeAll(): Promise<{ total: number; sources: Record<string, number> }> {
  console.log('[scraper] Starting full scrape...');

  const sources: Record<string, number> = {};

  const theTvCount = await scrapeTheTV();
  sources['thetv'] = theTvCount;

  const total = Object.values(sources).reduce((sum, count) => sum + count, 0);
  console.log(`[scraper] Full scrape completed: ${total} new appearance(s) total`);

  return { total, sources };
}

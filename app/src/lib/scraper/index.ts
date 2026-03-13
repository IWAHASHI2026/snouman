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
      // Duplicate detected, skip member insertion
      return false;
    }

    const appearanceId = result.lastInsertRowid as number;

    // Insert member associations
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

export async function scrapeTheTV(): Promise<number> {
  const source = 'thetv';
  let totalInserted = 0;

  try {
    console.log('[scraper] Starting ザテレビジョン scrape...');

    // Scrape TV listing pages for Snow Man
    const searchUrl = 'https://thetv.jp/search/?q=Snow+Man&type=program';
    const html = await fetchPage(searchUrl);
    const $ = cheerio.load(html);

    // Parse program listing items
    // The actual selectors depend on the site structure; this is a best-effort implementation
    const programItems = $('article, .program-item, .search-result-item, .resultList__item');

    console.log(`[scraper] Found ${programItems.length} potential items on ザテレビジョン`);

    for (let i = 0; i < programItems.length; i++) {
      const item = $(programItems[i]);

      const titleEl = item.find('h2, h3, .program-title, .resultList__itemTitle, a[title]').first();
      const title = titleEl.text().trim();

      if (!title) continue;

      // Extract broadcast info
      const infoText = item.find('.program-info, .resultList__itemInfo, .broadcast-info, time').text().trim();
      const channelEl = item.find('.channel, .program-channel, .resultList__itemChannel').first();
      const channel = channelEl.text().trim() || null;

      // Try to extract date/time from the info text
      const dateMatch = infoText.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
      const timeMatch = infoText.match(/(\d{1,2}):(\d{2})/);

      let startAt: string;
      if (dateMatch) {
        const year = dateMatch[1];
        const month = dateMatch[2].padStart(2, '0');
        const day = dateMatch[3].padStart(2, '0');
        if (timeMatch) {
          const hour = timeMatch[1].padStart(2, '0');
          const minute = timeMatch[2];
          startAt = `${year}-${month}-${day}T${hour}:${minute}:00`;
        } else {
          startAt = `${year}-${month}-${day}T00:00:00`;
        }
      } else {
        // If we can't parse a date, skip this item
        continue;
      }

      // Extract link for source URL
      const linkEl = item.find('a[href]').first();
      const href = linkEl.attr('href') || null;
      const sourceUrl = href ? (href.startsWith('http') ? href : `https://thetv.jp${href}`) : null;

      // Determine description
      const descEl = item.find('.program-description, .resultList__itemDesc, p').first();
      const description = descEl.text().trim() || null;

      // Identify members from title and description
      const fullText = `${title} ${description || ''} ${infoText}`;
      const memberIds = findMemberIds(fullText);

      if (memberIds.length === 0) {
        // Skip items where we can't identify any Snow Man member
        continue;
      }

      // Determine media type
      let mediaType: MediaType = 'TV';
      const lowerTitle = title.toLowerCase();
      const lowerChannel = (channel || '').toLowerCase();
      if (
        lowerTitle.includes('ラジオ') ||
        lowerTitle.includes('radio') ||
        lowerChannel.includes('ラジオ') ||
        lowerChannel.includes('fm') ||
        lowerChannel.includes('am')
      ) {
        mediaType = 'RADIO';
      }

      const inserted = insertAppearance(title, mediaType, channel, startAt, null, description, sourceUrl, memberIds);
      if (inserted) {
        totalInserted++;
      }

      // Respect crawl delay
      if (i < programItems.length - 1) {
        await sleep(CRAWL_DELAY_MS);
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

  // ザテレビジョン
  const theTvCount = await scrapeTheTV();
  sources['thetv'] = theTvCount;

  // Additional scrapers can be added here in the future:
  // sources['tvguide'] = await scrapeTVGuide();
  // sources['natalie'] = await scrapeNatalie();

  const total = Object.values(sources).reduce((sum, count) => sum + count, 0);
  console.log(`[scraper] Full scrape completed: ${total} new appearance(s) total`);

  return { total, sources };
}

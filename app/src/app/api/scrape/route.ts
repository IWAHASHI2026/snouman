import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const startTime = Date.now();
    const { scrapeAll } = await import('@/lib/scraper');
    const result = await scrapeAll();
    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      new_items: result.total,
      sources: result.sources,
      duration_ms: durationMs,
    });
  } catch (error) {
    console.error('Scrape failed:', error);
    return NextResponse.json(
      { error: 'Scrape failed', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

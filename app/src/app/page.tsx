'use client';

import { useEffect, useState } from 'react';
import type { AppearanceWithMembers } from '@/types';
import AppearanceCard from '@/components/AppearanceCard';
import CountdownTimer from '@/components/CountdownTimer';

function getTodayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isPastAppearance(appearance: AppearanceWithMembers): boolean {
  const endTime = appearance.end_at || appearance.start_at;
  return new Date(endTime) < new Date();
}

function getNextUpcomingTime(
  appearances: AppearanceWithMembers[]
): string | null {
  const now = new Date();
  const upcoming = appearances
    .filter((a) => new Date(a.start_at) > now)
    .sort(
      (a, b) =>
        new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
  return upcoming.length > 0 ? upcoming[0].start_at : null;
}

export default function HomePage() {
  const [appearances, setAppearances] = useState<AppearanceWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAppearances() {
      try {
        const today = getTodayString();
        const res = await fetch(
          `/api/appearances?from=${today}&to=${today}`
        );
        if (!res.ok) throw new Error('Failed to fetch appearances');
        const data: AppearanceWithMembers[] = await res.json();
        data.sort(
          (a, b) =>
            new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
        );
        setAppearances(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'エラーが発生しました');
      } finally {
        setLoading(false);
      }
    }
    fetchAppearances();
  }, []);

  const nextTime = getNextUpcomingTime(appearances);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-foreground-sub text-sm">読み込み中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-500 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-bold text-foreground">
        今日の出演情報
      </h2>

      <CountdownTimer targetTime={nextTime} />

      {appearances.length === 0 ? (
        <div className="rounded-xl bg-white px-4 py-10 text-center text-sm text-foreground-sub shadow-sm">
          今日の出演情報はありません
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {appearances.map((appearance) => (
            <AppearanceCard
              key={appearance.id}
              appearance={appearance}
              isPast={isPastAppearance(appearance)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

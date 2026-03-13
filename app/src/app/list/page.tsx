'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AppearanceWithMembers, MediaType, Member } from '@/types';
import AppearanceCard from '@/components/AppearanceCard';

const MEDIA_TYPES: { value: MediaType; label: string }[] = [
  { value: 'TV', label: 'TV' },
  { value: 'RADIO', label: 'ラジオ' },
  { value: 'MOVIE', label: '映画' },
];

function groupByDate(
  appearances: AppearanceWithMembers[]
): Record<string, AppearanceWithMembers[]> {
  const groups: Record<string, AppearanceWithMembers[]> = {};
  for (const a of appearances) {
    const dateKey = a.start_at.slice(0, 10);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(a);
  }
  return groups;
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const w = weekdays[date.getDay()];
  return `${m}月${d}日(${w})`;
}

const PAGE_SIZE = 20;

export default function ListPage() {
  const [appearances, setAppearances] = useState<AppearanceWithMembers[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const [selectedMedia, setSelectedMedia] = useState<Set<MediaType>>(
    new Set(['TV', 'RADIO', 'MOVIE'])
  );
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);

  // Fetch members
  useEffect(() => {
    fetch('/api/members')
      .then((res) => res.json())
      .then((data: Member[]) => setMembers(data))
      .catch(console.error);
  }, []);

  const fetchAppearances = useCallback(
    async (reset: boolean = false) => {
      const currentOffset = reset ? 0 : offset;
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const today = new Date().toISOString().slice(0, 10);
        const params = new URLSearchParams({
          from: today,
          limit: String(PAGE_SIZE),
          offset: String(currentOffset),
        });

        const mediaArr = Array.from(selectedMedia);
        if (mediaArr.length < 3) {
          params.set('media', mediaArr.join(','));
        }
        if (selectedMemberId !== null) {
          params.set('member', String(selectedMemberId));
        }

        const res = await fetch(`/api/appearances?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data: AppearanceWithMembers[] = await res.json();

        if (reset) {
          setAppearances(data);
          setOffset(data.length);
        } else {
          setAppearances((prev) => [...prev, ...data]);
          setOffset(currentOffset + data.length);
        }
        setHasMore(data.length === PAGE_SIZE);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [offset, selectedMedia, selectedMemberId]
  );

  // Initial fetch and refetch on filter change
  useEffect(() => {
    fetchAppearances(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMedia, selectedMemberId]);

  const toggleMedia = useCallback((mediaType: MediaType) => {
    setSelectedMedia((prev) => {
      const next = new Set(prev);
      if (next.has(mediaType)) {
        if (next.size > 1) next.delete(mediaType);
      } else {
        next.add(mediaType);
      }
      return next;
    });
  }, []);

  const grouped = groupByDate(appearances);
  const sortedDates = Object.keys(grouped).sort();

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-bold text-foreground">出演リスト</h2>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-xl bg-white p-3 shadow-sm">
        {/* Media type toggles */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-foreground-sub font-medium min-w-[50px]">
            種別:
          </span>
          <div className="flex gap-2">
            {MEDIA_TYPES.map((mt) => (
              <button
                key={mt.value}
                onClick={() => toggleMedia(mt.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  selectedMedia.has(mt.value)
                    ? 'bg-accent text-white'
                    : 'bg-background-sub text-foreground-sub'
                }`}
              >
                {mt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Member dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-foreground-sub font-medium min-w-[50px]">
            メンバー:
          </span>
          <select
            value={selectedMemberId ?? ''}
            onChange={(e) =>
              setSelectedMemberId(
                e.target.value ? Number(e.target.value) : null
              )
            }
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-foreground"
          >
            <option value="">全員</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Appearances grouped by date */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-foreground-sub">
          読み込み中...
        </div>
      ) : sortedDates.length === 0 ? (
        <div className="rounded-xl bg-white px-4 py-10 text-center text-sm text-foreground-sub shadow-sm">
          出演情報が見つかりません
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {sortedDates.map((date) => (
            <div key={date}>
              <h3 className="mb-2 text-sm font-bold text-foreground-sub">
                {formatDateLabel(date)}
              </h3>
              <div className="flex flex-col gap-2">
                {grouped[date]
                  .sort(
                    (a, b) =>
                      new Date(a.start_at).getTime() -
                      new Date(b.start_at).getTime()
                  )
                  .map((appearance) => (
                    <AppearanceCard
                      key={appearance.id}
                      appearance={appearance}
                    />
                  ))}
              </div>
            </div>
          ))}

          {hasMore && (
            <button
              onClick={() => fetchAppearances(false)}
              disabled={loadingMore}
              className="mx-auto rounded-full bg-accent px-6 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {loadingMore ? '読み込み中...' : 'もっと見る'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

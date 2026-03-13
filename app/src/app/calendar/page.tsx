'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { AppearanceWithMembers, Member } from '@/types';

const FullCalendar = dynamic(() => import('@fullcalendar/react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-20 text-sm text-foreground-sub">
      カレンダーを読み込み中...
    </div>
  ),
});

import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core';

const MEMBER_COLORS: Record<string, string> = {
  岩本照: '#F9E401',
  深澤辰哉: '#784497',
  ラウール: '#E0E0E0',
  渡辺翔太: '#0068B7',
  向井康二: '#EE7700',
  阿部亮平: '#009F45',
  目黒蓮: '#2A2C2B',
  宮舘涼太: '#E60012',
  佐久間大介: '#FF69B4',
};

const DARK_BG_COLORS = new Set(['#784497', '#0068B7', '#2A2C2B', '#E60012']);

export default function CalendarPage() {
  const [appearances, setAppearances] = useState<AppearanceWithMembers[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<number>>(
    new Set()
  );
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<{
    from: string;
    to: string;
  } | null>(null);

  // Fetch members list
  useEffect(() => {
    fetch('/api/members')
      .then((res) => res.json())
      .then((data: Member[]) => {
        setMembers(data);
        setSelectedMembers(new Set(data.map((m) => m.id)));
      })
      .catch(console.error);
  }, []);

  // Fetch appearances when date range changes
  useEffect(() => {
    if (!dateRange) return;
    setLoading(true);
    fetch(
      `/api/appearances?from=${dateRange.from}&to=${dateRange.to}`
    )
      .then((res) => res.json())
      .then((data: AppearanceWithMembers[]) => {
        setAppearances(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [dateRange]);

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    const from = arg.startStr.slice(0, 10);
    const to = arg.endStr.slice(0, 10);
    setDateRange({ from, to });
  }, []);

  const toggleMember = useCallback((memberId: number) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  }, []);

  const events: EventInput[] = useMemo(() => {
    return appearances
      .filter((a) =>
        a.members.some((m) => selectedMembers.has(m.id))
      )
      .map((a) => {
        const color =
          a.members.length > 0
            ? MEMBER_COLORS[a.members[0].name] || '#4A90D9'
            : '#4A90D9';
        const textColor = DARK_BG_COLORS.has(color) ? '#FFFFFF' : '#333333';
        return {
          id: String(a.id),
          title: a.title,
          start: a.start_at,
          end: a.end_at || undefined,
          backgroundColor: color,
          borderColor: color === '#E0E0E0' ? '#CCCCCC' : color,
          textColor,
          extendedProps: {
            sourceUrl: a.source_url,
          },
        };
      });
  }, [appearances, selectedMembers]);

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const url = arg.event.extendedProps.sourceUrl;
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-bold text-foreground">カレンダー</h2>

      <div className="rounded-xl bg-white p-2 shadow-sm overflow-hidden">
        {loading && appearances.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-sm text-foreground-sub">
            読み込み中...
          </div>
        ) : (
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale="ja"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek',
            }}
            events={events}
            datesSet={handleDatesSet}
            eventClick={handleEventClick}
            eventClassNames="cursor-pointer"
            height="auto"
            buttonText={{
              today: '今日',
              month: '月',
              week: '週',
            }}
          />
        )}
      </div>

      {/* Member filter toggles */}
      <div className="rounded-xl bg-white p-3 shadow-sm">
        <p className="mb-2 text-xs font-medium text-foreground-sub">
          メンバーフィルター
        </p>
        <div className="flex flex-wrap gap-2">
          {members.map((member) => {
            const isSelected = selectedMembers.has(member.id);
            const bgColor = isSelected ? member.color : '#F5F5F5';
            const isWhite = member.color.toUpperCase() === '#FFFFFF';
            const textColor = isSelected
              ? DARK_BG_COLORS.has(member.color)
                ? '#FFFFFF'
                : '#333333'
              : '#999999';

            return (
              <button
                key={member.id}
                onClick={() => toggleMember(member.id)}
                className="rounded-full px-3 py-1 text-xs font-medium transition-all"
                style={{
                  backgroundColor: bgColor,
                  color: textColor,
                  border:
                    isWhite && isSelected
                      ? '1px solid #E0E0E0'
                      : '1px solid transparent',
                  opacity: isSelected ? 1 : 0.5,
                }}
              >
                {member.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

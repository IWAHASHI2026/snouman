'use client';

import type { AppearanceWithMembers, MediaType } from '@/types';
import MemberBadge from './MemberBadge';

interface AppearanceCardProps {
  appearance: AppearanceWithMembers;
  isPast?: boolean;
}

const MEDIA_EMOJI: Record<MediaType, string> = {
  TV: '📺',
  RADIO: '📻',
  MOVIE: '🎬',
};

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function AppearanceCard({
  appearance,
  isPast = false,
}: AppearanceCardProps) {
  const firstMemberColor =
    appearance.members.length > 0 ? appearance.members[0].color : '#4A90D9';
  const borderColor =
    firstMemberColor.toUpperCase() === '#FFFFFF'
      ? '#E0E0E0'
      : firstMemberColor;

  const timeRange = appearance.end_at
    ? `${formatTime(appearance.start_at)} - ${formatTime(appearance.end_at)}`
    : formatTime(appearance.start_at);

  const content = (
    <div
      className="appearance-card"
      style={{
        borderLeftColor: borderColor,
        opacity: isPast ? 0.5 : 1,
      }}
    >
      <div className="mb-1 flex items-center gap-2 text-xs text-foreground-sub">
        <span>{MEDIA_EMOJI[appearance.media_type]}</span>
        <span>{timeRange}</span>
        {appearance.channel && (
          <>
            <span className="text-foreground-sub/40">|</span>
            <span>{appearance.channel}</span>
          </>
        )}
      </div>
      <h3 className="mb-2 text-sm font-medium text-foreground leading-snug">
        {appearance.title}
      </h3>
      <div className="flex flex-wrap gap-1">
        {appearance.members.map((member) => (
          <MemberBadge key={member.id} member={member} />
        ))}
      </div>
    </div>
  );

  if (appearance.source_url) {
    return (
      <a href={appearance.source_url} target="_blank" rel="noopener noreferrer" className="block">
        {content}
      </a>
    );
  }

  return content;
}

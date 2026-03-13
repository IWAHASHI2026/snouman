import type { Member } from '@/types';

interface MemberBadgeProps {
  member: Member;
}

const DARK_BG_COLORS = new Set(['#784497', '#0068B7', '#2A2C2B', '#E60012']);

function getTextColor(bgColor: string): string {
  return DARK_BG_COLORS.has(bgColor.toUpperCase()) ? '#FFFFFF' : '#333333';
}

function isWhiteColor(color: string): boolean {
  return color.toUpperCase() === '#FFFFFF';
}

export default function MemberBadge({ member }: MemberBadgeProps) {
  const textColor = getTextColor(member.color);
  const isWhite = isWhiteColor(member.color);

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-tight whitespace-nowrap"
      style={{
        backgroundColor: member.color,
        color: textColor,
        border: isWhite ? '1px solid #E0E0E0' : 'none',
      }}
    >
      {member.name}
    </span>
  );
}

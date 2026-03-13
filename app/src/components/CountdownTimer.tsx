'use client';

import { useEffect, useState } from 'react';

interface CountdownTimerProps {
  targetTime: string | null;
}

function formatCountdown(diffMs: number): string {
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function CountdownTimer({ targetTime }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState<string | null>(null);

  useEffect(() => {
    if (!targetTime) {
      setRemaining(null);
      return;
    }

    function update() {
      const diff = new Date(targetTime!).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining(null);
      } else {
        setRemaining(formatCountdown(diff));
      }
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  if (!remaining) return null;

  return (
    <div className="rounded-xl bg-accent/10 px-4 py-3 text-center">
      <p className="text-xs text-foreground-sub mb-1">次の出演まで</p>
      <p className="text-2xl font-bold text-accent tracking-widest">
        あと {remaining}
      </p>
    </div>
  );
}

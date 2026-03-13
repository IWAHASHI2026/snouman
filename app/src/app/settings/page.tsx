'use client';

import { useEffect, useState } from 'react';
import type { MediaType, Member, ScrapeStatus, Settings } from '@/types';

const DARK_BG_COLORS = new Set(['#784497', '#0068B7', '#2A2C2B', '#E60012']);

const TIMING_OPTIONS = [
  { value: 5, label: '5分前' },
  { value: 15, label: '15分前' },
  { value: 30, label: '30分前' },
];

const MEDIA_OPTIONS: { value: MediaType; label: string }[] = [
  { value: 'TV', label: 'TV' },
  { value: 'RADIO', label: 'ラジオ' },
  { value: 'MOVIE', label: '映画' },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    notification_enabled: false,
    notification_timing: 15,
    notification_members: [],
    notification_media: ['TV', 'RADIO', 'MOVIE'],
  });
  const [members, setMembers] = useState<Member[]>([]);
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then((r) => r.json()),
      fetch('/api/members').then((r) => r.json()),
      fetch('/api/scrape/status').then((r) => r.json()),
    ])
      .then(([settingsData, membersData, statusData]) => {
        setSettings(settingsData as Settings);
        setMembers(membersData as Member[]);
        setScrapeStatus(statusData as ScrapeStatus);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleNotificationToggle = async () => {
    if (!settings.notification_enabled) {
      // Enabling - request permission
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;
      }
    }
    setSettings((prev) => ({
      ...prev,
      notification_enabled: !prev.notification_enabled,
    }));
  };

  const toggleMember = (memberId: number) => {
    setSettings((prev) => {
      const members = prev.notification_members.includes(memberId)
        ? prev.notification_members.filter((id) => id !== memberId)
        : [...prev.notification_members, memberId];
      return { ...prev, notification_members: members };
    });
  };

  const toggleMedia = (mediaType: MediaType) => {
    setSettings((prev) => {
      const media = prev.notification_media.includes(mediaType)
        ? prev.notification_media.filter((m) => m !== mediaType)
        : [...prev.notification_media, mediaType];
      return { ...prev, notification_media: media };
    });
  };

  const saveSettings = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaveMessage('保存しました');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch {
      setSaveMessage('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleManualScrape = async () => {
    setScraping(true);
    try {
      const res = await fetch('/api/scrape', { method: 'POST' });
      if (!res.ok) throw new Error('Scrape failed');
      // Refresh status
      const statusRes = await fetch('/api/scrape/status');
      const status: ScrapeStatus = await statusRes.json();
      setScrapeStatus(status);
    } catch (err) {
      console.error(err);
    } finally {
      setScraping(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-foreground-sub">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-bold text-foreground">設定</h2>

      {/* Notification toggle */}
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">通知</h3>
            <p className="text-xs text-foreground-sub">
              出演前にプッシュ通知を受け取る
            </p>
          </div>
          <button
            onClick={handleNotificationToggle}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              settings.notification_enabled ? 'bg-accent' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                settings.notification_enabled ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
      </section>

      {/* Notification timing */}
      {settings.notification_enabled && (
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-medium text-foreground">
            通知タイミング
          </h3>
          <div className="flex flex-col gap-2">
            {TIMING_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-3 text-sm text-foreground"
              >
                <input
                  type="radio"
                  name="timing"
                  checked={settings.notification_timing === opt.value}
                  onChange={() =>
                    setSettings((prev) => ({
                      ...prev,
                      notification_timing: opt.value,
                    }))
                  }
                  className="h-4 w-4 accent-accent"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Member filter */}
      {settings.notification_enabled && (
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-medium text-foreground">
            通知するメンバー
          </h3>
          <div className="flex flex-col gap-2">
            {members.map((member) => (
              <label
                key={member.id}
                className="flex items-center gap-3 text-sm text-foreground"
              >
                <input
                  type="checkbox"
                  checked={settings.notification_members.includes(member.id)}
                  onChange={() => toggleMember(member.id)}
                  className="h-4 w-4 accent-accent"
                />
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{
                    backgroundColor: member.color,
                    border:
                      member.color.toUpperCase() === '#FFFFFF'
                        ? '1px solid #E0E0E0'
                        : 'none',
                  }}
                />
                {member.name}
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Media type filter */}
      {settings.notification_enabled && (
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-medium text-foreground">
            通知するメディア
          </h3>
          <div className="flex flex-col gap-2">
            {MEDIA_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-3 text-sm text-foreground"
              >
                <input
                  type="checkbox"
                  checked={settings.notification_media.includes(opt.value)}
                  onChange={() => toggleMedia(opt.value)}
                  className="h-4 w-4 accent-accent"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Save button */}
      <button
        onClick={saveSettings}
        disabled={saving}
        className="rounded-xl bg-accent py-3 text-sm font-bold text-white transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {saving ? '保存中...' : '設定を保存'}
      </button>
      {saveMessage && (
        <p
          className={`text-center text-xs ${
            saveMessage.includes('失敗')
              ? 'text-red-500'
              : 'text-green-600'
          }`}
        >
          {saveMessage}
        </p>
      )}

      {/* Scraping status */}
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-medium text-foreground">
          スクレイピング状況
        </h3>
        {scrapeStatus ? (
          <div className="flex flex-col gap-1 text-xs text-foreground-sub">
            <p>
              最終実行:{' '}
              {scrapeStatus.last_run
                ? new Date(scrapeStatus.last_run).toLocaleString('ja-JP')
                : '未実行'}
            </p>
            <p>ステータス: {scrapeStatus.status || '-'}</p>
            <p>取得件数: {scrapeStatus.items_count}</p>
            {scrapeStatus.error_message && (
              <p className="text-red-500">
                エラー: {scrapeStatus.error_message}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-foreground-sub">情報なし</p>
        )}
        <button
          onClick={handleManualScrape}
          disabled={scraping}
          className="mt-3 w-full rounded-lg border border-accent py-2 text-xs font-medium text-accent transition-opacity hover:bg-accent/5 disabled:opacity-50"
        >
          {scraping ? '実行中...' : '手動スクレイピング'}
        </button>
      </section>
    </div>
  );
}

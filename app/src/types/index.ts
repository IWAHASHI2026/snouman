export type MediaType = 'TV' | 'RADIO' | 'MOVIE';

export interface Member {
  id: number;
  name: string;
  name_kana: string;
  name_alpha: string;
  color: string;
  color_name: string;
  active: number;
}

export interface Appearance {
  id: number;
  title: string;
  media_type: MediaType;
  channel: string | null;
  start_at: string;
  end_at: string | null;
  description: string | null;
  source_url: string | null;
  notified: number;
  created_at: string;
  updated_at: string;
  members?: Member[];
}

export interface AppearanceWithMembers extends Appearance {
  members: Member[];
}

export interface PushSubscriptionRecord {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export interface Settings {
  notification_enabled: boolean;
  notification_timing: number;
  notification_members: number[];
  notification_media: MediaType[];
}

export interface ScrapeLog {
  id: number;
  source: string;
  status: 'SUCCESS' | 'ERROR';
  items_count: number;
  error_message: string | null;
  executed_at: string;
}

export interface ScrapeStatus {
  last_run: string | null;
  status: string | null;
  items_count: number;
  error_message: string | null;
}

# Snow Man 出演情報リマインダー — 仕様書

> **バージョン**: 1.0
> **作成日**: 2026-03-13
> **ステータス**: 初版
> **関連ドキュメント**: [要件定義書](./requirements.md)

---

## 1. 技術スタック

| 領域 | 技術 | バージョン | 選定理由 |
|------|------|----------|---------|
| フロントエンド | Next.js (App Router) | 15.x | React系SSR対応、フロント/バックエンド統合 |
| スタイリング | Tailwind CSS | 4.x | ユーティリティファースト、高速開発 |
| カレンダー | FullCalendar (React) | 6.x | 月間/週間表示、イベント色分け対応 |
| バックエンド | Next.js API Routes | — | フロントと同一プロジェクト |
| データベース | SQLite (better-sqlite3) | — | サーバー不要、個人利用に最適 |
| スクレイピング | Cheerio + Playwright | — | 静的/動的ページ両対応 |
| 定期実行 | node-cron | — | プロセス内スケジューラ |
| プッシュ通知 | web-push (npm) | — | VAPID鍵によるWeb Push送信 |
| フォント | Noto Sans JP | — | 日本語Webフォント |
| ホスティング | VPS (さくら/ConoHa) | — | cron + スクレイピング自由実行 |
| リバースプロキシ | Nginx + Let's Encrypt | — | HTTPS化 |
| プロセス管理 | PM2 | — | 常時稼働・自動再起動 |
| 言語 | TypeScript | 5.x | 型安全 |

---

## 2. システムアーキテクチャ

### 2.1 全体構成

```
┌─────────────────────────────────────────────────────┐
│                    VPS (1台)                         │
│                                                     │
│  ┌────────────────────────────────────────────────┐  │
│  │         Nginx (リバースプロキシ)                 │  │
│  │    - SSL/TLS (Let's Encrypt)                   │  │
│  │    - :443 → localhost:3000                     │  │
│  └────────────────────┬───────────────────────────┘  │
│                       │                              │
│  ┌────────────────────▼───────────────────────────┐  │
│  │         Next.js アプリ (:3000)                  │  │
│  │                                                │  │
│  │  ┌──────────────┐  ┌────────────────────────┐  │  │
│  │  │ フロントエンド  │  │   API Routes          │  │  │
│  │  │ (React)       │  │   /api/appearances     │  │  │
│  │  │               │  │   /api/settings        │  │  │
│  │  │ - ダッシュボード│  │   /api/push/subscribe  │  │  │
│  │  │ - カレンダー   │  │   /api/scrape          │  │  │
│  │  │ - リスト       │  │                        │  │  │
│  │  │ - 設定        │  │                        │  │  │
│  │  └──────────────┘  └────────────────────────┘  │  │
│  │                                                │  │
│  │  ┌──────────────────────────────────────────┐  │  │
│  │  │           Cron Jobs (node-cron)           │  │  │
│  │  │  - スクレイピング: 毎時0分               　│  │  │
│  │  │  - 映画情報取得: 毎日 06:00                │  │  │
│  │  │  - 通知チェック: 毎分                      │  │  │
│  │  │  - 古いデータ削除: 毎日 03:00              │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────┐  ┌────────────────┐               │
│  │  SQLite      │  │ Service Worker │               │
│  │  (data.db)   │  │ (sw.js)        │               │
│  └──────────────┘  └────────────────┘               │
│                                                     │
│  PM2 (プロセス管理・自動再起動)                       │
└─────────────────────────────────────────────────────┘
```

### 2.2 リクエストフロー

1. ブラウザ → Nginx (HTTPS:443) → Next.js (:3000)
2. Next.js が SSR またはクライアントサイドレンダリングでページを返却
3. フロントエンドから API Routes へ fetch でデータ取得
4. API Routes が SQLite からデータを読み書き

### 2.3 通知フロー

1. ブラウザが Service Worker を登録
2. Service Worker が Push Manager でサブスクリプションを取得
3. サブスクリプション情報を `/api/push/subscribe` に送信して DB に保存
4. node-cron が毎分、出演時刻の15分前（設定値）に該当する出演情報をチェック
5. 該当があれば web-push ライブラリで Push 通知を送信
6. Service Worker が Push イベントを受信し、ブラウザ通知を表示

---

## 3. データベース設計

### 3.1 ER図（概念）

```
members ──┐
          ├── appearance_members ──── appearances
          │
push_subscriptions (独立)
settings (独立)
scrape_logs (独立)
```

### 3.2 テーブル定義

#### members（メンバーマスタ）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | INTEGER | PRIMARY KEY | メンバーID |
| name | TEXT | NOT NULL | 名前（漢字） |
| name_kana | TEXT | NOT NULL | ふりがな |
| name_alpha | TEXT | NOT NULL | アルファベット表記 |
| color | TEXT | NOT NULL | メンバーカラー（HEXコード） |
| color_name | TEXT | NOT NULL | カラー名（日本語） |
| active | INTEGER | NOT NULL DEFAULT 1 | 有効フラグ |

**初期データ**:

```sql
INSERT INTO members (id, name, name_kana, name_alpha, color, color_name) VALUES
(1, '岩本照',   'いわもと ひかる',   'Hikaru Iwamoto',   '#F9E401', '黄色'),
(2, '深澤辰哉', 'ふかざわ たつや',   'Tatsuya Fukazawa', '#784497', '紫'),
(3, 'ラウール',  'らうーる',         'Raul',             '#FFFFFF', '白'),
(4, '渡辺翔太', 'わたなべ しょうた',  'Shota Watanabe',   '#0068B7', '青'),
(5, '向井康二', 'むかい こうじ',     'Koji Mukai',       '#EE7700', 'オレンジ'),
(6, '阿部亮平', 'あべ りょうへい',   'Ryohei Abe',       '#009F45', '緑'),
(7, '目黒蓮',   'めぐろ れん',       'Ren Meguro',       '#2A2C2B', '黒'),
(8, '宮舘涼太', 'みやだて りょうた', 'Ryota Miyadate',   '#E60012', '赤'),
(9, '佐久間大介', 'さくま だいすけ',  'Daisuke Sakuma',   '#FF69B4', 'ピンク');
```

#### appearances（出演情報）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 出演情報ID |
| title | TEXT | NOT NULL | 番組名 / 映画タイトル |
| media_type | TEXT | NOT NULL | メディア種別: `TV` / `RADIO` / `MOVIE` |
| channel | TEXT | | チャンネル名 / 局名 / 配給会社 |
| start_at | TEXT | NOT NULL | 開始日時 (ISO 8601) |
| end_at | TEXT | | 終了日時 (ISO 8601) |
| description | TEXT | | 補足情報 |
| source_url | TEXT | | 情報取得元URL |
| notified | INTEGER | NOT NULL DEFAULT 0 | 通知済みフラグ (0: 未通知, 1: 通知済み) |
| created_at | TEXT | NOT NULL DEFAULT (datetime('now')) | 作成日時 |
| updated_at | TEXT | NOT NULL DEFAULT (datetime('now')) | 更新日時 |

**ユニーク制約**: `UNIQUE(title, start_at, channel)` — 重複排除用

#### appearance_members（出演メンバー中間テーブル）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| appearance_id | INTEGER | NOT NULL, FK → appearances(id) ON DELETE CASCADE | 出演情報ID |
| member_id | INTEGER | NOT NULL, FK → members(id) | メンバーID |

**主キー**: `PRIMARY KEY (appearance_id, member_id)`

#### push_subscriptions（プッシュ通知サブスクリプション）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | サブスクリプションID |
| endpoint | TEXT | NOT NULL UNIQUE | Push Service エンドポイントURL |
| p256dh | TEXT | NOT NULL | クライアント公開鍵 |
| auth | TEXT | NOT NULL | 認証シークレット |
| created_at | TEXT | NOT NULL DEFAULT (datetime('now')) | 登録日時 |

#### settings（設定）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| key | TEXT | PRIMARY KEY | 設定キー |
| value | TEXT | NOT NULL | 設定値（JSON文字列） |
| updated_at | TEXT | NOT NULL DEFAULT (datetime('now')) | 更新日時 |

**設定キー一覧**:

| key | デフォルト value | 説明 |
|-----|----------------|------|
| `notification_enabled` | `"true"` | 通知の有効/無効 |
| `notification_timing` | `"15"` | 通知タイミング（分） |
| `notification_members` | `"[1,2,3,4,5,6,7,8,9]"` | 通知対象メンバーID配列 |
| `notification_media` | `"[\"TV\",\"RADIO\",\"MOVIE\"]"` | 通知対象メディア種別配列 |

#### scrape_logs（スクレイピングログ）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | ログID |
| source | TEXT | NOT NULL | スクレイピングソース名 |
| status | TEXT | NOT NULL | `SUCCESS` / `ERROR` |
| items_count | INTEGER | NOT NULL DEFAULT 0 | 取得件数 |
| error_message | TEXT | | エラーメッセージ |
| executed_at | TEXT | NOT NULL DEFAULT (datetime('now')) | 実行日時 |

### 3.3 インデックス

```sql
CREATE INDEX idx_appearances_start_at ON appearances(start_at);
CREATE INDEX idx_appearances_media_type ON appearances(media_type);
CREATE INDEX idx_appearances_notified ON appearances(notified);
CREATE INDEX idx_appearance_members_member_id ON appearance_members(member_id);
```

---

## 4. API設計

### 4.1 エンドポイント一覧

| メソッド | パス | 概要 |
|---------|------|------|
| GET | `/api/appearances` | 出演情報の取得 |
| GET | `/api/appearances/:id` | 出演情報の詳細取得 |
| POST | `/api/push/subscribe` | Push通知サブスクリプション登録 |
| DELETE | `/api/push/subscribe` | Push通知サブスクリプション解除 |
| GET | `/api/settings` | 設定の取得 |
| PUT | `/api/settings` | 設定の更新 |
| POST | `/api/scrape` | 手動スクレイピング実行 |
| GET | `/api/scrape/status` | スクレイピング状態の取得 |
| GET | `/api/members` | メンバー一覧の取得 |

### 4.2 API詳細

#### GET `/api/appearances`

出演情報を検索・取得する。

**クエリパラメータ**:

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| from | string | No | 開始日 (YYYY-MM-DD)。デフォルト: 今日 |
| to | string | No | 終了日 (YYYY-MM-DD)。デフォルト: from + 7日 |
| member_ids | string | No | メンバーIDのカンマ区切り (例: `1,3,5`) |
| media_type | string | No | メディア種別のカンマ区切り (例: `TV,RADIO`) |

**レスポンス** (200 OK):

```json
{
  "appearances": [
    {
      "id": 1,
      "title": "ザ！鉄腕！DASH!!",
      "media_type": "TV",
      "channel": "日本テレビ",
      "start_at": "2026-03-15T19:00:00+09:00",
      "end_at": "2026-03-15T19:54:00+09:00",
      "description": null,
      "source_url": "https://example.com/...",
      "members": [
        {
          "id": 7,
          "name": "目黒蓮",
          "color": "#2A2C2B"
        }
      ]
    }
  ],
  "total": 1
}
```

#### GET `/api/appearances/:id`

指定IDの出演情報を取得する。

**レスポンス** (200 OK): 上記 `appearances` 配列の1要素と同じ構造。

**エラー** (404 Not Found): `{ "error": "Appearance not found" }`

#### POST `/api/push/subscribe`

ブラウザの Push Subscription 情報を保存する。

**リクエストボディ**:

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": {
    "p256dh": "BNcRd...",
    "auth": "tBHI..."
  }
}
```

**レスポンス** (201 Created): `{ "success": true }`

#### DELETE `/api/push/subscribe`

Push Subscription を解除する。

**リクエストボディ**: `{ "endpoint": "https://..." }`

**レスポンス** (200 OK): `{ "success": true }`

#### GET `/api/settings`

全設定を取得する。

**レスポンス** (200 OK):

```json
{
  "notification_enabled": true,
  "notification_timing": 15,
  "notification_members": [1, 2, 3, 4, 5, 6, 7, 8, 9],
  "notification_media": ["TV", "RADIO", "MOVIE"]
}
```

#### PUT `/api/settings`

設定を更新する。

**リクエストボディ**: GET `/api/settings` と同じ構造（部分更新可）。

**レスポンス** (200 OK): 更新後の設定全体。

#### POST `/api/scrape`

手動でスクレイピングを実行する。

**レスポンス** (200 OK):

```json
{
  "success": true,
  "new_items": 5,
  "updated_items": 2,
  "duration_ms": 12345
}
```

#### GET `/api/scrape/status`

最新のスクレイピング実行状態を取得する。

**レスポンス** (200 OK):

```json
{
  "last_run": "2026-03-13T10:00:00+09:00",
  "status": "SUCCESS",
  "items_count": 15,
  "error_message": null,
  "next_run": "2026-03-13T11:00:00+09:00"
}
```

#### GET `/api/members`

メンバー一覧を取得する。

**レスポンス** (200 OK):

```json
{
  "members": [
    {
      "id": 1,
      "name": "岩本照",
      "name_kana": "いわもと ひかる",
      "color": "#F9E401",
      "color_name": "黄色"
    }
  ]
}
```

---

## 5. スクレイピング仕様

### 5.1 スクレイピング対象と手法

| ソース | URL構造 | 対象 | 手法 | 頻度 | ライブラリ |
|--------|---------|------|------|------|----------|
| ザテレビジョン（thetv.jp） | `thetv.jp/person/*/` (タレント個別ページ) | TV・ラジオ出演情報 | ページ解析 | 1時間ごと | Cheerio |
| 番組.Gガイド（bangumi.org） | `bangumi.org/talents/*/` (タレント番組表) | 番組表データ（補完） | ページ解析 | 1日1回 | Cheerio / Playwright |

#### スクレイピング対象の詳細

**ザテレビジョン（メインソース）**:
- タレント個別ページにTV・ラジオ・映画の出演情報が充実
- robots.txt で許可済み
- Crawl-delay: 2秒（robots.txt に準拠）
- メンバー9名の個別ページ + 「Snow Man」グループページから取得
- 出演スケジュールが日付別に整理されておりパースしやすい

**番組.Gガイド（補完ソース）**:
- 番組表データからTV・ラジオの出演情報を補完取得
- ザテレビジョンで取得できない番組情報を補完する役割
- 1日1回（早朝）の取得で十分

### 5.2 スクレイピングフロー

```
1. 対象ページを取得 (fetch / Playwright)
2. HTML を解析 (Cheerio)
3. 出演情報を抽出
   - 番組名、放送日時、チャンネル名
   - 出演者名からメンバーを判定
4. 表記ゆれ辞書でメンバーマッチング
5. 重複チェック (title + start_at + channel)
   - 新規 → INSERT
   - 既存 → 変更があれば UPDATE
6. スクレイピングログを記録
```

### 5.3 メンバーマッチング辞書

各メンバーについて、以下のパターンでマッチングを行う:

```typescript
type MemberAliases = {
  member_id: number;
  patterns: string[];
};

const MEMBER_ALIASES: MemberAliases[] = [
  {
    member_id: 1,
    patterns: ['岩本照', 'いわもとひかる', 'イワモトヒカル', 'Hikaru Iwamoto', '岩本']
  },
  {
    member_id: 2,
    patterns: ['深澤辰哉', 'ふかざわたつや', 'フカザワタツヤ', 'Tatsuya Fukazawa', '深澤', '深沢']
  },
  {
    member_id: 3,
    patterns: ['ラウール', 'らうーる', 'Raul', 'ラウル']
  },
  {
    member_id: 4,
    patterns: ['渡辺翔太', 'わたなべしょうた', 'ワタナベショウタ', 'Shota Watanabe', '渡辺']
  },
  {
    member_id: 5,
    patterns: ['向井康二', 'むかいこうじ', 'ムカイコウジ', 'Koji Mukai', '向井']
  },
  {
    member_id: 6,
    patterns: ['阿部亮平', 'あべりょうへい', 'アベリョウヘイ', 'Ryohei Abe', '阿部']
  },
  {
    member_id: 7,
    patterns: ['目黒蓮', 'めぐろれん', 'メグロレン', 'Ren Meguro', '目黒']
  },
  {
    member_id: 8,
    patterns: ['宮舘涼太', 'みやだてりょうた', 'ミヤダテリョウタ', 'Ryota Miyadate', '宮舘', '宮館']
  },
  {
    member_id: 9,
    patterns: ['佐久間大介', 'さくまだいすけ', 'サクマダイスケ', 'Daisuke Sakuma', '佐久間']
  }
];

// グループ全体のマッチング
const GROUP_PATTERNS = ['Snow Man', 'snowman', 'スノーマン', 'すのーまん', 'SnowMan'];
```

### 5.4 エラーハンドリング

- ネットワークエラー: 3回までリトライ（5秒間隔）
- パース失敗: エラーログを記録し、既存データは維持
- 対象サイト構造変更: エラーログに記録し、管理者（自分）が手動で対応

### 5.5 アクセス制御

- リクエスト間隔:
  - ザテレビジョン（thetv.jp）: Crawl-delay 2秒に準拠（最低2秒のインターバル）
  - 番組.Gガイド（bangumi.org）: 最低3秒のインターバル
- User-Agent: `SnowManReminder/1.0 (Personal Use)`
- 各サイトの robots.txt の Disallow を遵守

---

## 6. プッシュ通知仕様

### 6.1 VAPID鍵

- 初回起動時に VAPID 鍵ペア（公開鍵・秘密鍵）を生成し、環境変数に保存
- 公開鍵はフロントエンドに渡してサブスクリプション時に使用

```
VAPID_PUBLIC_KEY=BNcR...
VAPID_PRIVATE_KEY=xY8k...
VAPID_SUBJECT=mailto:your-email@example.com
```

### 6.2 Service Worker (`public/sw.js`)

```javascript
// Push イベントリスナー
self.addEventListener('push', (event) => {
  const data = event.data.json();
  // data: { title, body, icon, badge, tag, data: { url } }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,       // アプリアイコン
      badge: data.badge,     // 小アイコン
      tag: data.tag,         // 重複通知防止
      data: { url: data.data.url }
    })
  );
});

// 通知クリックでアプリを開く
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});
```

### 6.3 通知チェックロジック (Cron: 毎分実行)

```
1. 現在時刻を取得
2. settings から通知タイミング(N分)を取得
3. appearances から以下の条件で検索:
   - start_at が (現在時刻 + N分) 以内
   - start_at が 現在時刻より未来
   - notified = 0
   - settings の通知対象メンバー/メディアに該当
4. 該当する出演情報について:
   a. push_subscriptions の全サブスクリプションに通知送信
   b. appearances.notified を 1 に更新
```

### 6.4 通知メッセージフォーマット

```
タイトル: 📺 Snow Man 出演リマインド
本文:    【目黒蓮】ザ！鉄腕！DASH!!
         日本テレビ 19:00〜
```

メディア種別に応じたアイコン:
- TV: 📺
- ラジオ: 📻
- 映画: 🎬

---

## 7. 画面仕様

### 7.1 S-01: ダッシュボード

**URL**: `/`

**レイアウト**:

```
┌─────────────────────────────────┐
│  ❄ Snow Man Reminder           │  ← ヘッダー
├─────────────────────────────────┤
│                                 │
│  次の出演まで あと 02:34:15     │  ← カウントダウン
│                                 │
│  ─── 今日の出演 (3件) ───       │
│                                 │
│  ┌───────────────────────────┐  │
│  │ 📺 12:00〜12:30           │  │
│  │ ラヴィット！               │  │  ← 出演カード
│  │ TBSテレビ                  │  │
│  │ [目黒蓮] [ラウール]        │  │  ← メンバーカラーバッジ
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ 📺 19:00〜19:54           │  │
│  │ ザ！鉄腕！DASH!!          │  │
│  │ 日本テレビ                 │  │
│  │ [目黒蓮]                   │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ 📻 22:00〜22:30           │  │
│  │ Snow Man佐久間大介のANN   │  │
│  │ ニッポン放送               │  │
│  │ [佐久間大介]               │  │
│  └───────────────────────────┘  │
│                                 │
├────────┬────────┬────────┬──────┤
│ 🏠     │ 📅     │ 📋     │ ⚙️   │  ← 下部タブバー
│ ホーム  │カレンダー│ リスト  │ 設定  │
└────────┴────────┴────────┴──────┘
```

**仕様**:
- 出演カードは開始時刻の昇順で表示
- カウントダウンは1秒ごとに更新
- 出演時刻を過ぎたカードは半透明（opacity: 0.5）にする
- 出演情報がない場合は「今日の出演情報はありません」と表示
- メンバーカラーバッジは `border-left` でもカード左端に4pxの色帯として表示

### 7.2 S-02: カレンダー

**URL**: `/calendar`

**レイアウト**:

```
┌─────────────────────────────────┐
│  ❄ Snow Man Reminder           │
├─────────────────────────────────┤
│                                 │
│  ◀ 2026年3月 ▶    [月][週]     │  ← 月/週切替
│                                 │
│  ┌──┬──┬──┬──┬──┬──┬──┐        │
│  │日│月│火│水│木│金│土│        │
│  ├──┼──┼──┼──┼──┼──┼──┤        │
│  │  │  │  │  │  │  │  │        │
│  │  │  │  │● │  │●●│  │        │  ← メンバーカラードット
│  │  │  │  │  │  │  │  │        │
│  ├──┼──┼──┼──┼──┼──┼──┤        │
│  │  │  │  │  │  │  │  │        │
│  └──┴──┴──┴──┴──┴──┴──┘        │
│                                 │
│  ── メンバーフィルター ──        │
│  [岩本照][深澤辰哉]...          │  ← トグルボタン
│                                 │
├────────┬────────┬────────┬──────┤
│ 🏠     │ 📅     │ 📋     │ ⚙️   │
└────────┴────────┴────────┴──────┘
```

**仕様**:
- FullCalendar を使用
- イベントの背景色はメンバーカラー
- 複数メンバーの出演は最初のメンバーのカラーを使用し、バッジで他メンバーを表示
- カレンダーのイベントをタップすると詳細ポップアップを表示
- メンバーフィルターのトグルはメンバーカラーで色付け
- 月間表示ではイベント名を省略表示（カラードットのみ）、週間表示では時間帯付きで表示

### 7.3 S-03: リスト

**URL**: `/list`

**レイアウト**:

```
┌─────────────────────────────────┐
│  ❄ Snow Man Reminder           │
├─────────────────────────────────┤
│                                 │
│  フィルター: [TV][ラジオ][映画]  │
│  メンバー:   [全員 ▼]           │
│                                 │
│  ── 2026年3月15日（日）──       │
│                                 │
│  ┌───────────────────────────┐  │
│  │ 📺 ラヴィット! 12:00〜    │  │
│  │ [目黒蓮] [ラウール]        │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ 📺 ザ！鉄腕！DASH!! 19:00│  │
│  │ [目黒蓮]                   │  │
│  └───────────────────────────┘  │
│                                 │
│  ── 2026年3月16日（月）──       │
│  ...                            │
│                                 │
├────────┬────────┬────────┬──────┤
│ 🏠     │ 📅     │ 📋     │ ⚙️   │
└────────┴────────┴────────┴──────┘
```

**仕様**:
- 日付ごとにセクション分け
- メディア種別フィルターはトグルボタン
- メンバーフィルターはドロップダウンまたはマルチセレクト
- 無限スクロールまたは「さらに読み込む」ボタンで過去データを取得
- フィルター状態は localStorage に保存

### 7.4 S-04: 設定

**URL**: `/settings`

**レイアウト**:

```
┌─────────────────────────────────┐
│  ❄ Snow Man Reminder           │
├─────────────────────────────────┤
│                                 │
│  ── 通知設定 ──                 │
│                                 │
│  プッシュ通知  [━━━━●] ON      │
│                                 │
│  通知タイミング                  │
│  ○ 5分前  ● 15分前  ○ 30分前   │
│                                 │
│  ── 通知対象メンバー ──          │
│                                 │
│  ☑ 🟡 岩本照                   │
│  ☑ 🟣 深澤辰哉                 │
│  ☑ ⚪ ラウール                  │
│  ☑ 🔵 渡辺翔太                 │
│  ☑ 🟠 向井康二                 │
│  ☑ 🟢 阿部亮平                 │
│  ☑ ⚫ 目黒蓮                   │
│  ☑ 🔴 宮舘涼太                 │
│  ☑ 🩷 佐久間大介               │
│                                 │
│  ── 通知対象メディア ──          │
│                                 │
│  ☑ 📺 テレビ                   │
│  ☑ 📻 ラジオ                   │
│  ☑ 🎬 映画                     │
│                                 │
│  ── スクレイピング ──            │
│                                 │
│  最終取得: 2026-03-13 10:00     │
│  取得件数: 15件                  │
│  状態: ✅ 正常                   │
│                                 │
│  [手動で取得する]                │
│                                 │
├────────┬────────┬────────┬──────┤
│ 🏠     │ 📅     │ 📋     │ ⚙️   │
└────────┴────────┴────────┴──────┘
```

**仕様**:
- 通知ON/OFFトグルの変更時、ブラウザの通知許可ダイアログを表示
- 設定変更は即座にAPIに保存（デバウンス: 500ms）
- メンバーチェックボックスの横にメンバーカラーの丸を表示
- 手動取得ボタンはローディング表示付き

---

## 8. デザイン仕様

### 8.1 カラーパレット

| 用途 | カラー | コード |
|------|--------|--------|
| 背景（メイン） | 白 | #FFFFFF |
| 背景（サブ） | 淡いグレー | #F5F5F5 |
| 背景（ヘッダー） | 淡いアイスブルー | #E8F4FD |
| テキスト（メイン） | ダークグレー | #333333 |
| テキスト（サブ） | ミディアムグレー | #666666 |
| アクセント | 淡いブルー | #4A90D9 |
| アクセント（ホバー） | やや濃いブルー | #357ABD |
| ボーダー | ライトグレー | #E0E0E0 |
| エラー | レッド | #E53935 |
| 成功 | グリーン | #43A047 |

### 8.2 メンバーカラー

各メンバーカラーは以下の場面で使用する:

- 出演カードの左ボーダー（4px solid）
- メンバーバッジの背景色
- カレンダーイベントの背景色
- 設定画面のメンバーチェックボックス横の丸アイコン

ラウールの白（#FFFFFF）は背景と同化するため、以下の対策を取る:
- バッジ: グレーボーダー（#CCCCCC, 1px）を追加
- カレンダー: 淡いグレー（#F0F0F0）を代替使用
- カード左ボーダー: 淡いグレー（#E0E0E0）を代替使用

### 8.3 タイポグラフィ

| 要素 | フォント | サイズ | ウェイト |
|------|---------|--------|---------|
| アプリ名 | Noto Sans JP | 20px | 700 (Bold) |
| 画面タイトル | Noto Sans JP | 18px | 700 (Bold) |
| カード番組名 | Noto Sans JP | 16px | 600 (SemiBold) |
| カード詳細 | Noto Sans JP | 14px | 400 (Regular) |
| バッジ | Noto Sans JP | 12px | 500 (Medium) |
| ナビゲーション | Noto Sans JP | 11px | 400 (Regular) |

### 8.4 コンポーネント

#### 出演カード

```
border-radius: 12px
padding: 16px
background: #FFFFFF
box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)
border-left: 4px solid [メンバーカラー]
margin-bottom: 12px
```

#### メンバーバッジ

```
border-radius: 9999px (完全丸角)
padding: 4px 12px
font-size: 12px
color: #FFFFFF (黒文字: 目黒蓮のみ反転なし、白背景のラウールは黒文字)
background: [メンバーカラー]
```

カラーとテキストのコントラスト:
- 暗い背景（紫, 青, 黒, 赤）: 白テキスト
- 明るい背景（黄色, 白, オレンジ, 緑, ピンク）: 黒テキスト (#333333)

#### 下部タブバー

```
position: fixed
bottom: 0
height: 56px
background: #FFFFFF
border-top: 1px solid #E0E0E0
```

### 8.5 装飾

- ヘッダー左にアプリ名、雪の結晶アイコン（❄）を添える
- 背景にごく薄い雪の結晶パターンを控えめに配置（opacity: 0.03）
- 全体的にクリーンで白を基調とした「雪」の世界観

### 8.6 アニメーション

- ページ遷移: fade（200ms ease-in-out）
- カード表示: slide-up + fade-in（300ms、stagger 50ms）
- カウントダウン数字: 数値変更時にスケールバウンス（100ms）
- フィルター切替: 高さアニメーション（200ms）

---

## 9. デプロイ・運用仕様

### 9.1 サーバー要件

| 項目 | 仕様 |
|------|------|
| OS | Ubuntu 22.04 LTS |
| メモリ | 1GB以上 |
| ストレージ | 20GB以上 |
| Node.js | 20.x LTS |
| VPS | さくらVPS / ConoHa VPS 等（月額500円〜1,000円） |

### 9.2 ディレクトリ構成

```
/home/app/snowman-reminder/
├── .env                      # 環境変数 (VAPID鍵等)
├── .next/                    # Next.js ビルド成果物
├── data/
│   └── data.db               # SQLite データベース
├── public/
│   ├── sw.js                 # Service Worker
│   ├── manifest.json         # PWA Manifest
│   └── icons/                # アプリアイコン
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── page.tsx          # ダッシュボード
│   │   ├── calendar/
│   │   ├── list/
│   │   ├── settings/
│   │   └── api/              # API Routes
│   ├── components/           # React コンポーネント
│   ├── lib/
│   │   ├── db.ts             # DB 接続・クエリ
│   │   ├── scraper/          # スクレイピングモジュール
│   │   ├── push.ts           # Web Push ユーティリティ
│   │   └── cron.ts           # Cron ジョブ定義
│   └── types/                # TypeScript 型定義
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

### 9.3 環境変数（`.env`）

```
# VAPID Keys (web-push generate-vapid-keys で生成)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:your-email@example.com

# Database
DATABASE_PATH=./data/data.db

# App
NODE_ENV=production
PORT=3000
```

### 9.4 Nginx 設定

```nginx
server {
    listen 443 ssl http2;
    server_name snowman-reminder.example.com;

    ssl_certificate     /etc/letsencrypt/live/snowman-reminder.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/snowman-reminder.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name snowman-reminder.example.com;
    return 301 https://$host$request_uri;
}
```

### 9.5 PM2 設定 (`ecosystem.config.js`)

```javascript
module.exports = {
  apps: [{
    name: 'snowman-reminder',
    script: 'node_modules/.bin/next',
    args: 'start',
    cwd: '/home/app/snowman-reminder',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '512M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
```

### 9.6 デプロイ手順

```bash
# 1. リポジトリクローン
git clone <repo-url> /home/app/snowman-reminder
cd /home/app/snowman-reminder

# 2. 依存関係インストール
npm ci --production=false

# 3. 環境変数設定
cp .env.example .env
# VAPID鍵を生成して設定
npx web-push generate-vapid-keys

# 4. DB 初期化
npm run db:init

# 5. ビルド
npm run build

# 6. PM2 で起動
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# 7. Nginx 設定 & SSL
sudo certbot --nginx -d snowman-reminder.example.com
```

### 9.7 バックアップ

- SQLite の DB ファイルを日次でバックアップ（cron で別ディレクトリにコピー）
- 7世代保持

```bash
# /etc/cron.d/snowman-backup
0 4 * * * app cp /home/app/snowman-reminder/data/data.db /home/app/backups/data_$(date +\%Y\%m\%d).db
0 5 * * * app find /home/app/backups -name "data_*.db" -mtime +7 -delete
```

### 9.8 監視

- PM2 のプロセス監視（自動再起動）
- scrape_logs テーブルでスクレイピングのエラー監視
- 設定画面のスクレイピング状態表示で目視確認

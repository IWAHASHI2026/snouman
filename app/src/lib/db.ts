import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'data.db');

function createDatabase(): Database.Database {
  const fs = require('fs');
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initializeTables(db);
  seedMembers(db);
  seedSettings(db);

  return db;
}

function initializeTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      name_kana TEXT NOT NULL,
      name_alpha TEXT NOT NULL,
      color TEXT NOT NULL,
      color_name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS appearances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      media_type TEXT NOT NULL CHECK(media_type IN ('TV', 'RADIO', 'MOVIE')),
      channel TEXT,
      start_at TEXT NOT NULL,
      end_at TEXT,
      description TEXT,
      source_url TEXT,
      notified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(title, start_at, channel)
    );

    CREATE TABLE IF NOT EXISTS appearance_members (
      appearance_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      PRIMARY KEY (appearance_id, member_id),
      FOREIGN KEY (appearance_id) REFERENCES appearances(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      notification_enabled INTEGER NOT NULL DEFAULT 1,
      notification_timing INTEGER NOT NULL DEFAULT 30,
      notification_members TEXT NOT NULL DEFAULT '[]',
      notification_media TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS scrape_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('SUCCESS', 'ERROR')),
      items_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_appearances_start_at ON appearances(start_at);
    CREATE INDEX IF NOT EXISTS idx_appearances_media_type ON appearances(media_type);
    CREATE INDEX IF NOT EXISTS idx_appearances_notified ON appearances(notified);
    CREATE INDEX IF NOT EXISTS idx_appearance_members_member_id ON appearance_members(member_id);
  `);
}

function seedMembers(db: Database.Database): void {
  const count = db.prepare('SELECT COUNT(*) as count FROM members').get() as { count: number };
  if (count.count > 0) return;

  const insert = db.prepare(
    'INSERT OR IGNORE INTO members (id, name, name_kana, name_alpha, color, color_name, active) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const members = [
    [1, '岩本照',   'いわもとひかる',   'Hikaru Iwamoto',   '#F9E401', 'イエロー',     1],
    [2, '深澤辰哉', 'ふかざわたつや',   'Tatsuya Fukazawa', '#784497', 'パープル',     1],
    [3, 'ラウール',  'らうーる',         'Raul',             '#FFFFFF', 'ホワイト',     1],
    [4, '渡辺翔太', 'わたなべしょうた', 'Shota Watanabe',   '#0068B7', 'ブルー',       1],
    [5, '向井康二', 'むかいこうじ',     'Koji Mukai',       '#EE7700', 'オレンジ',     1],
    [6, '阿部亮平', 'あべりょうへい',   'Ryohei Abe',       '#009F45', 'グリーン',     1],
    [7, '目黒蓮',   'めぐろれん',       'Ren Meguro',       '#2A2C2B', 'ブラック',     1],
    [8, '宮舘涼太', 'みやだてりょうた', 'Ryota Miyadate',   '#E60012', 'レッド',       1],
    [9, '佐久間大介', 'さくまだいすけ',  'Daisuke Sakuma',   '#FF69B4', 'ピンク',       1],
  ];

  const insertMany = db.transaction(() => {
    for (const m of members) {
      insert.run(...m);
    }
  });
  insertMany();
}

function seedSettings(db: Database.Database): void {
  const count = db.prepare('SELECT COUNT(*) as count FROM settings').get() as { count: number };
  if (count.count > 0) return;

  db.prepare(
    `INSERT OR IGNORE INTO settings (id, notification_enabled, notification_timing, notification_members, notification_media)
     VALUES (1, 1, 30, ?, ?)`
  ).run(
    JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9]),
    JSON.stringify(['TV', 'RADIO', 'MOVIE'])
  );
}

// Lazy singleton pattern — DB is only initialized when first accessed at runtime,
// not at module evaluation time. This prevents errors during Next.js build
// where multiple workers load the module in parallel.
const globalForDb = globalThis as typeof globalThis & {
  __snowman_db?: Database.Database;
};

function getDb(): Database.Database {
  if (!globalForDb.__snowman_db) {
    globalForDb.__snowman_db = createDatabase();
  }
  return globalForDb.__snowman_db;
}

const db = new Proxy({} as Database.Database, {
  get(_target, prop) {
    return (getDb() as Record<string | symbol, unknown>)[prop];
  },
});

export default db;
export { getDb };

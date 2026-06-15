const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dbDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, "bike_fence.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS fences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      district TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      points TEXT NOT NULL,
      center_x REAL NOT NULL,
      center_y REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bikes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bike_no TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      x REAL NOT NULL,
      y REAL NOT NULL,
      fence_id INTEGER,
      battery INTEGER NOT NULL DEFAULT 100,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fence_id) REFERENCES fences(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS work_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'normal',
      bike_id INTEGER,
      fence_id INTEGER,
      report_x REAL,
      report_y REAL,
      assignee TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME,
      FOREIGN KEY (bike_id) REFERENCES bikes(id) ON DELETE SET NULL,
      FOREIGN KEY (fence_id) REFERENCES fences(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS dispatch_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_no TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      total_distance REAL NOT NULL DEFAULT 0,
      greedy_distance REAL NOT NULL DEFAULT 0,
      distance_saved REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      snapshot_before TEXT,
      snapshot_after TEXT
    );

    CREATE TABLE IF NOT EXISTS dispatch_moves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      from_fence_id INTEGER,
      to_fence_id INTEGER,
      bike_count INTEGER NOT NULL,
      distance REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      completed_at DATETIME,
      FOREIGN KEY (task_id) REFERENCES dispatch_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (from_fence_id) REFERENCES fences(id) ON DELETE SET NULL,
      FOREIGN KEY (to_fence_id) REFERENCES fences(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bikes_fence ON bikes(fence_id);
    CREATE INDEX IF NOT EXISTS idx_bikes_status ON bikes(status);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON work_orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_type ON work_orders(type);
    CREATE INDEX IF NOT EXISTS idx_moves_task ON dispatch_moves(task_id);
  `);
}

initTables();

module.exports = db;

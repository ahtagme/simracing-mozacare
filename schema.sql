-- Schema untuk D1 Database "simracing_orders"
-- Jalankan di Cloudflare D1 Console saat first setup

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  customer_name TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  city TEXT,
  wheel TEXT,
  service TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  method TEXT,
  schedule TEXT,
  game TEXT,
  notes TEXT,
  source TEXT,
  status TEXT DEFAULT 'pending',
  updated_at TEXT,
  internal_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

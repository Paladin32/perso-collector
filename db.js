const Database = require('better-sqlite3');
const db = new Database('data.db');

db.exec(`
CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  ip TEXT,
  user_agent TEXT,
  browser TEXT,
  os TEXT,
  device TEXT,
  language TEXT,
  timezone TEXT,
  screen TEXT,
  fingerprint TEXT,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  birthdate TEXT,
  address TEXT,
  city TEXT,
  zip TEXT,
  country TEXT,
  geo_lat REAL,
  geo_lon REAL,
  geo_city TEXT,
  geo_country TEXT,
  preferences TEXT
);
`);

module.exports = db;

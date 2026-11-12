const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

function openDb(file = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'smartmonitor.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','operador')));
    CREATE TABLE IF NOT EXISTS sensors (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL, unit TEXT NOT NULL,
      min_value REAL NOT NULL, max_value REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sensor_id INTEGER NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
      value REAL NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    CREATE INDEX IF NOT EXISTS idx_readings_sensor ON readings(sensor_id, id);
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sensor_id INTEGER NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
      value REAL NOT NULL, limit_type TEXT NOT NULL, threshold REAL NOT NULL, severity TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    CREATE INDEX IF NOT EXISTS idx_events_sensor ON events(sensor_id, id);
  `);
  seed(db);
  return db;
}

function seed(db) {
  if (!db.prepare('SELECT COUNT(*) c FROM users').get().c) {
    const ins = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?,?,?)');
    ins.run('admin', bcrypt.hashSync('admin123', 10), 'admin');
    ins.run('operador', bcrypt.hashSync('operador123', 10), 'operador');
  }
  if (!db.prepare('SELECT COUNT(*) c FROM sensors').get().c) {
    const ins = db.prepare('INSERT INTO sensors (name, type, unit, min_value, max_value) VALUES (?,?,?,?,?)');
    ins.run('Temperatura sala de servidores', 'temperatura', '°C', 18, 27);
    ins.run('Humedad almacén', 'humedad', '%', 35, 70);
    ins.run('Consumo línea 1', 'consumo', 'W', 150, 450);
  }
}

module.exports = { openDb };

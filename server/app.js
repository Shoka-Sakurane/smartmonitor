const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');

const UNITS = { temperatura: '°C', humedad: '%', consumo: 'W', presion: 'hPa' };

function parseSensor(b = {}) {
  const name = String(b.name || '').trim();
  const min = Number(b.min_value);
  const max = Number(b.max_value);
  if (!name) return { error: 'El nombre es obligatorio' };
  if (!UNITS[b.type]) return { error: 'Tipo inválido: usa ' + Object.keys(UNITS).join(', ') };
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max)
    return { error: 'El umbral mínimo debe ser menor que el máximo' };
  return { values: [name, b.type, UNITS[b.type], min, max, b.active === false ? 0 : 1] };
}

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: process.env.SESSION_SECRET || 'cambia-esto-en-produccion',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' },
  }));
  app.use(express.static(path.join(__dirname, '..', 'client')));

  const auth = (req, res, next) =>
    req.session.user ? next() : res.status(401).json({ error: 'Inicia sesión para continuar' });
  const admin = (req, res, next) =>
    req.session.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Solo el administrador puede hacer esto' });

  // --- Autenticación (PB-01)
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || ''));
    if (!u || !bcrypt.compareSync(String(password || ''), u.password_hash))
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    req.session.user = { id: u.id, username: u.username, role: u.role };
    res.json(req.session.user);
  });
  app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
  app.get('/api/me', auth, (req, res) => res.json(req.session.user));

  // --- Sensores (PB-02)
  app.get('/api/sensors', auth, (req, res) =>
    res.json(db.prepare('SELECT * FROM sensors ORDER BY id').all()));

  app.post('/api/sensors', auth, admin, (req, res) => {
    const { values, error } = parseSensor(req.body);
    if (error) return res.status(400).json({ error });
    const info = db.prepare(
      'INSERT INTO sensors (name, type, unit, min_value, max_value, active) VALUES (?,?,?,?,?,?)').run(...values);
    res.status(201).json(db.prepare('SELECT * FROM sensors WHERE id = ?').get(info.lastInsertRowid));
  });

  app.put('/api/sensors/:id', auth, admin, (req, res) => {
    const { values, error } = parseSensor(req.body);
    if (error) return res.status(400).json({ error });
    const info = db.prepare(
      'UPDATE sensors SET name=?, type=?, unit=?, min_value=?, max_value=?, active=? WHERE id=?').run(...values, req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Sensor no encontrado' });
    res.json(db.prepare('SELECT * FROM sensors WHERE id = ?').get(req.params.id));
  });

  app.delete('/api/sensors/:id', auth, admin, (req, res) => {
    const info = db.prepare('DELETE FROM sensors WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Sensor no encontrado' });
    res.json({ ok: true });
  });

  // --- Lecturas (PB-03 / PB-04)
  app.get('/api/readings/latest', auth, (req, res) =>
    res.json(db.prepare(`
      SELECT s.*, r.value, r.created_at AS read_at
      FROM sensors s
      LEFT JOIN readings r ON r.id = (SELECT MAX(id) FROM readings WHERE sensor_id = s.id)
      ORDER BY s.id`).all()));

  app.get('/api/readings', auth, (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 500);
    const sensorId = parseInt(req.query.sensor_id);
    const rows = Number.isInteger(sensorId)
      ? db.prepare('SELECT * FROM readings WHERE sensor_id = ? ORDER BY id DESC LIMIT ?').all(sensorId, limit)
      : db.prepare('SELECT * FROM readings ORDER BY id DESC LIMIT ?').all(limit);
    res.json(rows.reverse());
  });

  return app;
}

module.exports = { createApp };

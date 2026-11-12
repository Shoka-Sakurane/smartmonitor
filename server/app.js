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

const since = (minutes) => (minutes > 0 ? new Date(Date.now() - minutes * 60000).toISOString() : null);
const csv = (cols, rows) =>
  [cols.join(','), ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? '')).join(','))].join('\n');

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: process.env.SESSION_SECRET || 'cambia-esto-en-produccion',
    resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax' },
  }));
  app.use(express.static(path.join(__dirname, '..', 'client')));
  app.use('/vendor', express.static(path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist')));

  const auth = (req, res, next) =>
    req.session.user ? next() : res.status(401).json({ error: 'Inicia sesión para continuar' });
  const admin = (req, res, next) =>
    req.session.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Solo el administrador puede hacer esto' });

  // --- Autenticación (HU-01)
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

  // --- Sensores y umbrales (HU-02, HU-07)
  app.get('/api/sensors', auth, (req, res) => res.json(db.prepare('SELECT * FROM sensors ORDER BY id').all()));

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

  // --- Lecturas, rango de tiempo y estadísticas (HU-04, HU-05, HU-06, HU-11, HU-14)
  app.get('/api/readings/latest', auth, (req, res) =>
    res.json(db.prepare(`
      SELECT s.*, r.value, r.created_at AS read_at FROM sensors s
      LEFT JOIN readings r ON r.id = (SELECT MAX(id) FROM readings WHERE sensor_id = s.id)
      ORDER BY s.id`).all()));

  app.get('/api/readings', auth, (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 500);
    const sid = parseInt(req.query.sensor_id);
    const from = since(Number(req.query.minutes));
    const w = [], p = [];
    if (Number.isInteger(sid)) { w.push('sensor_id = ?'); p.push(sid); }
    if (from) { w.push('created_at >= ?'); p.push(from); }
    const rows = db.prepare(
      `SELECT * FROM readings ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`).all(...p, limit);
    res.json(rows.reverse());
  });

  app.get('/api/sensors/:id/stats', auth, (req, res) => {
    const from = since(Number(req.query.minutes));
    res.json(db.prepare(
      `SELECT COUNT(*) AS n, ROUND(AVG(value), 2) AS avg, MIN(value) AS min, MAX(value) AS max
       FROM readings WHERE sensor_id = ? ${from ? 'AND created_at >= ?' : ''}`).get(...[req.params.id, from].filter(Boolean)));
  });

  // --- Eventos (HU-08, HU-09) y exportación CSV (HU-13)
  const eventRows = (q, limit) => {
    const w = [], p = [];
    if (q.sensor_id) { w.push('e.sensor_id = ?'); p.push(q.sensor_id); }
    if (q.severity) { w.push('e.severity = ?'); p.push(q.severity); }
    if (q.from) { w.push('e.created_at >= ?'); p.push(q.from); }
    if (q.to) { w.push('e.created_at <= ?'); p.push(q.to + 'T23:59:59.999Z'); }
    return db.prepare(`SELECT e.*, s.name AS sensor_name, s.unit FROM events e JOIN sensors s ON s.id = e.sensor_id
      ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY e.id DESC LIMIT ?`).all(...p, limit);
  };
  app.get('/api/events', auth, (req, res) =>
    res.json(eventRows(req.query, Math.min(parseInt(req.query.limit) || 100, 1000))));

  app.get('/api/export/:kind', auth, (req, res) => {
    const kind = req.params.kind.replace('.csv', '');
    let body;
    if (kind === 'events')
      body = csv(['id', 'sensor_name', 'value', 'limit_type', 'threshold', 'severity', 'created_at'], eventRows(req.query, 10000));
    else if (kind === 'readings')
      body = csv(['id', 'sensor_id', 'value', 'created_at'],
        db.prepare('SELECT * FROM readings ORDER BY id DESC LIMIT 10000').all());
    else return res.status(404).json({ error: 'Exportación no disponible' });
    res.type('text/csv').attachment(`${kind}.csv`).send(body);
  });

  return app;
}

module.exports = { createApp };

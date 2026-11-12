// Lecturas simuladas (caminata aleatoria) y registro automático de eventos (HU-03, HU-08).
const BASE = {
  temperatura: { center: 22, step: 4 },
  humedad: { center: 55, step: 8 },
  consumo: { center: 300, step: 70 },
  presion: { center: 1013, step: 5 },
};

function nextValue(type, prev) {
  const { center, step } = BASE[type] || { center: 50, step: 5 };
  if (prev == null) return center;
  const v = prev + (Math.random() - 0.5) * step + (center - prev) * 0.1;
  return Math.round(v * 100) / 100;
}

// Devuelve ['máximo'|'mínimo', umbral] si el valor sale del rango, o null.
const outOfRange = (s, v) => (v > s.max_value ? ['máximo', s.max_value] : v < s.min_value ? ['mínimo', s.min_value] : null);

function tick(db) {
  const sensors = db.prepare('SELECT * FROM sensors WHERE active = 1').all();
  const last = db.prepare('SELECT value FROM readings WHERE sensor_id = ? ORDER BY id DESC LIMIT 1');
  const insR = db.prepare('INSERT INTO readings (sensor_id, value) VALUES (?, ?)');
  const insE = db.prepare('INSERT INTO events (sensor_id, value, limit_type, threshold, severity) VALUES (?,?,?,?,?)');
  db.transaction(() => {
    for (const s of sensors) {
      const prev = last.get(s.id)?.value;
      const v = nextValue(s.type, prev);
      insR.run(s.id, v);
      const o = outOfRange(s, v);
      // Un evento por salida de rango (no uno por cada lectura fuera de rango).
      if (o && !(prev != null && outOfRange(s, prev))) {
        const gap = Math.abs(v - o[1]) / (s.max_value - s.min_value);
        insE.run(s.id, v, o[0], o[1], gap > 0.2 ? 'crítica' : 'advertencia');
      }
    }
  })();
  return sensors.length;
}

function start(db, ms = 3000) {
  const timer = setInterval(() => tick(db), ms);
  return () => clearInterval(timer);
}

module.exports = { tick, start, nextValue };

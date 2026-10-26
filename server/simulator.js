// Genera lecturas simuladas con una caminata aleatoria alrededor de un valor base.
const BASE = {
  temperatura: { center: 22, step: 2 },
  humedad: { center: 55, step: 5 },
  consumo: { center: 300, step: 40 },
  presion: { center: 1013, step: 3 },
};

function nextValue(type, prev) {
  const { center, step } = BASE[type] || { center: 50, step: 5 };
  if (prev == null) return center;
  const v = prev + (Math.random() - 0.5) * step + (center - prev) * 0.1;
  return Math.round(v * 100) / 100;
}

function tick(db) {
  const sensors = db.prepare('SELECT id, type FROM sensors WHERE active = 1').all();
  const last = db.prepare('SELECT value FROM readings WHERE sensor_id = ? ORDER BY id DESC LIMIT 1');
  const insert = db.prepare('INSERT INTO readings (sensor_id, value) VALUES (?, ?)');
  db.transaction(() => {
    for (const s of sensors) insert.run(s.id, nextValue(s.type, last.get(s.id)?.value));
  })();
  return sensors.length;
}

function start(db, ms = 3000) {
  const timer = setInterval(() => tick(db), ms);
  return () => clearInterval(timer);
}

module.exports = { tick, start, nextValue };

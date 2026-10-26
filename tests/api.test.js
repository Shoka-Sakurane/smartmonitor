const request = require('supertest');
const { openDb } = require('../server/db');
const { createApp } = require('../server/app');
const { tick } = require('../server/simulator');

let db, app;
beforeEach(() => { db = openDb(':memory:'); app = createApp(db); });

const login = async (u, p) => {
  const agent = request.agent(app);
  await agent.post('/api/login').send({ username: u, password: p });
  return agent;
};
const sensor = { name: 'Presión caldera', type: 'presion', min_value: 1000, max_value: 1030 };

test('rechaza credenciales incorrectas', async () => {
  const r = await request(app).post('/api/login').send({ username: 'admin', password: 'mal' });
  expect(r.status).toBe(401);
});

test('las rutas protegidas exigen sesión', async () => {
  expect((await request(app).get('/api/sensors')).status).toBe(401);
});

test('el administrador crea, edita y elimina sensores', async () => {
  const a = await login('admin', 'admin123');
  const created = await a.post('/api/sensors').send(sensor);
  expect(created.status).toBe(201);
  expect(created.body.unit).toBe('hPa');
  const upd = await a.put(`/api/sensors/${created.body.id}`).send({ ...sensor, name: 'Caldera 2' });
  expect(upd.body.name).toBe('Caldera 2');
  expect((await a.delete(`/api/sensors/${created.body.id}`)).status).toBe(200);
});

test('el operador no puede crear sensores', async () => {
  const o = await login('operador', 'operador123');
  expect((await o.post('/api/sensors').send(sensor)).status).toBe(403);
});

test('valida umbrales incorrectos', async () => {
  const a = await login('admin', 'admin123');
  const r = await a.post('/api/sensors').send({ ...sensor, min_value: 50, max_value: 10 });
  expect(r.status).toBe(400);
});

test('el simulador guarda una lectura por sensor activo', async () => {
  const n = tick(db);
  const a = await login('admin', 'admin123');
  const r = await a.get('/api/readings?limit=100');
  expect(r.body).toHaveLength(n);
});

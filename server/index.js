const { openDb } = require('./db');
const { createApp } = require('./app');
const { start } = require('./simulator');

const db = openDb();
const port = process.env.PORT || 3000;
createApp(db).listen(port, () => console.log(`SmartMonitor en http://localhost:${port}`));
start(db, Number(process.env.SIM_INTERVAL_MS) || 3000);

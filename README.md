# SmartMonitor – Dashboard de monitoreo IoT simulado

Funciones: login con roles, CRUD de sensores y umbrales, simulador de lecturas, gráficas por periodo,
eventos automáticos con filtros, alertas visuales, estadísticas y exportación a CSV.

## Cómo ejecutarlo (VS Code)
1. Abre esta carpeta en VS Code y la terminal (Ctrl+`).
2. `npm install`
3. `npm start` y abre http://localhost:3000
4. `npm test` para correr las pruebas.

Usuarios de prueba: `admin` / `admin123` y `operador` / `operador123` (cámbialos antes de desplegar).

## Estructura
- `server/` API Express, SQLite, simulador y eventos
- `client/` interfaz web (panel, gráficas, eventos)
- `tests/` pruebas con Jest y Supertest

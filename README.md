# SmartMonitor – Dashboard de monitoreo IoT simulado

Sprint 1: autenticación (PB-01), CRUD de sensores (PB-02), simulador de lecturas (PB-03), almacenamiento (PB-04) y pruebas (PB-16).

## Cómo ejecutarlo (VS Code)
1. Abre la carpeta en VS Code (Archivo > Abrir carpeta) y la terminal integrada (Ctrl+`).
2. `npm install`
3. `npm start` y abre http://localhost:3000
4. `npm test` para correr las pruebas.

Usuarios de prueba: `admin` / `admin123` y `operador` / `operador123`.

## Estructura
- `server/` API Express, base SQLite y simulador
- `client/` interfaz web
- `tests/` pruebas con Jest y Supertest

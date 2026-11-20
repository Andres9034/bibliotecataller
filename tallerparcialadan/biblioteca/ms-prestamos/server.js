// Microservicio B - Préstamos (Node.js + Express + MySQL)
// Depende de ms-libros para validar que el libro exista (servicio externo por URL en .env).
const express = require('express');
const mysql = require('mysql2/promise');

const PORT = process.env.PORT || 8002;
const LIBROS_URL = process.env.LIBROS_URL; // p. ej. http://ms-libros:8001
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
});

const log = (msg, extra = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'ms-prestamos', msg, ...extra }));

async function initDb(retries = 30) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS prestamos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        libro_id INT NOT NULL,
        usuario_id VARCHAR(128) NOT NULL,
        usuario_email VARCHAR(200),
        estado VARCHAR(20) DEFAULT 'ACTIVO',
        fecha_prestamo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        fecha_devolucion TIMESTAMP NULL
      )`);
      log('Base de datos lista');
      return;
    } catch (e) {
      log('BD no disponible, reintentando', { intento: i, error: e.message });
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error('No se pudo conectar a MySQL');
}

const app = express();
app.use(express.json());
app.use((req, _res, next) => { log('request', { method: req.method, path: req.path, user: req.header('X-User-Email') }); next(); });

app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', service: 'ms-prestamos', db: 'up' }); }
  catch { res.status(503).json({ status: 'degraded', service: 'ms-prestamos', db: 'down' }); }
});

// Préstamos del usuario autenticado (el gateway envía X-User-Id)
app.get('/prestamos', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM prestamos WHERE usuario_id = ? ORDER BY id DESC', [req.header('X-User-Id')]);
  res.json(rows);
});

app.post('/prestamos', async (req, res) => {
  const { libro_id } = req.body || {};
  if (!libro_id) return res.status(400).json({ error: 'libro_id es obligatorio' });

  // Validar el libro contra ms-libros. Si no responde, fallamos de forma controlada (503).
  try {
    const r = await fetch(`${LIBROS_URL}/libros/${libro_id}`, { signal: AbortSignal.timeout(3000) });
    if (r.status === 404) return res.status(404).json({ error: 'El libro no existe' });
    if (!r.ok) throw new Error(`ms-libros respondió ${r.status}`);
  } catch (e) {
    log('ms-libros no disponible', { error: e.message });
    return res.status(503).json({ error: 'Servicio de libros no disponible, intente más tarde' });
  }

  const [result] = await pool.query(
    'INSERT INTO prestamos (libro_id, usuario_id, usuario_email) VALUES (?, ?, ?)',
    [libro_id, req.header('X-User-Id'), req.header('X-User-Email') || null]
  );
  const [rows] = await pool.query('SELECT * FROM prestamos WHERE id = ?', [result.insertId]);
  res.status(201).json(rows[0]);
});

app.put('/prestamos/:id/devolver', async (req, res) => {
  const [r] = await pool.query(
    "UPDATE prestamos SET estado = 'DEVUELTO', fecha_devolucion = NOW() WHERE id = ? AND usuario_id = ?",
    [req.params.id, req.header('X-User-Id')]
  );
  if (!r.affectedRows) return res.status(404).json({ error: 'Préstamo no encontrado' });
  const [rows] = await pool.query('SELECT * FROM prestamos WHERE id = ?', [req.params.id]);
  res.json(rows[0]);
});

app.use((err, _req, res, _next) => { log('error', { error: err.message }); res.status(500).json({ error: 'Error interno' }); });

initDb().then(() => {
  const server = app.listen(PORT, () => log(`Escuchando en puerto ${PORT}`));
  process.on('SIGTERM', () => { log('SIGTERM recibido, cerrando'); server.close(() => pool.end().then(() => process.exit(0))); });
}).catch((e) => { log('fatal', { error: e.message }); process.exit(1); });

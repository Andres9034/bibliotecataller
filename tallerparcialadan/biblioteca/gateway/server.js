// API Gateway - valida el ID token de Firebase y enruta a cada microservicio.
// Rutas: /api/libros/* -> LIBROS_URL (microservicio ms-libros)
const express = require('express');
const cors = require('cors');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const PORT = process.env.PORT || 8080;
const ROUTES = {
  libros: process.env.LIBROS_URL,
};

// Para verificar ID tokens solo se necesita el Project ID (se usan las llaves públicas de Google).
initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });

const log = (msg, extra = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'gateway', msg, ...extra }));

const app = express();
app.use(cors({ origin: (process.env.CORS_ORIGINS || '*').split(',') }));
app.use(express.json());

// Salud del gateway + estado de cada microservicio (útil para la prueba de fallas)
app.get('/health', async (_req, res) => {
  const estado = {};
  await Promise.all(Object.entries(ROUTES).map(async ([nombre, url]) => {
    try {
      const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
      estado[nombre] = r.ok ? 'up' : 'degraded';
    } catch { estado[nombre] = 'down'; }
  }));
  res.json({ status: 'ok', service: 'gateway', microservicios: estado });
});

// Middleware de autenticación con Firebase
async function verificarToken(req, res, next) {
  const h = req.header('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) { log('acceso denegado: sin token', { path: req.path }); return res.status(401).json({ error: 'Token requerido' }); }
  try {
    const decoded = await getAuth().verifyIdToken(token);
    req.user = { uid: decoded.uid, email: decoded.email || '' };
    next();
  } catch (e) {
    log('acceso denegado: token inválido', { path: req.path, error: e.code || e.message });
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// Proxy genérico: reenvía método, cuerpo y query; añade identidad del usuario.
app.all('/api/:servicio{/*resto}', verificarToken, async (req, res) => {
  const base = ROUTES[req.params.servicio];
  if (!base) return res.status(404).json({ error: 'Ruta no encontrada' });

  const sufijo = req.originalUrl.replace(/^\/api/, ''); // /libros/1?x=y
  const destino = `${base}${sufijo}`;
  try {
    const r = await fetch(destino, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': req.user.uid,
        'X-User-Email': req.user.email,
      },
      body: ['GET', 'HEAD', 'DELETE'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(5000),
    });
    log('proxy', { method: req.method, destino, status: r.status, user: req.user.email });
    const texto = await r.text();
    res.status(r.status).type(r.headers.get('content-type') || 'application/json').send(texto);
  } catch (e) {
    // Tolerancia a fallos: solo falla la ruta del servicio caído; el resto sigue operando.
    log('microservicio no disponible', { servicio: req.params.servicio, error: e.message });
    res.status(503).json({ error: `El servicio de ${req.params.servicio} no está disponible` });
  }
});

const server = app.listen(PORT, () => log(`Gateway escuchando en puerto ${PORT}`, { rutas: ROUTES }));
process.on('SIGTERM', () => { log('SIGTERM recibido, cerrando'); server.close(() => process.exit(0)); });

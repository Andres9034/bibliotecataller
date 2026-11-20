// Microservicio C - Reseñas (Node.js + Express + MongoDB)
// Independiente: si se apaga, libros y préstamos siguen funcionando.
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const PORT = process.env.PORT || 8003;
const client = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 3000 });
let resenas;

const log = (msg, extra = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'ms-resenas', msg, ...extra }));

async function initDb(retries = 20) {
  for (let i = 1; i <= retries; i++) {
    try {
      await client.connect();
      resenas = client.db(process.env.MONGO_DB || 'biblioteca').collection('resenas');
      log('Base de datos lista');
      return;
    } catch (e) {
      log('BD no disponible, reintentando', { intento: i, error: e.message });
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error('No se pudo conectar a MongoDB');
}

const app = express();
app.use(express.json());
app.use((req, _res, next) => { log('request', { method: req.method, path: req.path, user: req.header('X-User-Email') }); next(); });

app.get('/health', async (_req, res) => {
  try { await client.db('admin').command({ ping: 1 }); res.json({ status: 'ok', service: 'ms-resenas', db: 'up' }); }
  catch { res.status(503).json({ status: 'degraded', service: 'ms-resenas', db: 'down' }); }
});

app.get('/resenas', async (req, res) => {
  const filtro = req.query.libro_id ? { libro_id: Number(req.query.libro_id) } : {};
  res.json(await resenas.find(filtro).sort({ creado_en: -1 }).toArray());
});

app.post('/resenas', async (req, res) => {
  const { libro_id, calificacion, comentario } = req.body || {};
  const cal = Number(calificacion);
  if (!libro_id || !(cal >= 1 && cal <= 5)) return res.status(400).json({ error: 'libro_id y calificacion (1-5) son obligatorios' });
  const doc = {
    libro_id: Number(libro_id),
    calificacion: cal,
    comentario: comentario || '',
    usuario_email: req.header('X-User-Email') || null,
    usuario_id: req.header('X-User-Id') || null,
    creado_en: new Date(),
  };
  const r = await resenas.insertOne(doc);
  res.status(201).json({ _id: r.insertedId, ...doc });
});

app.delete('/resenas/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'id inválido' });
  const r = await resenas.deleteOne({ _id: new ObjectId(req.params.id), usuario_id: req.header('X-User-Id') });
  if (!r.deletedCount) return res.status(404).json({ error: 'Reseña no encontrada' });
  res.status(204).end();
});

app.use((err, _req, res, _next) => { log('error', { error: err.message }); res.status(500).json({ error: 'Error interno' }); });

initDb().then(() => {
  const server = app.listen(PORT, () => log(`Escuchando en puerto ${PORT}`));
  process.on('SIGTERM', () => { log('SIGTERM recibido, cerrando'); server.close(() => client.close().then(() => process.exit(0))); });
}).catch((e) => { log('fatal', { error: e.message }); process.exit(1); });

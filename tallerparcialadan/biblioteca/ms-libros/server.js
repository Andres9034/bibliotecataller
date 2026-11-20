// Microservicio: ms-libros (Node.js + Express + MongoDB / Oracle Autonomous Database con API MongoDB)
// Registra y lista libros. Cumple 12 factores: config por variables de entorno,
// sin estado, logs a stdout, puerto por PORT, reintento de conexión y apagado ordenado.
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const PORT = process.env.PORT || 8001;
const client = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 3000 });
let libros;

const log = (msg, extra = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'ms-libros', msg, ...extra }));

// Factor IX: si MongoDB aún no está listo, reintenta en vez de caerse
async function conectarBD(intentos = 20) {
  for (let i = 1; i <= intentos; i++) {
    try {
      await client.connect();
      libros = client.db(process.env.MONGO_DB || 'biblioteca').collection('libros');
      log('Conectado a MongoDB');
      return;
    } catch (e) {
      log('MongoDB no disponible, reintentando', { intento: i, error: e.message });
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error('No se pudo conectar a MongoDB');
}

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  log('request', { method: req.method, path: req.path, usuario: req.header('X-User-Email') });
  next();
});

// Salud del servicio y de su base de datos
app.get('/health', async (_req, res) => {
  try {
    await client.db(process.env.MONGO_DB || 'biblioteca').command({ ping: 1 });
    res.json({ status: 'ok', service: 'ms-libros', db: 'up' });
  } catch {
    res.status(503).json({ status: 'degraded', service: 'ms-libros', db: 'down' });
  }
});

// Listar libros
app.get('/libros', async (_req, res) => {
  res.json(await libros.find().sort({ creado_en: -1 }).toArray());
});

// Ver un libro
app.get('/libros/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'id inválido' });
  const libro = await libros.findOne({ _id: new ObjectId(req.params.id) });
  if (!libro) return res.status(404).json({ error: 'Libro no encontrado' });
  res.json(libro);
});

// Registrar libro (el gateway envía el usuario de Firebase en X-User-Email)
app.post('/libros', async (req, res) => {
  const { titulo, autor, anio } = req.body || {};
  if (!titulo || !autor) return res.status(400).json({ error: 'titulo y autor son obligatorios' });
  const doc = {
    titulo,
    autor,
    anio: anio ? Number(anio) : null,
    registrado_por: req.header('X-User-Email') || null,
    creado_en: new Date(),
  };
  const r = await libros.insertOne(doc);
  res.status(201).json({ _id: r.insertedId, ...doc });
});

// Eliminar libro
app.delete('/libros/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'id inválido' });
  const r = await libros.deleteOne({ _id: new ObjectId(req.params.id) });
  if (!r.deletedCount) return res.status(404).json({ error: 'Libro no encontrado' });
  res.status(204).end();
});

app.use((err, _req, res, _next) => {
  log('error', { error: err.message });
  res.status(500).json({ error: 'Error interno' });
});

conectarBD()
  .then(() => {
    const server = app.listen(PORT, () => log(`Escuchando en puerto ${PORT}`));
    process.on('SIGTERM', () => {
      log('SIGTERM recibido, cerrando ordenadamente');
      server.close(() => client.close().then(() => process.exit(0)));
    });
  })
  .catch((e) => { log('fatal', { error: e.message }); process.exit(1); });

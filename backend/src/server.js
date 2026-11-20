import express from 'express';
import cors from 'cors';
import { env, isWhatsappConfigured } from './config/env.js';
import { getDbMode, initDb } from './config/db.js';
import webhookRoutes from './routes/webhook.routes.js';
import crmRoutes from './routes/crm.routes.js';

const app = express();

const allowedOrigins = env.corsOrigin
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

// Capturar rawBody para validar X-Hub-Signature-256 en el webhook de Meta
app.use(
  express.json({
    limit: '6mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'jarvi-stock-backend',
    dbMode: getDbMode(),
    whatsappCloudConfigured: isWhatsappConfigured(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/webhook', webhookRoutes);
app.use('/api', crmRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
    },
  });
});

app.use((err, _req, res, _next) => {
  console.error('[server][ERROR]', err);
  res.status(err.status || 500).json({
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: err.message || 'Error interno del servidor',
    },
  });
});

await initDb();

app.listen(env.port, () => {
  console.log(
    `[jarvi-stock-backend] Servidor escuchando en http://localhost:${env.port} (db=${getDbMode()})`
  );
});

// Rutas públicas sin autenticación. Solo exponen el QR de los agentes de
// atención activos: nunca el de un asistente privado.
import express from 'express';
import QRCode from 'qrcode';
import { findAgentByCode } from '../config/db.js';
import { buildAgentWaLink } from '../services/shareLinks.js';

const router = express.Router();

const CODE_FORMAT = /^JRV(?:-[A-Z0-9]+)+$/i;

// GET /api/public/qr/:code.png
router.get('/qr/:file', async (req, res, next) => {
  try {
    const match = String(req.params.file).match(/^(.+)\.png$/i);
    const code = match ? match[1].toUpperCase() : '';
    if (!CODE_FORMAT.test(code)) return res.status(404).end();

    const agent = await findAgentByCode(code);
    const link = buildAgentWaLink(code);
    if (!agent || agent.type !== 'attention' || !agent.active || !link) {
      return res.status(404).end();
    }

    const png = await QRCode.toBuffer(link, { type: 'png', width: 512, margin: 2 });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(png);
  } catch (err) {
    next(err);
  }
});

export default router;

import { Router } from 'express';
import { getConnectionState } from '../../common/database/connection';
import { loadEnv } from '../../config/env';

const router = Router();

router.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

router.get('/health/ready', (_req, res) => {
  const db = getConnectionState();
  const ready = db === 'connected';
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    checks: { database: db },
    env: loadEnv().NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

export default router;

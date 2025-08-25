import { Router } from 'express';
import { prisma, redis } from '@/index';

const router = Router();

router.get('/', async (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'etrax-backend',
    version: '1.0.0',
  });
});

router.get('/ready', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Check Redis connection
    await redis.ping();
    
    res.json({
      status: 'OK',
      checks: {
        database: 'healthy',
        redis: 'healthy',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      checks: {
        database: 'unhealthy',
        redis: 'unhealthy',
      },
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
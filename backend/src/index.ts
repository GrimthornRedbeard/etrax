import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Server } from 'socket.io';
import { createServer } from 'http';

import { config } from '@/config/environment';
import { logger } from '@/utils/logger';
import { errorHandler } from '@/middleware/errorHandler';
import { requestLogger } from '@/middleware/requestLogger';
import { authMiddleware } from '@/middleware/auth';
import { scheduler } from '@/services/scheduler';
import { QRCodeService } from '@/services/qr';

// Import routes
import authRoutes from '@/routes/auth';
import adminRoutes from '@/routes/admin';
import equipmentRoutes from '@/routes/equipment';
import userRoutes from '@/routes/user';
import categoryRoutes from '@/routes/category';
import locationRoutes from '@/routes/location';
import transactionRoutes from '@/routes/transaction';
import reportRoutes from '@/routes/report';
import qrRoutes from '@/routes/qr';
import voiceRoutes from '@/routes/voice';
import healthRoutes from '@/routes/health';

// Import authentication services for initialization
import { OAuth2Service } from './services/auth/OAuth2Service';
import { SAMLService } from './services/auth/SAMLService';
import { JWTService } from './services/auth/JWTService';
import passport from 'passport';

// Initialize Express app
const app = express();
const server = createServer(app);

// Initialize Socket.IO for real-time features
const io = new Server(server, {
  cors: {
    origin: config.frontend.url,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Initialize database connections
export const prisma = new PrismaClient({
  log: config.node.env === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

export const redis = new Redis(config.redis.url);

// Global middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"],
    },
  },
}));

app.use(cors({
  origin: config.frontend.url,
  credentials: true,
  optionsSuccessStatus: 200,
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.node.env === 'production' ? 1000 : 10000,
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', limiter);

// Request logging
app.use(requestLogger);

// Health check endpoints
app.use('/health', healthRoutes);

// Initialize Passport for authentication
app.use(passport.initialize());

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/categories', authMiddleware, categoryRoutes);
app.use('/api/locations', authMiddleware, locationRoutes);
app.use('/api/transactions', authMiddleware, transactionRoutes);
app.use('/api/reports', authMiddleware, reportRoutes);
app.use('/api/qr', authMiddleware, qrRoutes);
app.use('/api/voice', authMiddleware, voiceRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on('join-school', (schoolId: string) => {
    socket.join(`school:${schoolId}`);
    logger.info(`Client ${socket.id} joined school room: ${schoolId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Make io accessible throughout the app
app.set('io', io);

// Error handling
app.use(errorHandler);

// Handle 404s
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  
  server.close(async () => {
    logger.info('HTTP server closed');
    
    try {
      // Stop scheduled tasks
      scheduler.stop();
      logger.info('Scheduled tasks stopped');
      
      await prisma.$disconnect();
      logger.info('Database connection closed');
      
      redis.disconnect();
      logger.info('Redis connection closed');
      
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const PORT = config.server.port;
server.listen(PORT, async () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📝 Environment: ${config.node.env}`);
  logger.info(`🔗 Frontend URL: ${config.frontend.url}`);
  
  // Initialize services
  try {
    // Initialize authentication services
    OAuth2Service.initialize();
    logger.info('🔐 OAuth2 service initialized');
    
    await SAMLService.initialize();
    logger.info('🏢 SAML service initialized');
    
    // Start session cleanup scheduler
    setInterval(() => {
      JWTService.cleanupExpiredSessions();
    }, 60 * 60 * 1000); // Every hour
    logger.info('🧹 Session cleanup scheduler started');
    
    await scheduler.initialize();
    scheduler.start();
    logger.info('⏰ Scheduler initialized and started');
    
    await QRCodeService.initialize();
    logger.info('📱 QR Code service initialized');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
  }
});

export { io };
export default app;
import express, { Application } from 'express';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { errorHandler } from './middleware/errorHandler';

import hpp from 'hpp';
import pool from './config/database';
import { validateEnvironment } from './utils/validateEnv';
import {
  helmetConfig,
  sanitizeData,
  sanitizeInput,
  securityHeaders,
  enforceHttps,
} from './middleware/security';
import { globalLimiter, apiLimiter } from './middleware/rateLimiter';
import { corsMiddleware } from './middleware/cors';

import authRoutes from './routes/authRoutes';
import orderRoutes from './routes/orderRoutes';
import profileRoutes from './routes/profileRoutes';
import executorRoutes from './routes/executorRoutes';
import notificationRoutes from './routes/notificationRoutes';
import supportRoutes from './routes/supportRoutes';
import adminRoutes from './routes/adminRoutes';
import webhookRoutes from './routes/webhookRoutes';
import paymentService from './services/paymentService';
import notificationService from './services/notificationService';
import yookassaService from './services/yookassaService';

dotenv.config();

// Validate environment variables
validateEnvironment();

const app: Application = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const BASE_PORT = Number(process.env.PORT || 3000);

// Middleware
// Enforce HTTPS in production (behind proxy/load balancer)
app.use(enforceHttps);

// Security headers and helmet
app.use(helmetConfig);
app.use(securityHeaders);

// CORS with whitelist
app.use(corsMiddleware);

// Global rate limiting and API rate limiting
app.use(globalLimiter);
app.use('/api', apiLimiter);

// Basic input sanitization and protections
app.use(sanitizeData);
app.use(hpp());
app.use(sanitizeInput);

// Capture raw body for webhook signature verification
app.use(express.json({
  verify: (req: any, _res, buf: Buffer) => {
    try {
      req.rawBody = buf.toString();
    } catch (e) {
      req.rawBody = undefined;
    }
  }
}));

app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', async (_req, res) => {
  try {
    // Check database connection
    await pool.query('SELECT NOW()');
    
    // Check Firebase status
    const firebaseStatus = notificationService.getStatus();
    
    // Check YooKassa status
    const yookassaStatus = yookassaService.isConfigured();
    
    res.json({ 
      status: 'ok', 
      message: 'Server is running',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        firebase: firebaseStatus.initialized ? 'initialized' : 'not_configured',
        yookassa: yookassaStatus ? 'configured' : 'not_configured',
      }
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'error',
      message: 'Service unavailable',
      error: error.message,
    });
  }
});

// API routes
app.get('/api', (_req, res) => {
  res.json({ message: 'Septik Service API' });
});

// Auth routes
app.use('/api/auth', authRoutes);

// Order routes
app.use('/api/orders', orderRoutes);

// Profile routes
app.use('/api/profile', profileRoutes);

// Webhook routes (no auth required)
app.use('/api/webhooks', webhookRoutes);

// Account management routes (direct access)
app.use('/api', profileRoutes);

// Executor routes
app.use('/api/executor', executorRoutes);

// Notification routes
app.use('/api/notifications', notificationRoutes);

// Support routes
app.use('/api/support', supportRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

const listenWithFallback = (startPort: number): Promise<number> => {
  return new Promise((resolve, reject) => {
    const tryPort = (port: number) => {
      const onListening = () => {
        httpServer.off('error', onError);
        resolve(port);
      };

      const onError = (error: any) => {
        httpServer.off('listening', onListening);

        if (error?.code === 'EADDRINUSE') {
          console.warn(`⚠️ Port ${port} is busy, trying ${port + 1}...`);
          tryPort(port + 1);
          return;
        }

        reject(error);
      };

      httpServer.once('listening', onListening);
      httpServer.once('error', onError);
      httpServer.listen(port);
    };

    tryPort(startPort);
  });
};

// Test database connection and start server
const startServer = async () => {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful');

    // Start periodic sweep for expired SBP payments.
    paymentService.startSbpTimeoutScheduler();

    const activePort = await listenWithFallback(BASE_PORT);
    console.log(`🚀 Server is running on port ${activePort}`);
    console.log(`📡 WebSocket server is ready`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export { io };

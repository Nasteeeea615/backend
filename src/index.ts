import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { errorHandler } from './middleware/errorHandler';
import pool from './config/database';
import authRoutes from './routes/authRoutes';
import orderRoutes from './routes/orderRoutes';
import profileRoutes from './routes/profileRoutes';
import executorRoutes from './routes/executorRoutes';
import notificationRoutes from './routes/notificationRoutes';
import supportRoutes from './routes/supportRoutes';
import adminRoutes from './routes/adminRoutes';

dotenv.config();

const app: Application = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
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

// Test database connection and start server
const startServer = async () => {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful');

    httpServer.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📡 WebSocket server is ready`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export { io };

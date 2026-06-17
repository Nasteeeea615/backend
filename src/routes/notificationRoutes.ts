import express from 'express';
import {
  saveFCMToken,
  removeFCMToken,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  testPush,
} from '../controllers/notificationController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Save FCM token
router.post('/fcm-token', saveFCMToken);

// Remove FCM token
router.delete('/fcm-token', removeFCMToken);

// Test push (dev only)
router.post('/test', testPush);

// Get user notifications
router.get('/', getNotifications);

// Mark notification as read
router.put('/:notificationId/read', markNotificationAsRead);

// Mark all notifications as read
router.put('/read-all', markAllNotificationsAsRead);

export default router;

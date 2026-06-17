import { Response } from 'express';
import { AuthRequest } from '../types';
import notificationService from '../services/notificationService';

export const saveFCMToken = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { token, deviceType, deviceId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!token || !deviceType) {
      return res.status(400).json({ error: 'Token and deviceType are required' });
    }

    if (!['ios', 'android'].includes(deviceType)) {
      return res.status(400).json({ error: 'Invalid deviceType. Must be ios or android' });
    }

    await notificationService.saveFCMToken({
      userId,
      token,
      deviceType,
      deviceId,
    });

    return res.json({ success: true, message: 'Push token saved successfully' });
  } catch (error) {
    console.error('Error in saveFCMToken:', error);
    return res.status(500).json({ error: 'Failed to save push token' });
  }
};

export const removeFCMToken = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { token } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    await notificationService.removeFCMToken(userId, token);

    return res.json({ success: true, message: 'Push token removed successfully' });
  } catch (error) {
    console.error('Error in removeFCMToken:', error);
    return res.status(500).json({ error: 'Failed to remove push token' });
  }
};

export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const notifications = await notificationService.getUserNotifications(userId, limit);

    return res.json({ notifications });
  } catch (error) {
    console.error('Error in getNotifications:', error);
    return res.status(500).json({ error: 'Failed to get notifications' });
  }
};

export const markNotificationAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const notificationId = Array.isArray(req.params.notificationId) ? req.params.notificationId[0] : (req.params.notificationId || '');

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!notificationId) {
      return res.status(400).json({ error: 'Notification ID is required' });
    }

    await notificationService.markAsRead(notificationId, userId);

    return res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error in markNotificationAsRead:', error);
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

export const markAllNotificationsAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await notificationService.markAllAsRead(userId);

    return res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error in markAllNotificationsAsRead:', error);
    return res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
};

export const testPush = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { title, body, type } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    await notificationService.sendPushNotification({
      userId,
      type: type || 'test',
      title,
      body,
      data: { origin: 'dev_test' },
    });

    return res.json({ success: true, message: 'Test push triggered' });
  } catch (error) {
    console.error('Error in testPush:', error);
    return res.status(500).json({ error: 'Failed to send test push' });
  }
};

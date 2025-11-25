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

    res.json({ success: true, message: 'FCM token saved successfully' });
  } catch (error) {
    console.error('Error in saveFCMToken:', error);
    res.status(500).json({ error: 'Failed to save FCM token' });
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

    res.json({ success: true, message: 'FCM token removed successfully' });
  } catch (error) {
    console.error('Error in removeFCMToken:', error);
    res.status(500).json({ error: 'Failed to remove FCM token' });
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

    res.json({ notifications });
  } catch (error) {
    console.error('Error in getNotifications:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
};

export const markNotificationAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { notificationId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!notificationId) {
      return res.status(400).json({ error: 'Notification ID is required' });
    }

    await notificationService.markAsRead(notificationId, userId);

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error in markNotificationAsRead:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

export const markAllNotificationsAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await notificationService.markAllAsRead(userId);

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error in markAllNotificationsAsRead:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
};

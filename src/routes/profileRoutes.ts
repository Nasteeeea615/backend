import { Router } from 'express';
import profileController from '../controllers/profileController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/profile - Get current user profile
router.get('/', profileController.getProfile);

// PUT /api/profile - Update profile
router.put('/', profileController.updateProfile);

// DELETE /api/profile - Delete account
router.delete('/', profileController.deleteProfile);

export default router;

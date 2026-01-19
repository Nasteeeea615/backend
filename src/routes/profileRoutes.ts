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

// DELETE /api/account - Delete account (with order cleanup)
router.delete('/account', profileController.deleteAccount);

// GET /api/check-role/:role - Check if user is registered in a role
router.get('/check-role/:role', profileController.checkRole);

// POST /api/switch-role - Switch user role
router.post('/switch-role', profileController.switchRole);

export default router;

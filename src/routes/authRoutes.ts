import { Router } from 'express';
import authController from '../controllers/authController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// POST /api/auth/request-code - Send email login code
router.post('/request-code', authController.requestCode);

// POST /api/auth/verify-code - Verify email login code
router.post('/verify-code', authController.verifyCode);

// POST /api/auth/login-password - Log in with email + password
router.post('/login-password', authController.loginWithPassword);

// POST /api/auth/switch-role - Switch active role (client <-> executor)
router.post('/switch-role', authenticate, authController.switchRole);

// GET /api/auth/me - Current authenticated user
router.get('/me', authController.me);

// POST /api/auth/register-client - Register new client
router.post('/register-client', authController.registerClient);

// POST /api/auth/register-executor - Register new executor
router.post('/register-executor', authController.registerExecutor);

// POST /api/auth/logout - Logout
router.post('/logout', authController.logout);

// Backward-compatible aliases for older docs/clients
router.post('/send-sms', authController.requestCode);
router.post('/verify-sms', authController.verifyCode);

export default router;

import { Router } from 'express';
import authController from '../controllers/authController';

const router = Router();

// POST /api/auth/register-client - Register new client
router.post('/register-client', authController.registerClient);

// POST /api/auth/register-executor - Register new executor
router.post('/register-executor', authController.registerExecutor);

// POST /api/auth/logout - Logout
router.post('/logout', authController.logout);

export default router;

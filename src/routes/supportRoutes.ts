import express from 'express';
import {
  createTicket,
  getUserTickets,
  getTicketMessages,
  addUserMessage,
  getAllTickets,
  getTicketDetails,
  replyToTicket,
  updateTicketStatus,
} from '../controllers/supportController';
import { authenticate, authorize } from '../middleware/authMiddleware';

const router = express.Router();

// User routes - require authentication
router.use(authenticate);

// Create a new ticket
router.post('/tickets', createTicket);

// Get user's tickets
router.get('/tickets', getUserTickets);

// Get messages for a specific ticket
router.get('/tickets/:ticketId/messages', getTicketMessages);

// Add a message to a ticket (user reply)
router.post('/tickets/:ticketId/messages', addUserMessage);

// Admin routes - require admin role
router.get('/admin/tickets', authorize('admin'), getAllTickets);
router.get('/admin/tickets/:ticketId', authorize('admin'), getTicketDetails);
router.post('/admin/tickets/:ticketId/reply', authorize('admin'), replyToTicket);
router.put('/admin/tickets/:ticketId/status', authorize('admin'), updateTicketStatus);

export default router;

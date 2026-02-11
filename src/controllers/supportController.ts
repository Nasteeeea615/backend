import { Response } from 'express';
import { AuthRequest } from '../types';
import supportService from '../services/supportService';

/**
 * Create a new support ticket
 */
export const createTicket = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { subject, description } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!subject || !description) {
      return res.status(400).json({ error: 'Subject and description are required' });
    }

    if (subject.length > 200) {
      return res.status(400).json({ error: 'Subject must be 200 characters or less' });
    }

    const ticket = await supportService.createTicket(userId, subject, description);

    return res.status(201).json({
      success: true,
      ticket,
    });
  } catch (error) {
    console.error('Error in createTicket:', error);
    return res.status(500).json({ error: 'Failed to create ticket' });
  }
};

/**
 * Get all tickets for the authenticated user
 */
export const getUserTickets = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const tickets = await supportService.getUserTickets(userId);

    return res.json({
      success: true,
      tickets,
    });
  } catch (error) {
    console.error('Error in getUserTickets:', error);
    return res.status(500).json({ error: 'Failed to fetch tickets' });
  }
};

/**
 * Get messages for a specific ticket
 */
export const getTicketMessages = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const ticketId = Array.isArray(req.params.ticketId) ? req.params.ticketId[0] : (req.params.ticketId || '');

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!ticketId) {
      return res.status(400).json({ error: 'Ticket ID is required' });
    }

    const messages = await supportService.getTicketMessages(ticketId, userId);

    return res.json({
      success: true,
      messages,
    });
  } catch (error: any) {
    console.error('Error in getTicketMessages:', error);
    if (error.code === 'TICKET_NOT_FOUND') {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

/**
 * Add a message to a ticket (user reply)
 */
export const addUserMessage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const ticketId = Array.isArray(req.params.ticketId) ? req.params.ticketId[0] : (req.params.ticketId || '');
    const { content } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!ticketId) {
      return res.status(400).json({ error: 'Ticket ID is required' });
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    // Verify ticket belongs to user
    const ticket = await supportService.getTicketById(ticketId, userId);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const message = await supportService.addMessage(ticketId, userId, 'user', content);

    return res.status(201).json({
      success: true,
      message,
    });
  } catch (error: any) {
    console.error('Error in addUserMessage:', error);
    if (error.code === 'TICKET_NOT_FOUND') {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to add message' });
  }
};

/**
 * Get all tickets (admin only)
 */
export const getAllTickets = async (req: AuthRequest, res: Response) => {
  try {
    const { status, limit, offset } = req.query;

    const filters = {
      status: status as string | undefined,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
    };

    const result = await supportService.getAllTickets(filters);

    return res.json({
      success: true,
      tickets: result.tickets,
      total: result.total,
      limit: filters.limit,
      offset: filters.offset,
    });
  } catch (error) {
    console.error('Error in getAllTickets:', error);
    return res.status(500).json({ error: 'Failed to fetch tickets' });
  }
};

/**
 * Get ticket details with messages (admin only)
 */
export const getTicketDetails = async (req: AuthRequest, res: Response) => {
  try {
    const ticketId = Array.isArray(req.params.ticketId) ? req.params.ticketId[0] : (req.params.ticketId || '');

    if (!ticketId) {
      return res.status(400).json({ error: 'Ticket ID is required' });
    }

    const ticket = await supportService.getTicketDetails(ticketId);

    return res.json({
      success: true,
      ticket,
    });
  } catch (error: any) {
    console.error('Error in getTicketDetails:', error);
    if (error.code === 'TICKET_NOT_FOUND') {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to fetch ticket details' });
  }
};

/**
 * Reply to a ticket (admin only)
 */
export const replyToTicket = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user?.id;
    const ticketId = Array.isArray(req.params.ticketId) ? req.params.ticketId[0] : (req.params.ticketId || '');
    const { content } = req.body;

    if (!adminId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!ticketId) {
      return res.status(400).json({ error: 'Ticket ID is required' });
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const message = await supportService.addMessage(ticketId, adminId, 'admin', content);

    return res.status(201).json({
      success: true,
      message,
    });
  } catch (error: any) {
    console.error('Error in replyToTicket:', error);
    if (error.code === 'TICKET_NOT_FOUND') {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to reply to ticket' });
  }
};

/**
 * Update ticket status (admin only)
 */
export const updateTicketStatus = async (req: AuthRequest, res: Response) => {
  try {
    const ticketId = Array.isArray(req.params.ticketId) ? req.params.ticketId[0] : (req.params.ticketId || '');
    const { status } = req.body;

    if (!ticketId) {
      return res.status(400).json({ error: 'Ticket ID is required' });
    }

    if (!status || !['open', 'in_progress', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const ticket = await supportService.updateTicketStatus(ticketId, status);

    return res.json({
      success: true,
      ticket,
    });
  } catch (error: any) {
    console.error('Error in updateTicketStatus:', error);
    if (error.code === 'TICKET_NOT_FOUND') {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to update ticket status' });
  }
};

import pool from '../config/database';
import { Ticket, Message } from '../types';
import { AppError } from '../middleware/errorHandler';
import notificationService from './notificationService';

class SupportService {
  /**
   * Create a new support ticket
   */
  async createTicket(
    userId: string,
    subject: string,
    description: string
  ): Promise<Ticket> {
    try {
      const result = await pool.query(
        `INSERT INTO tickets (user_id, subject, description, status)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, subject, description, 'open']
      );

      return result.rows[0];
    } catch (error) {
      console.error('Error creating ticket:', error);
      throw new AppError('TICKET_CREATION_FAILED', 'Failed to create support ticket', 500);
    }
  }

  /**
   * Get all tickets for a user
   */
  async getUserTickets(userId: string): Promise<Ticket[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM tickets
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      );

      return result.rows;
    } catch (error) {
      console.error('Error getting user tickets:', error);
      throw new AppError('TICKETS_FETCH_FAILED', 'Failed to fetch tickets', 500);
    }
  }

  /**
   * Get ticket by ID
   */
  async getTicketById(ticketId: string, userId: string): Promise<Ticket | null> {
    try {
      const result = await pool.query(
        `SELECT * FROM tickets
         WHERE id = $1 AND user_id = $2`,
        [ticketId, userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error getting ticket:', error);
      throw new AppError('TICKET_FETCH_FAILED', 'Failed to fetch ticket', 500);
    }
  }

  /**
   * Get messages for a ticket
   */
  async getTicketMessages(ticketId: string, userId: string): Promise<Message[]> {
    try {
      // First verify the ticket belongs to the user
      const ticket = await this.getTicketById(ticketId, userId);
      if (!ticket) {
        throw new AppError('TICKET_NOT_FOUND', 'Ticket not found', 404);
      }

      const result = await pool.query(
        `SELECT m.*, 
          json_build_object('id', u.id, 'name', u.name, 'role', u.role) as sender
         FROM messages m
         JOIN users u ON m.sender_id = u.id
         WHERE m.ticket_id = $1
         ORDER BY m.created_at ASC`,
        [ticketId]
      );

      return result.rows;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      console.error('Error getting ticket messages:', error);
      throw new AppError('MESSAGES_FETCH_FAILED', 'Failed to fetch messages', 500);
    }
  }

  /**
   * Add a message to a ticket (admin reply)
   */
  async addMessage(
    ticketId: string,
    senderId: string,
    senderRole: 'user' | 'admin',
    content: string
  ): Promise<Message> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify ticket exists
      const ticketResult = await client.query(
        'SELECT * FROM tickets WHERE id = $1',
        [ticketId]
      );

      if (ticketResult.rows.length === 0) {
        throw new AppError('TICKET_NOT_FOUND', 'Ticket not found', 404);
      }

      const ticket = ticketResult.rows[0];

      // Add message
      const messageResult = await client.query(
        `INSERT INTO messages (ticket_id, sender_id, sender_role, content)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [ticketId, senderId, senderRole, content]
      );

      // Update ticket status if admin is replying
      if (senderRole === 'admin' && ticket.status === 'open') {
        await client.query(
          `UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2`,
          ['in_progress', ticketId]
        );
      }

      await client.query('COMMIT');

      const message = messageResult.rows[0];

      // Send notification to user if admin replied
      if (senderRole === 'admin') {
        await notificationService.notifyTicketReply(
          ticket.user_id,
          ticketId,
          ticket.subject
        );
      }

      return message;
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof AppError) {
        throw error;
      }
      console.error('Error adding message:', error);
      throw new AppError('MESSAGE_ADD_FAILED', 'Failed to add message', 500);
    } finally {
      client.release();
    }
  }

  /**
   * Update ticket status
   */
  async updateTicketStatus(
    ticketId: string,
    status: 'open' | 'in_progress' | 'closed'
  ): Promise<Ticket> {
    try {
      const result = await pool.query(
        `UPDATE tickets
         SET status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [status, ticketId]
      );

      if (result.rows.length === 0) {
        throw new AppError('TICKET_NOT_FOUND', 'Ticket not found', 404);
      }

      return result.rows[0];
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      console.error('Error updating ticket status:', error);
      throw new AppError('TICKET_UPDATE_FAILED', 'Failed to update ticket', 500);
    }
  }

  /**
   * Get all tickets (admin only)
   */
  async getAllTickets(filters?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ tickets: Ticket[]; total: number }> {
    try {
      let query = `
        SELECT t.*, 
          json_build_object('id', u.id, 'name', u.name, 'phone_number', u.phone_number) as user
        FROM tickets t
        JOIN users u ON t.user_id = u.id
      `;
      const params: any[] = [];
      const conditions: string[] = [];

      if (filters?.status) {
        conditions.push(`t.status = $${params.length + 1}`);
        params.push(filters.status);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY t.created_at DESC';

      if (filters?.limit) {
        query += ` LIMIT $${params.length + 1}`;
        params.push(filters.limit);
      }

      if (filters?.offset) {
        query += ` OFFSET $${params.length + 1}`;
        params.push(filters.offset);
      }

      const result = await pool.query(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM tickets t';
      if (conditions.length > 0) {
        countQuery += ' WHERE ' + conditions.join(' AND ');
      }
      const countResult = await pool.query(
        countQuery,
        params.slice(0, conditions.length)
      );

      return {
        tickets: result.rows,
        total: parseInt(countResult.rows[0].count),
      };
    } catch (error) {
      console.error('Error getting all tickets:', error);
      throw new AppError('TICKETS_FETCH_FAILED', 'Failed to fetch tickets', 500);
    }
  }

  /**
   * Get ticket details with messages (admin only)
   */
  async getTicketDetails(ticketId: string): Promise<any> {
    try {
      const ticketResult = await pool.query(
        `SELECT t.*, 
          json_build_object('id', u.id, 'name', u.name, 'phone_number', u.phone_number, 'role', u.role) as user
         FROM tickets t
         JOIN users u ON t.user_id = u.id
         WHERE t.id = $1`,
        [ticketId]
      );

      if (ticketResult.rows.length === 0) {
        throw new AppError('TICKET_NOT_FOUND', 'Ticket not found', 404);
      }

      const ticket = ticketResult.rows[0];

      // Get messages
      const messagesResult = await pool.query(
        `SELECT m.*, 
          json_build_object('id', u.id, 'name', u.name, 'role', u.role) as sender
         FROM messages m
         JOIN users u ON m.sender_id = u.id
         WHERE m.ticket_id = $1
         ORDER BY m.created_at ASC`,
        [ticketId]
      );

      return {
        ...ticket,
        messages: messagesResult.rows,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      console.error('Error getting ticket details:', error);
      throw new AppError('TICKET_FETCH_FAILED', 'Failed to fetch ticket details', 500);
    }
  }
}

export default new SupportService();

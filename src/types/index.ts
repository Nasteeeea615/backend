import { Request } from 'express';

// User types
export interface User {
  id: string;
  phone_number: string;
  email?: string | null;
  name: string;
  role: 'client' | 'executor' | 'admin';
  is_blocked: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ClientProfile {
  user_id: string;
  city: string;
  street: string;
  house_number: string;
  saved_payment_methods: PaymentMethod[];
}

export interface ExecutorProfile {
  user_id: string;
  vehicle_number: string;
  vehicle_capacity: 3 | 5 | 10;
  is_verified: boolean;
  is_working: boolean;
  rating: number;
  completed_orders_count: number;
}

// Order types
export interface Order {
  id: string;
  client_id: string;
  executor_id?: string;
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  vehicle_capacity: 3 | 5 | 10;
  city: string;
  street: string;
  house_number: string;
  scheduled_date: Date;
  scheduled_time: string;
  comment?: string;
  price: number;
  payment_type: 'cash' | 'sbp';
  payment_status?: 'pending' | 'paid' | 'failed' | 'refunded' | 'cash_collected' | 'cancelled';
  commission?: number;
  net_amount?: number;
  created_at: Date;
  accepted_at?: Date;
  completed_at?: Date;
}

// Payment types
export interface Payment {
  id: string;
  order_id: string;
  client_id: string;
  amount: number;
  status: 'pending' | 'pending_cash' | 'completed' | 'failed' | 'refunded';
  payment_method: PaymentMethod;
  transaction_id?: string;
  created_at: Date;
  completed_at?: Date;
}

export interface PaymentMethod {
  type: 'card' | 'saved_card' | 'sbp' | 'cash';
  card_last4?: string;
  card_token?: string;
}

// Ticket types
export interface Ticket {
  id: string;
  user_id: string;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'closed';
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_role: 'user' | 'admin';
  content: string;
  created_at: Date;
}

// Notification types
export interface Notification {
  id: string;
  user_id: string;
  type: 'order_accepted' | 'order_completed' | 'payment_success' | 'new_order' | 'ticket_reply';
  title: string;
  body: string;
  data?: Record<string, any>;
  is_read: boolean;
  created_at: Date;
}

// Auth types
export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

export interface JWTPayload {
  userId: string;
  role: string;
}

// API Response types
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: APIError;
}

export interface APIError {
  code: string;
  message: string;
  details?: any;
}

// DTO types
export interface CreateOrderDTO {
  vehicle_capacity: 3 | 5 | 10;
  city: string;
  street: string;
  house_number: string;
  scheduled_date: Date;
  scheduled_time: string;
  comment?: string;
  payment_type: 'cash' | 'sbp';
}

export interface RegisterClientDTO {
  phone_number: string;
  name: string;
  city: string;
  street: string;
  house_number: string;
  agreed_to_terms: boolean;
}

export interface RegisterExecutorDTO {
  phone_number: string;
  name: string;
  vehicle_number: string;
  vehicle_capacity: 3 | 5 | 10;
  agreed_to_terms: boolean;
}

export interface RequestLoginCodeDTO {
  email: string;
  role?: 'client' | 'executor' | 'admin';
}

export interface VerifyLoginCodeDTO {
  email: string;
  code: string;
  role?: 'client' | 'executor' | 'admin';
}

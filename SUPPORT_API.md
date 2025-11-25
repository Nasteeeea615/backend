# Support System API Documentation

This document describes the API endpoints for the support ticket system.

## User Endpoints

All user endpoints require authentication via JWT token in the Authorization header.

### Create a Support Ticket

Create a new support ticket.

**Endpoint:** `POST /api/support/tickets`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "subject": "Issue with order payment",
  "description": "I'm unable to complete payment for order #12345. The payment screen shows an error."
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "ticket": {
    "id": "uuid",
    "user_id": "uuid",
    "subject": "Issue with order payment",
    "description": "I'm unable to complete payment for order #12345...",
    "status": "open",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  }
}
```

**Validation:**
- `subject`: Required, max 200 characters
- `description`: Required

---

### Get User's Tickets

Get all tickets created by the authenticated user.

**Endpoint:** `GET /api/support/tickets`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "tickets": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "subject": "Issue with order payment",
      "description": "I'm unable to complete payment...",
      "status": "in_progress",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T11:00:00Z"
    }
  ]
}
```

---

### Get Ticket Messages

Get all messages for a specific ticket.

**Endpoint:** `GET /api/support/tickets/:ticketId/messages`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "messages": [
    {
      "id": "uuid",
      "ticket_id": "uuid",
      "sender_id": "uuid",
      "sender_role": "user",
      "content": "I'm unable to complete payment for order #12345",
      "created_at": "2024-01-15T10:30:00Z",
      "sender": {
        "id": "uuid",
        "name": "John Doe",
        "role": "client"
      }
    },
    {
      "id": "uuid",
      "ticket_id": "uuid",
      "sender_id": "uuid",
      "sender_role": "admin",
      "content": "Thank you for contacting us. We're looking into this issue.",
      "created_at": "2024-01-15T11:00:00Z",
      "sender": {
        "id": "uuid",
        "name": "Support Team",
        "role": "admin"
      }
    }
  ]
}
```

**Error Responses:**
- `404 Not Found`: Ticket not found or doesn't belong to user

---

### Add Message to Ticket

Add a reply message to an existing ticket.

**Endpoint:** `POST /api/support/tickets/:ticketId/messages`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "content": "I tried again but still getting the same error"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "message": {
    "id": "uuid",
    "ticket_id": "uuid",
    "sender_id": "uuid",
    "sender_role": "user",
    "content": "I tried again but still getting the same error",
    "created_at": "2024-01-15T12:00:00Z"
  }
}
```

**Validation:**
- `content`: Required, non-empty string

**Error Responses:**
- `404 Not Found`: Ticket not found or doesn't belong to user

---

## Admin Endpoints

All admin endpoints require authentication and admin role.

### Get All Tickets

Get all support tickets with optional filtering.

**Endpoint:** `GET /api/admin/tickets`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Query Parameters:**
- `status` (optional): Filter by status (`open`, `in_progress`, `closed`)
- `limit` (optional): Number of tickets to return (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Example:** `GET /api/admin/tickets?status=open&limit=20&offset=0`

**Response:** `200 OK`
```json
{
  "success": true,
  "tickets": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "subject": "Issue with order payment",
      "description": "I'm unable to complete payment...",
      "status": "open",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "user": {
        "id": "uuid",
        "name": "John Doe",
        "phone_number": "+1234567890"
      }
    }
  ],
  "total": 45,
  "limit": 20,
  "offset": 0
}
```

---

### Get Ticket Details

Get detailed information about a specific ticket including all messages.

**Endpoint:** `GET /api/admin/tickets/:ticketId`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "ticket": {
    "id": "uuid",
    "user_id": "uuid",
    "subject": "Issue with order payment",
    "description": "I'm unable to complete payment...",
    "status": "in_progress",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T11:00:00Z",
    "user": {
      "id": "uuid",
      "name": "John Doe",
      "phone_number": "+1234567890",
      "role": "client"
    },
    "messages": [
      {
        "id": "uuid",
        "ticket_id": "uuid",
        "sender_id": "uuid",
        "sender_role": "user",
        "content": "I'm unable to complete payment...",
        "created_at": "2024-01-15T10:30:00Z",
        "sender": {
          "id": "uuid",
          "name": "John Doe",
          "role": "client"
        }
      }
    ]
  }
}
```

**Error Responses:**
- `404 Not Found`: Ticket not found

---

### Reply to Ticket

Add an admin reply to a ticket. This will automatically:
- Change ticket status from `open` to `in_progress` (if applicable)
- Send a push notification to the user

**Endpoint:** `POST /api/admin/tickets/:ticketId/reply`

**Headers:**
```
Authorization: Bearer <admin-token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "content": "Thank you for contacting us. We're looking into this issue and will update you shortly."
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "message": {
    "id": "uuid",
    "ticket_id": "uuid",
    "sender_id": "uuid",
    "sender_role": "admin",
    "content": "Thank you for contacting us...",
    "created_at": "2024-01-15T11:00:00Z"
  }
}
```

**Validation:**
- `content`: Required, non-empty string

**Error Responses:**
- `404 Not Found`: Ticket not found

---

### Update Ticket Status

Update the status of a ticket.

**Endpoint:** `PUT /api/admin/tickets/:ticketId/status`

**Headers:**
```
Authorization: Bearer <admin-token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "status": "closed"
}
```

**Valid Status Values:**
- `open`: Ticket is newly created
- `in_progress`: Admin is working on the ticket
- `closed`: Ticket is resolved

**Response:** `200 OK`
```json
{
  "success": true,
  "ticket": {
    "id": "uuid",
    "user_id": "uuid",
    "subject": "Issue with order payment",
    "description": "I'm unable to complete payment...",
    "status": "closed",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T14:00:00Z"
  }
}
```

**Validation:**
- `status`: Required, must be one of: `open`, `in_progress`, `closed`

**Error Responses:**
- `400 Bad Request`: Invalid status value
- `404 Not Found`: Ticket not found

---

## Ticket Status Flow

```
open → in_progress → closed
  ↑         ↓
  └─────────┘
```

- **open**: Initial state when ticket is created
- **in_progress**: Admin has started working on the ticket (automatically set when admin replies)
- **closed**: Ticket is resolved

Tickets can be reopened by changing status back to `open` or `in_progress`.

---

## Push Notifications

The system automatically sends push notifications in the following scenarios:

1. **Admin Reply**: When an admin replies to a ticket, the user receives a notification:
   - Title: "Ответ от поддержки"
   - Body: "Получен ответ на ваше обращение: [subject]"
   - Action: Opens the support screen in the app

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `TICKET_CREATION_FAILED` | 500 | Failed to create ticket |
| `TICKETS_FETCH_FAILED` | 500 | Failed to fetch tickets |
| `TICKET_FETCH_FAILED` | 500 | Failed to fetch ticket details |
| `TICKET_NOT_FOUND` | 404 | Ticket not found or access denied |
| `MESSAGES_FETCH_FAILED` | 500 | Failed to fetch messages |
| `MESSAGE_ADD_FAILED` | 500 | Failed to add message |
| `TICKET_UPDATE_FAILED` | 500 | Failed to update ticket |

---

## Database Schema

### Tickets Table
```sql
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  subject VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('open', 'in_progress', 'closed')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Messages Table
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  sender_role VARCHAR(20) NOT NULL CHECK (sender_role IN ('user', 'admin')),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Usage Examples

### User Flow

1. **Create a ticket:**
```bash
curl -X POST http://localhost:3000/api/support/tickets \
  -H "Authorization: Bearer <user-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Payment issue",
    "description": "Cannot complete payment for order"
  }'
```

2. **Check ticket status:**
```bash
curl http://localhost:3000/api/support/tickets \
  -H "Authorization: Bearer <user-token>"
```

3. **View messages:**
```bash
curl http://localhost:3000/api/support/tickets/<ticket-id>/messages \
  -H "Authorization: Bearer <user-token>"
```

4. **Reply to ticket:**
```bash
curl -X POST http://localhost:3000/api/support/tickets/<ticket-id>/messages \
  -H "Authorization: Bearer <user-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Still having the same issue"
  }'
```

### Admin Flow

1. **View all open tickets:**
```bash
curl "http://localhost:3000/api/admin/tickets?status=open" \
  -H "Authorization: Bearer <admin-token>"
```

2. **View ticket details:**
```bash
curl http://localhost:3000/api/admin/tickets/<ticket-id> \
  -H "Authorization: Bearer <admin-token>"
```

3. **Reply to ticket:**
```bash
curl -X POST http://localhost:3000/api/admin/tickets/<ticket-id>/reply \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "We have identified the issue and are working on a fix"
  }'
```

4. **Close ticket:**
```bash
curl -X PUT http://localhost:3000/api/admin/tickets/<ticket-id>/status \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "closed"
  }'
```

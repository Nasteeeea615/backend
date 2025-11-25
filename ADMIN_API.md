# Admin API Documentation

Все admin endpoints требуют аутентификации и роли `admin`.

## Authentication

Все запросы должны включать JWT токен в заголовке:
```
Authorization: Bearer <token>/
```

## Orders Management

### GET /api/admin/orders
Получить список всех заказов с фильтрами

**Query Parameters:**
- `status` (optional): Фильтр по статусу (pending, assigned, in_progress, completed, cancelled)
- `startDate` (optional): Начальная дата (ISO 8601)
- `endDate` (optional): Конечная дата (ISO 8601)
- `page` (optional): Номер страницы (default: 1)
- `limit` (optional): Количество записей на странице (default: 20)

**Response:**
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "client_id": "uuid",
        "executor_id": "uuid",
        "status": "completed",
        "vehicle_capacity": 5,
        "city": "Москва",
        "street": "Ленина",
        "house_number": "10",
        "scheduled_date": "2024-01-15",
        "scheduled_time": "14:00",
        "comment": "Комментарий",
        "is_urgent": false,
        "price": 3000,
        "created_at": "2024-01-10T10:00:00Z",
        "accepted_at": "2024-01-10T10:30:00Z",
        "completed_at": "2024-01-15T14:30:00Z",
        "client_name": "Иван Иванов",
        "client_phone": "+79001234567",
        "executor_name": "Петр Петров",
        "executor_phone": "+79007654321"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

### PUT /api/admin/orders/:id
Обновить заказ

**Body:**
```json
{
  "status": "completed",
  "executor_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "order": { /* order object */ }
  }
}
```

### POST /api/admin/orders/:id/assign
Назначить исполнителя на заказ

**Body:**
```json
{
  "executor_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "order": { /* order object */ }
  }
}
```

## Users Management

### GET /api/admin/users
Получить список всех пользователей

**Query Parameters:**
- `role` (optional): Фильтр по роли (client, executor, admin)
- `isBlocked` (optional): Фильтр по статусу блокировки (true, false)
- `page` (optional): Номер страницы (default: 1)
- `limit` (optional): Количество записей на странице (default: 20)

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "uuid",
        "phone_number": "+79001234567",
        "name": "Иван Иванов",
        "role": "client",
        "is_blocked": false,
        "created_at": "2024-01-01T10:00:00Z",
        "updated_at": "2024-01-01T10:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

### GET /api/admin/users/:id
Получить детали пользователя

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "phone_number": "+79001234567",
      "name": "Иван Иванов",
      "role": "client",
      "is_blocked": false,
      "created_at": "2024-01-01T10:00:00Z",
      "updated_at": "2024-01-01T10:00:00Z"
    },
    "profile": {
      "user_id": "uuid",
      "city": "Москва",
      "street": "Ленина",
      "house_number": "10",
      "saved_payment_methods": []
    }
  }
}
```

### PUT /api/admin/users/:id/block
Заблокировать или разблокировать пользователя

**Body:**
```json
{
  "isBlocked": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": { /* user object */ }
  }
}
```

### PUT /api/admin/users/:id/verify
Верифицировать исполнителя

**Body:**
```json
{
  "isVerified": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "profile": {
      "user_id": "uuid",
      "vehicle_number": "А123БВ",
      "vehicle_capacity": 5,
      "is_verified": true,
      "is_working": false,
      "rating": 0,
      "completed_orders_count": 0
    }
  }
}
```

## Payments Management

### GET /api/admin/payments
Получить список всех платежей

**Query Parameters:**
- `status` (optional): Фильтр по статусу (pending, completed, failed, refunded)
- `startDate` (optional): Начальная дата (ISO 8601)
- `endDate` (optional): Конечная дата (ISO 8601)
- `page` (optional): Номер страницы (default: 1)
- `limit` (optional): Количество записей на странице (default: 20)

**Response:**
```json
{
  "success": true,
  "data": {
    "payments": [
      {
        "id": "uuid",
        "order_id": "uuid",
        "client_id": "uuid",
        "amount": 3000,
        "status": "completed",
        "payment_method": {
          "type": "card",
          "card_last4": "1234"
        },
        "transaction_id": "txn_123456",
        "created_at": "2024-01-15T14:30:00Z",
        "completed_at": "2024-01-15T14:31:00Z",
        "client_name": "Иван Иванов",
        "client_phone": "+79001234567",
        "city": "Москва",
        "street": "Ленина",
        "house_number": "10"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 80,
      "totalPages": 4
    },
    "totalAmount": 240000
  }
}
```

### POST /api/admin/payments/:id/refund
Вернуть платеж

**Response:**
```json
{
  "success": true,
  "data": {
    "payment": { /* payment object with status: "refunded" */ }
  }
}
```

## Tickets Management

### GET /api/admin/tickets
Получить список всех тикетов

**Query Parameters:**
- `status` (optional): Фильтр по статусу (open, in_progress, closed)
- `page` (optional): Номер страницы (default: 1)
- `limit` (optional): Количество записей на странице (default: 20)

**Response:**
```json
{
  "success": true,
  "data": {
    "tickets": [
      {
        "id": "uuid",
        "user_id": "uuid",
        "subject": "Проблема с оплатой",
        "description": "Не могу оплатить заказ",
        "status": "open",
        "created_at": "2024-01-15T10:00:00Z",
        "updated_at": "2024-01-15T10:00:00Z",
        "user_name": "Иван Иванов",
        "user_phone": "+79001234567",
        "user_role": "client"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 30,
      "totalPages": 2
    }
  }
}
```

### POST /api/admin/tickets/:id/reply
Ответить на тикет

**Body:**
```json
{
  "content": "Мы проверили вашу проблему..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": {
      "id": "uuid",
      "ticket_id": "uuid",
      "sender_id": "uuid",
      "sender_role": "admin",
      "content": "Мы проверили вашу проблему...",
      "created_at": "2024-01-15T11:00:00Z"
    }
  }
}
```

### PUT /api/admin/tickets/:id/status
Изменить статус тикета

**Body:**
```json
{
  "status": "closed"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "ticket": { /* ticket object */ }
  }
}
```

## Analytics

### GET /api/admin/analytics
Получить аналитику

**Query Parameters:**
- `startDate` (optional): Начальная дата (ISO 8601)
- `endDate` (optional): Конечная дата (ISO 8601)

Если даты не указаны, возвращается статистика за текущий месяц.

**Response:**
```json
{
  "success": true,
  "data": {
    "orders": {
      "total": 150,
      "byStatus": [
        { "status": "completed", "count": "100" },
        { "status": "in_progress", "count": "20" },
        { "status": "pending", "count": "30" }
      ]
    },
    "payments": {
      "total": 450000,
      "count": 100
    },
    "activeUsers": {
      "clients": 80,
      "executors": 15
    },
    "newRegistrations": [
      { "role": "client", "count": "50" },
      { "role": "executor", "count": "10" }
    ]
  }
}
```

## Error Responses

Все endpoints могут вернуть следующие ошибки:

### 401 Unauthorized
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "No token provided"
  }
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to access this resource"
  }
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": {
    "code": "ORDER_NOT_FOUND",
    "message": "Order not found"
  }
}
```

### 400 Bad Request
```json
{
  "success": false,
  "error": {
    "code": "MISSING_REQUIRED_FIELD",
    "message": "Executor ID is required"
  }
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred"
  }
}
```

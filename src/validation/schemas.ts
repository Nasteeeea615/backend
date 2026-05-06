import Joi from 'joi';

/**
 * Валидационные схемы для API endpoints
 */

// Базовые схемы
export const phoneNumberSchema = Joi.string()
  .pattern(/^(\+7|8)?[\s-]?\(?[489][0-9]{2}\)?[\s-]?[0-9]{3}[\s-]?[0-9]{2}[\s-]?[0-9]{2}$/)
  .required()
  .messages({
    'string.pattern.base': 'Неверный формат номера телефона',
    'any.required': 'Номер телефона обязателен',
  });

export const nameSchema = Joi.string()
  .min(2)
  .max(100)
  .required()
  .messages({
    'string.min': 'Имя должно содержать минимум 2 символа',
    'string.max': 'Имя не должно превышать 100 символов',
    'any.required': 'Имя обязательно',
  });

export const uuidSchema = Joi.string()
  .uuid()
  .required()
  .messages({
    'string.uuid': 'Неверный формат ID',
    'any.required': 'ID обязателен',
  });

// Authentication schemas
export const registerClientSchema = Joi.object({
  phoneNumber: phoneNumberSchema,
  name: nameSchema,
  city: Joi.string().min(2).max(100).required().messages({
    'string.min': 'Название города должно содержать минимум 2 символа',
    'string.max': 'Название города не должно превышать 100 символов',
    'any.required': 'Город обязателен',
  }),
  street: Joi.string().min(2).max(200).required().messages({
    'string.min': 'Название улицы должно содержать минимум 2 символа',
    'string.max': 'Название улицы не должно превышать 200 символов',
    'any.required': 'Улица обязательна',
  }),
  houseNumber: Joi.string().max(20).required().messages({
    'string.max': 'Номер дома не должен превышать 20 символов',
    'any.required': 'Номер дома обязателен',
  }),
  agreedToTerms: Joi.boolean().valid(true).required().messages({
    'any.only': 'Необходимо согласиться с условиями использования',
    'any.required': 'Необходимо согласиться с условиями использования',
  }),
});

export const registerExecutorSchema = Joi.object({
  phoneNumber: phoneNumberSchema,
  name: nameSchema,
  vehicleNumber: Joi.string()
    .max(50)
    .required()
    .messages({
      'string.max': 'Номер машины не должен превышать 50 символов',
      'any.required': 'Номер машины обязателен',
    }),
  vehicleCapacity: Joi.number()
    .valid(3, 5, 10)
    .required()
    .messages({
      'any.only': 'Объем должен быть 3, 5 или 10 м³',
      'any.required': 'Объем машины обязателен',
    }),
  agreedToTerms: Joi.boolean().valid(true).required().messages({
    'any.only': 'Необходимо согласиться с условиями использования',
    'any.required': 'Необходимо согласиться с условиями использования',
  }),
});

// Order schemas
export const createOrderSchema = Joi.object({
  vehicleCapacity: Joi.number()
    .valid(3, 5, 10)
    .required()
    .messages({
      'any.only': 'Объем должен быть 3, 5 или 10 м³',
      'any.required': 'Выберите объем машины',
    }),
  city: Joi.string().min(2).max(100).required(),
  street: Joi.string().min(2).max(200).required(),
  houseNumber: Joi.string().max(20).required(),
  scheduledDate: Joi.date().min('now').required().messages({
    'date.min': 'Дата не может быть в прошлом',
    'any.required': 'Дата обязательна',
  }),
  scheduledTime: Joi.string()
    .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .required()
    .messages({
      'string.pattern.base': 'Неверный формат времени (ЧЧ:ММ)',
      'any.required': 'Время обязательно',
    }),
  comment: Joi.string().max(500).allow('').messages({
    'string.max': 'Комментарий не должен превышать 500 символов',
  }),
});

export const updateOrderStatusSchema = Joi.object({
  status: Joi.string()
    .valid('pending', 'assigned', 'in_progress', 'completed', 'cancelled')
    .required()
    .messages({
      'any.only': 'Неверный статус заказа',
      'any.required': 'Статус обязателен',
    }),
});

// Profile schemas
export const updateProfileSchema = Joi.object({
  name: nameSchema.optional(),
  city: Joi.string().min(2).max(100).optional(),
  street: Joi.string().min(2).max(200).optional(),
  houseNumber: Joi.string().max(20).optional(),
}).min(1).messages({
  'object.min': 'Необходимо указать хотя бы одно поле для обновления',
});

// Support schemas
export const createTicketSchema = Joi.object({
  subject: Joi.string().min(5).max(200).required().messages({
    'string.min': 'Тема должна содержать минимум 5 символов',
    'string.max': 'Тема не должна превышать 200 символов',
    'any.required': 'Тема обращения обязательна',
  }),
  description: Joi.string().min(10).max(2000).required().messages({
    'string.min': 'Описание должно содержать минимум 10 символов',
    'string.max': 'Описание не должно превышать 2000 символов',
    'any.required': 'Описание проблемы обязательно',
  }),
});

export const replyTicketSchema = Joi.object({
  content: Joi.string().min(1).max(2000).required().messages({
    'string.min': 'Ответ не может быть пустым',
    'string.max': 'Ответ не должен превышать 2000 символов',
    'any.required': 'Содержание ответа обязательно',
  }),
});

export const updateTicketStatusSchema = Joi.object({
  status: Joi.string()
    .valid('open', 'in_progress', 'closed')
    .required()
    .messages({
      'any.only': 'Неверный статус тикета',
      'any.required': 'Статус обязателен',
    }),
});

// Payment schemas
export const createPaymentSchema = Joi.object({
  orderId: uuidSchema,
  paymentMethod: Joi.object({
    type: Joi.string().valid('card', 'saved_card').required(),
    cardToken: Joi.string().when('type', {
      is: 'card',
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
    savedCardId: Joi.string().when('type', {
      is: 'saved_card',
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
  }).required(),
  saveCard: Joi.boolean().default(false),
});

// Admin schemas
export const assignExecutorSchema = Joi.object({
  executorId: uuidSchema,
});

export const blockUserSchema = Joi.object({
  reason: Joi.string().min(10).max(500).required().messages({
    'string.min': 'Причина должна содержать минимум 10 символов',
    'string.max': 'Причина не должна превышать 500 символов',
    'any.required': 'Причина блокировки обязательна',
  }),
});

export const verifyExecutorSchema = Joi.object({
  isVerified: Joi.boolean().required().messages({
    'any.required': 'Статус верификации обязателен',
  }),
  notes: Joi.string().max(500).allow('').messages({
    'string.max': 'Примечания не должны превышать 500 символов',
  }),
});

// Query параметры
export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const dateRangeSchema = Joi.object({
  startDate: Joi.date().optional(),
  endDate: Joi.date().min(Joi.ref('startDate')).optional().messages({
    'date.min': 'Конечная дата должна быть позже начальной',
  }),
});

export const orderFilterSchema = paginationSchema.keys({
  status: Joi.string().valid('pending', 'assigned', 'in_progress', 'completed', 'cancelled').optional(),
  ...dateRangeSchema.describe().keys,
});

export const userFilterSchema = paginationSchema.keys({
  role: Joi.string().valid('client', 'executor').optional(),
  isBlocked: Joi.boolean().optional(),
  isVerified: Joi.boolean().optional(),
});

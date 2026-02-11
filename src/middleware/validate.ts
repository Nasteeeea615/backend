import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ValidationError } from '../types/errors';

/**
 * Middleware для валидации данных запроса с помощью Joi
 */
export const validate = (schema: Joi.ObjectSchema, property: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false, // Показывать все ошибки, а не только первую
      stripUnknown: true, // Удалять неизвестные поля
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      throw new ValidationError('Ошибка валидации данных', details);
    }

    // Заменяем оригинальные данные на валидированные
    req[property] = value;
    next();
  };
};

/**
 * Валидация body запроса
 */
export const validateBody = (schema: Joi.ObjectSchema) => validate(schema, 'body');

/**
 * Валидация query параметров
 */
export const validateQuery = (schema: Joi.ObjectSchema) => validate(schema, 'query');

/**
 * Валидация params
 */
export const validateParams = (schema: Joi.ObjectSchema) => validate(schema, 'params');

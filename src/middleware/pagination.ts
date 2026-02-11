import { Request, Response, NextFunction } from 'express';

/**
 * Интерфейс для pagination параметров
 */
export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

/**
 * Интерфейс для pagination результата
 */
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Middleware для добавления pagination параметров в request
 */
export const paginationMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(
    100, // Максимум 100 записей за раз
    Math.max(1, parseInt(req.query.limit as string) || 20)
  );
  const offset = (page - 1) * limit;

  // Добавляем pagination параметры в request
  (req as any).pagination = {
    page,
    limit,
    offset,
  } as PaginationParams;

  next();
};

/**
 * Хелпер для создания paginated ответа
 */
export const createPaginatedResponse = <T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResult<T> => {
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
};

/**
 * Хелпер для SQL pagination
 */
export const getPaginationSQL = (params: PaginationParams): string => {
  return `LIMIT ${params.limit} OFFSET ${params.offset}`;
};

/**
 * Хелпер для получения общего количества записей
 */
export const getTotalCount = async (
  query: string,
  params: any[],
  db: any
): Promise<number> => {
  const countQuery = `SELECT COUNT(*) as total FROM (${query}) as count_query`;
  const result = await db.query(countQuery, params);
  return parseInt(result.rows[0].total);
};

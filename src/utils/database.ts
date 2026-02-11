import { Pool, QueryResult, QueryResultRow } from 'pg';
import logger from './logger';

/**
 * Безопасная обертка для работы с PostgreSQL
 * Использует параметризованные запросы для защиты от SQL injection
 */

let pool: Pool;

/**
 * Инициализация пула соединений
 */
export const initDatabase = () => {
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'septik_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    // Connection pool settings
    max: 20, // Максимум соединений в пуле
    min: 2, // Минимум соединений (всегда активны)
    idleTimeoutMillis: 30000, // Закрывать неактивные соединения через 30 сек
    connectionTimeoutMillis: 2000, // Таймаут подключения 2 сек
    // Performance settings
    statement_timeout: 10000, // Таймаут выполнения запроса 10 сек
    query_timeout: 10000,
    // SSL settings (для production)
    ssl: process.env.NODE_ENV === 'production' ? {
      rejectUnauthorized: false, // Настроить правильно для production
    } : false,
  });

  // Обработка ошибок пула
  pool.on('error', (err: Error) => {
    logger.error('Unexpected database pool error', { error: err });
  });

  logger.info('Database pool initialized');

  return pool;
};

/**
 * Получить пул соединений
 */
export const getPool = (): Pool => {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initDatabase() first.');
  }
  return pool;
};

/**
 * Безопасное выполнение запроса с параметрами
 * ВСЕГДА используйте параметризованные запросы!
 */
export const query = async <T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> => {
  const start = Date.now();
  
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;

    // Логируем медленные запросы
    if (duration > 1000) {
      logger.warn('Slow query detected', {
        text,
        duration,
        rows: result.rowCount,
      });
    }

    if (process.env.NODE_ENV === 'development') {
      logger.debug('Query executed', {
        text,
        params,
        duration,
        rows: result.rowCount,
      });
    }

    return result;
  } catch (error) {
    logger.error('Database query error', {
      text,
      params,
      error,
    });
    throw error;
  }
};

/**
 * Выполнение транзакции
 */
export const transaction = async <T>(
  callback: (client: any) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Transaction rolled back', { error });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Примеры безопасного использования:
 * 
 * ❌ НЕБЕЗОПАСНО - SQL injection уязвимость:
 * const result = await query(`SELECT * FROM users WHERE email = '${email}'`);
 * 
 * ✅ БЕЗОПАСНО - параметризованный запрос:
 * const result = await query('SELECT * FROM users WHERE email = $1', [email]);
 * 
 * ✅ БЕЗОПАСНО - множественные параметры:
 * const result = await query(
 *   'SELECT * FROM orders WHERE client_id = $1 AND status = $2',
 *   [clientId, status]
 * );
 * 
 * ✅ БЕЗОПАСНО - INSERT с возвратом:
 * const result = await query(
 *   'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
 *   [name, email]
 * );
 */

/**
 * Закрытие пула соединений
 */
export const closeDatabase = async () => {
  if (pool) {
    await pool.end();
    logger.info('Database pool closed');
  }
};

/**
 * Проверка подключения к базе данных
 */
export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    await query('SELECT 1');
    return true;
  } catch (error) {
    logger.error('Database connection check failed', { error });
    return false;
  }
};

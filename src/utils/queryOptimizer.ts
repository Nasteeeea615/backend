import { query } from './database';
import logger from './logger';

/**
 * Утилиты для оптимизации SQL запросов
 */

/**
 * Выполнить EXPLAIN ANALYZE для запроса
 * Помогает понять план выполнения и найти узкие места
 */
export const explainQuery = async (
  sql: string,
  params?: any[]
): Promise<any[]> => {
  try {
    const explainSQL = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`;
    const result = await query(explainSQL, params);
    
    const plan = result.rows[0]['QUERY PLAN'][0];
    
    logger.info('Query plan', {
      sql,
      executionTime: plan['Execution Time'],
      planningTime: plan['Planning Time'],
      totalCost: plan.Plan['Total Cost'],
    });

    return result.rows;
  } catch (error) {
    logger.error('Explain query error', { sql, error });
    throw error;
  }
};

/**
 * Проверить наличие индексов для таблицы
 */
export const checkIndexes = async (tableName: string): Promise<any[]> => {
  const sql = `
    SELECT
      indexname,
      indexdef
    FROM pg_indexes
    WHERE tablename = $1
    ORDER BY indexname;
  `;

  const result = await query(sql, [tableName]);
  return result.rows;
};

/**
 * Получить статистику использования индексов
 */
export const getIndexStats = async (tableName: string): Promise<any[]> => {
  const sql = `
    SELECT
      schemaname,
      tablename,
      indexname,
      idx_scan as index_scans,
      idx_tup_read as tuples_read,
      idx_tup_fetch as tuples_fetched
    FROM pg_stat_user_indexes
    WHERE tablename = $1
    ORDER BY idx_scan DESC;
  `;

  const result = await query(sql, [tableName]);
  return result.rows;
};

/**
 * Найти неиспользуемые индексы
 */
export const findUnusedIndexes = async (): Promise<any[]> => {
  const sql = `
    SELECT
      schemaname,
      tablename,
      indexname,
      idx_scan
    FROM pg_stat_user_indexes
    WHERE idx_scan = 0
      AND indexname NOT LIKE '%_pkey'
    ORDER BY tablename, indexname;
  `;

  const result = await query(sql);
  return result.rows;
};

/**
 * Получить размер таблиц
 */
export const getTableSizes = async (): Promise<any[]> => {
  const sql = `
    SELECT
      schemaname,
      tablename,
      pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
      pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
    FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY size_bytes DESC;
  `;

  const result = await query(sql);
  return result.rows;
};

/**
 * Получить медленные запросы (требует pg_stat_statements extension)
 */
export const getSlowQueries = async (limit: number = 10): Promise<any[]> => {
  const sql = `
    SELECT
      query,
      calls,
      total_time,
      mean_time,
      max_time,
      stddev_time
    FROM pg_stat_statements
    ORDER BY mean_time DESC
    LIMIT $1;
  `;

  try {
    const result = await query(sql, [limit]);
    return result.rows;
  } catch (error) {
    logger.warn('pg_stat_statements extension not available');
    return [];
  }
};

/**
 * Анализ таблицы (обновление статистики для оптимизатора)
 */
export const analyzeTable = async (tableName: string): Promise<void> => {
  const sql = `ANALYZE ${tableName}`;
  await query(sql);
  logger.info('Table analyzed', { tableName });
};

/**
 * VACUUM таблицы (очистка мертвых строк)
 */
export const vacuumTable = async (tableName: string): Promise<void> => {
  const sql = `VACUUM ANALYZE ${tableName}`;
  await query(sql);
  logger.info('Table vacuumed', { tableName });
};

/**
 * Рекомендации по оптимизации
 */
export const getOptimizationRecommendations = async (): Promise<{
  unusedIndexes: any[];
  largestTables: any[];
  slowQueries: any[];
}> => {
  const [unusedIndexes, largestTables, slowQueries] = await Promise.all([
    findUnusedIndexes(),
    getTableSizes(),
    getSlowQueries(5),
  ]);

  return {
    unusedIndexes,
    largestTables: largestTables.slice(0, 5),
    slowQueries,
  };
};

/**
 * Примеры оптимизированных запросов
 */

// ❌ ПЛОХО - N+1 проблема
// for (const order of orders) {
//   const client = await query('SELECT * FROM users WHERE id = $1', [order.client_id]);
// }

// ✅ ХОРОШО - JOIN
// const orders = await query(`
//   SELECT o.*, u.name as client_name
//   FROM orders o
//   JOIN users u ON o.client_id = u.id
//   WHERE o.status = $1
// `, [status]);

// ❌ ПЛОХО - SELECT *
// const users = await query('SELECT * FROM users');

// ✅ ХОРОШО - Выбираем только нужные поля
// const users = await query('SELECT id, name, email FROM users');

// ❌ ПЛОХО - Без индекса
// const orders = await query('SELECT * FROM orders WHERE status = $1', [status]);

// ✅ ХОРОШО - С индексом
// CREATE INDEX idx_orders_status ON orders(status);
// const orders = await query('SELECT * FROM orders WHERE status = $1', [status]);

// ❌ ПЛОХО - LIKE с % в начале (не использует индекс)
// const users = await query('SELECT * FROM users WHERE email LIKE $1', ['%@example.com']);

// ✅ ХОРОШО - LIKE без % в начале (использует индекс)
// const users = await query('SELECT * FROM users WHERE email LIKE $1', ['user@%']);

// ✅ ЕЩЕ ЛУЧШЕ - Полнотекстовый поиск
// CREATE INDEX idx_users_email_gin ON users USING gin(to_tsvector('english', email));
// const users = await query(`
//   SELECT * FROM users
//   WHERE to_tsvector('english', email) @@ to_tsquery('english', $1)
// `, ['example']);

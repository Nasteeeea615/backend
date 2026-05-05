import Redis from 'ioredis';
import logger from './logger';
import mockCache from '../services/cache.mock';

/**
 * Redis клиент для кэширования
 * Автоматически переключается на mock, если Redis недоступен
 */

let redis: Redis | null = null;
let useMockCache = false;

/**
 * Инициализация Redis
 * Автоматически переключается на mock при ошибке
 */
export const initRedis = (): Redis | null => {
  // Проверяем, нужно ли использовать mock
  const redisUrl = process.env.REDIS_URL;

  if (process.env.USE_MOCK_CACHE === 'true' || (!process.env.REDIS_HOST && !redisUrl)) {
    logger.info('Using Mock Cache (in-memory) instead of Redis');
    useMockCache = true;
    return null;
  }

  try {
    redis = redisUrl
      ? new Redis(redisUrl, {
          db: parseInt(process.env.REDIS_DB || '0'),
          retryStrategy: (times) => {
            if (times > 3) {
              logger.warn('Redis connection failed, switching to Mock Cache');
              useMockCache = true;
              return null;
            }
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        })
      : new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
          db: parseInt(process.env.REDIS_DB || '0'),
          retryStrategy: (times) => {
            // После 3 попыток переключаемся на mock
            if (times > 3) {
              logger.warn('Redis connection failed, switching to Mock Cache');
              useMockCache = true;
              return null;
            }
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          maxRetriesPerRequest: 3,
          lazyConnect: true, // Не подключаемся сразу
        });

    redis.on('connect', () => {
      logger.info('✅ Redis connected');
      useMockCache = false;
    });

    redis.on('error', (err) => {
      logger.error('Redis error', { error: err.message });
      // Переключаемся на mock при ошибке
      if (!useMockCache) {
        logger.warn('Switching to Mock Cache due to Redis error');
        useMockCache = true;
      }
    });

    redis.on('close', () => {
      logger.warn('Redis connection closed');
    });

    // Пытаемся подключиться
    redis.connect().catch((err) => {
      logger.error('Failed to connect to Redis, using Mock Cache', { error: err.message });
      useMockCache = true;
    });

    return redis;
  } catch (error) {
    logger.error('Failed to initialize Redis, using Mock Cache', { error });
    useMockCache = true;
    return null;
  }
};

/**
 * Получить Redis клиент
 */
export const getRedis = (): Redis => {
  if (!redis) {
    throw new Error('Redis not initialized. Call initRedis() first.');
  }
  return redis;
};

/**
 * Закрыть соединение с Redis
 */
export const closeRedis = async (): Promise<void> => {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info('Redis connection closed');
  }
};

/**
 * Кэширование с TTL (Time To Live)
 */
export class CacheService {
  private redis: Redis;
  private defaultTTL: number = 3600; // 1 час по умолчанию

  constructor(redisClient?: Redis) {
    this.redis = redisClient || getRedis();
  }

  /**
   * Установить значение в кэш
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      // Используем mock cache если Redis недоступен
      if (useMockCache) {
        return mockCache.set(key, value, ttl || this.defaultTTL);
      }

      const serialized = JSON.stringify(value);
      const expiry = ttl || this.defaultTTL;
      await this.redis.setex(key, expiry, serialized);
      
      if (process.env.NODE_ENV === 'development') {
        logger.debug('Cache set', { key, ttl: expiry });
      }
    } catch (error) {
      logger.error('Cache set error', { key, error });
      // Fallback на mock при ошибке
      return mockCache.set(key, value, ttl || this.defaultTTL);
    }
  }

  /**
   * Получить значение из кэша
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      // Используем mock cache если Redis недоступен
      if (useMockCache) {
        return mockCache.get(key);
      }

      const cached = await this.redis.get(key);
      
      if (!cached) {
        if (process.env.NODE_ENV === 'development') {
          logger.debug('Cache miss', { key });
        }
        return null;
      }

      if (process.env.NODE_ENV === 'development') {
        logger.debug('Cache hit', { key });
      }

      return JSON.parse(cached) as T;
    } catch (error) {
      logger.error('Cache get error', { key, error });
      // Fallback на mock при ошибке
      return mockCache.get(key);
    }
  }

  /**
   * Удалить значение из кэша
   */
  async del(key: string): Promise<void> {
    try {
      if (useMockCache) {
        return mockCache.del(key);
      }

      await this.redis.del(key);
      
      if (process.env.NODE_ENV === 'development') {
        logger.debug('Cache deleted', { key });
      }
    } catch (error) {
      logger.error('Cache delete error', { key, error });
      return mockCache.del(key);
    }
  }

  /**
   * Удалить все ключи по паттерну
   */
  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.info('Cache pattern deleted', { pattern, count: keys.length });
      }
    } catch (error) {
      logger.error('Cache pattern delete error', { pattern, error });
    }
  }

  /**
   * Проверить существование ключа
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error', { key, error });
      return false;
    }
  }

  /**
   * Получить или установить (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Попытка получить из кэша
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Если нет в кэше, получить из источника
    const value = await fetchFn();
    
    // Сохранить в кэш
    await this.set(key, value, ttl);
    
    return value;
  }

  /**
   * Инкремент значения
   */
  async incr(key: string): Promise<number> {
    try {
      return await this.redis.incr(key);
    } catch (error) {
      logger.error('Cache incr error', { key, error });
      return 0;
    }
  }

  /**
   * Декремент значения
   */
  async decr(key: string): Promise<number> {
    try {
      return await this.redis.decr(key);
    } catch (error) {
      logger.error('Cache decr error', { key, error });
      return 0;
    }
  }

  /**
   * Установить TTL для существующего ключа
   */
  async expire(key: string, ttl: number): Promise<void> {
    try {
      await this.redis.expire(key, ttl);
    } catch (error) {
      logger.error('Cache expire error', { key, error });
    }
  }

  /**
   * Получить TTL ключа
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      logger.error('Cache ttl error', { key, error });
      return -1;
    }
  }

  /**
   * Очистить весь кэш
   */
  async flush(): Promise<void> {
    try {
      await this.redis.flushdb();
      logger.warn('Cache flushed');
    } catch (error) {
      logger.error('Cache flush error', { error });
    }
  }
}

/**
 * Глобальный экземпляр CacheService
 */
export const cache = new CacheService();

/**
 * Генераторы ключей кэша
 */
export const CacheKeys = {
  // Пользователи
  user: (id: string) => `user:${id}`,
  userByPhone: (phone: string) => `user:phone:${phone}`,
  
  // Заказы
  order: (id: string) => `order:${id}`,
  userOrders: (userId: string, page: number = 1) => `orders:user:${userId}:page:${page}`,
  executorOrders: (executorId: string) => `orders:executor:${executorId}`,
  availableOrders: (capacity: number) => `orders:available:${capacity}`,
  
  // Статистика
  stats: (type: string, period: string) => `stats:${type}:${period}`,
  
  // Тикеты
  ticket: (id: string) => `ticket:${id}`,
  userTickets: (userId: string) => `tickets:user:${userId}`,
};

/**
 * TTL константы (в секундах)
 */
export const CacheTTL = {
  SHORT: 60,           // 1 минута
  MEDIUM: 300,         // 5 минут
  LONG: 3600,          // 1 час
  DAY: 86400,          // 24 часа
  WEEK: 604800,        // 7 дней
};

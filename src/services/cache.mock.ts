/**
 * Mock Cache Service - замена Redis для разработки
 * Хранит данные в памяти, не требует установки Redis
 */

interface CacheItem {
  value: any;
  expiresAt?: number;
}

class MockCacheService {
  private cache: Map<string, CacheItem> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Очищаем устаревшие записи каждую минуту
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);

    console.log('🔧 Mock Cache Service initialized (in-memory)');
  }

  /**
   * Сохранить значение в кэш
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const item: CacheItem = {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    };

    this.cache.set(key, item);
    console.log(`📦 Cache SET: ${key} (TTL: ${ttlSeconds || 'none'}s)`);
  }

  /**
   * Получить значение из кэша
   */
  async get(key: string): Promise<any | null> {
    const item = this.cache.get(key);

    if (!item) {
      console.log(`📭 Cache MISS: ${key}`);
      return null;
    }

    // Проверяем срок действия
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.cache.delete(key);
      console.log(`⏰ Cache EXPIRED: ${key}`);
      return null;
    }

    console.log(`📬 Cache HIT: ${key}`);
    return item.value;
  }

  /**
   * Удалить значение из кэша
   */
  async del(key: string): Promise<void> {
    const deleted = this.cache.delete(key);
    console.log(`🗑️  Cache DEL: ${key} (${deleted ? 'success' : 'not found'})`);
  }

  /**
   * Проверить существование ключа
   */
  async exists(key: string): Promise<boolean> {
    const item = this.cache.get(key);
    
    if (!item) {
      return false;
    }

    // Проверяем срок действия
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Установить срок действия для ключа
   */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    const item = this.cache.get(key);
    
    if (item) {
      item.expiresAt = Date.now() + ttlSeconds * 1000;
      console.log(`⏰ Cache EXPIRE: ${key} (${ttlSeconds}s)`);
    }
  }

  /**
   * Получить все ключи по паттерну
   */
  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace('*', '.*'));
    const matchingKeys: string[] = [];

    for (const [key, item] of this.cache.entries()) {
      // Проверяем срок действия
      if (item.expiresAt && Date.now() > item.expiresAt) {
        this.cache.delete(key);
        continue;
      }

      if (regex.test(key)) {
        matchingKeys.push(key);
      }
    }

    return matchingKeys;
  }

  /**
   * Инкремент значения
   */
  async incr(key: string): Promise<number> {
    const current = await this.get(key);
    const newValue = (current || 0) + 1;
    await this.set(key, newValue);
    return newValue;
  }

  /**
   * Декремент значения
   */
  async decr(key: string): Promise<number> {
    const current = await this.get(key);
    const newValue = (current || 0) - 1;
    await this.set(key, newValue);
    return newValue;
  }

  /**
   * Очистить весь кэш
   */
  async flushAll(): Promise<void> {
    this.cache.clear();
    console.log('🧹 Cache FLUSH: all keys deleted');
  }

  /**
   * Получить размер кэша
   */
  getSize(): number {
    return this.cache.size;
  }

  /**
   * Очистить устаревшие записи
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, item] of this.cache.entries()) {
      if (item.expiresAt && now > item.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cache cleanup: ${cleaned} expired keys removed`);
    }
  }

  /**
   * Остановить сервис
   */
  stop(): void {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
    console.log('🛑 Mock Cache Service stopped');
  }

  /**
   * Получить статистику
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

export default new MockCacheService();

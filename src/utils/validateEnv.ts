import logger from './logger';

/**
 * Validate required environment variables
 */
export function validateEnvironment(): void {
  const redisConfigured = !!(process.env.REDIS_URL || process.env.REDIS_HOST);
  const paymentConfigured = !!(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY);
  const emailConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

  const required = [
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'JWT_SECRET',
    'JWT_EXPIRES_IN',
    'JWT_REFRESH_EXPIRES_IN',
  ];

  const optional = [
    'YOOKASSA_SHOP_ID',
    'YOOKASSA_SECRET_KEY',
    'REDIS_HOST',
    'REDIS_URL',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM_EMAIL',
    'LOGIN_CODE_TTL_MINUTES',
  ];

  const missing: string[] = [];
  const notConfigured: string[] = [];

  // Check required variables
  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  // Check optional but important variables
  for (const key of optional) {
    if (!process.env[key]) {
      notConfigured.push(key);
    }
  }

  // Log results
  if (missing.length > 0) {
    logger.error('❌ Missing required environment variables:', missing);
    logger.error('Please check your .env file and add the missing variables');
    process.exit(1);
  }

  if (notConfigured.length > 0) {
    logger.warn('⚠️  Optional services not configured:', notConfigured);
    logger.warn('Some features may not work:');
    
    if (!paymentConfigured) {
      logger.warn('  - YooKassa: Real payments will not work (using mock)');
    }
    if (!redisConfigured) {
      logger.warn('  - Redis: Using in-memory cache (not recommended for production)');
    }
    if (!emailConfigured) {
      logger.warn('  - Email: Login codes will fall back to console logging in development');
    }
    logger.warn('');
  }

  logger.info('✅ Environment validation passed');
}

/**
 * Get environment info for debugging
 */
export function getEnvironmentInfo(): Record<string, any> {
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    database: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      name: process.env.DB_NAME,
    },
    services: {
      yookassa: paymentConfigured,
      redis: redisConfigured,
      email: emailConfigured,
    },
  };
}

# Multi-stage build для оптимизации размера образа

# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Копируем package files
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production && \
    npm cache clean --force

# Копируем исходный код
COPY . .

# Компилируем TypeScript
RUN npm run build

# Stage 2: Production
FROM node:18-alpine

# Устанавливаем dumb-init для правильной обработки сигналов
RUN apk add --no-cache dumb-init

# Создаем пользователя для безопасности
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Копируем зависимости из builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Копируем скомпилированный код
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Копируем package.json для версии
COPY --chown=nodejs:nodejs package.json ./

# Переключаемся на непривилегированного пользователя
USER nodejs

# Открываем порт
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Запускаем приложение через dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]

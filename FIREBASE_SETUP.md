# Firebase Cloud Messaging Setup Guide

## Шаг 1: Создание Firebase проекта

1. Перейдите на [Firebase Console](https://console.firebase.google.com/)
2. Нажмите "Add project" (Добавить проект)
3. Введите название проекта (например, "Septik Service")
4. Отключите Google Analytics (не обязательно для FCM)
5. Нажмите "Create project"

## Шаг 2: Добавление приложения

### Для Android:
1. В Firebase Console выберите ваш проект
2. Нажмите на иконку Android
3. Введите package name (например, `com.septikservice.app`)
4. Скачайте `google-services.json`
5. Поместите файл в `mobile/android/app/`

### Для iOS:
1. В Firebase Console выберите ваш проект
2. Нажмите на иконку iOS
3. Введите bundle ID (например, `com.septikservice.app`)
4. Скачайте `GoogleService-Info.plist`
5. Поместите файл в `mobile/ios/`

## Шаг 3: Получение Service Account для Backend

1. В Firebase Console перейдите в **Project Settings** (иконка шестеренки)
2. Перейдите на вкладку **Service Accounts**
3. Нажмите **Generate New Private Key**
4. Подтвердите и скачайте JSON файл
5. Откройте JSON файл и скопируйте **весь** его содержимое

## Шаг 4: Настройка Backend

1. Откройте файл `backend/.env`
2. Найдите переменную `FIREBASE_SERVICE_ACCOUNT`
3. Вставьте содержимое JSON файла **в одну строку**:

```env
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"your-project-id","private_key_id":"xxx","private_key":"-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com","client_id":"xxx","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxx%40your-project.iam.gserviceaccount.com"}
```

**Важно:** 
- Убедитесь что JSON в одну строку (без переносов)
- Сохраните `\n` в private_key как есть
- Не добавляйте кавычки вокруг JSON

## Шаг 5: Настройка Mobile приложения

### Для Expo (React Native):

1. Установите необходимые пакеты (уже установлены):
```bash
cd mobile
npm install expo-notifications expo-device expo-constants
```

2. Обновите `app.json`:
```json
{
  "expo": {
    "android": {
      "googleServicesFile": "./google-services.json"
    },
    "ios": {
      "googleServicesFile": "./GoogleService-Info.plist"
    },
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#ffffff"
        }
      ]
    ]
  }
}
```

## Шаг 6: Проверка настройки

1. Запустите backend:
```bash
cd backend
npm run dev
```

2. Проверьте логи - должно быть:
```
✅ Firebase Admin SDK initialized successfully
```

3. Если видите предупреждение:
```
Firebase Admin SDK not initialized: FIREBASE_SERVICE_ACCOUNT not found
```
Значит переменная окружения не настроена правильно.

## Шаг 7: Тестирование Push-уведомлений

1. Запустите mobile приложение
2. Зарегистрируйтесь или войдите
3. Приложение автоматически зарегистрирует FCM токен
4. Создайте заказ и примите его исполнителем
5. Вы должны получить push-уведомление

## Troubleshooting

### Backend не инициализирует Firebase

**Проблема:** Видите warning "Firebase Admin SDK not initialized"

**Решение:**
1. Проверьте что `FIREBASE_SERVICE_ACCOUNT` в `.env` файле
2. Убедитесь что JSON валидный (используйте JSON validator)
3. Проверьте что нет лишних пробелов или переносов строк
4. Перезапустите backend

### Mobile не получает уведомления

**Проблема:** Уведомления не приходят на устройство

**Решение:**
1. Проверьте что `google-services.json` (Android) или `GoogleService-Info.plist` (iOS) в правильной папке
2. Убедитесь что приложение запрашивает разрешение на уведомления
3. Проверьте что FCM токен сохраняется в базе данных:
```sql
SELECT * FROM fcm_tokens WHERE user_id = 'your-user-id';
```
4. Проверьте логи backend на ошибки отправки

### Ошибка "Invalid service account"

**Проблема:** Backend не может инициализировать Firebase

**Решение:**
1. Убедитесь что скачали правильный JSON файл (Service Account, не Web API key)
2. Проверьте что project_id, private_key и client_email присутствуют в JSON
3. Сгенерируйте новый Service Account ключ в Firebase Console

## Полезные ссылки

- [Firebase Console](https://console.firebase.google.com/)
- [Firebase Admin SDK Documentation](https://firebase.google.com/docs/admin/setup)
- [Expo Notifications Documentation](https://docs.expo.dev/push-notifications/overview/)
- [FCM Documentation](https://firebase.google.com/docs/cloud-messaging)

## Безопасность

⚠️ **Важно:**
- Никогда не коммитьте `.env` файл с реальными credentials в git
- Добавьте `.env` в `.gitignore`
- Используйте разные Firebase проекты для development и production
- Регулярно ротируйте Service Account ключи

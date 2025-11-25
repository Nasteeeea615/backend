# Push Notifications Setup Guide

This guide explains how to set up Firebase Cloud Messaging (FCM) for push notifications in the Septik Service application.

## Prerequisites

- Firebase account
- Node.js backend running
- Expo mobile app

## Backend Setup

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select existing project
3. Follow the setup wizard

### 2. Generate Service Account Key

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Navigate to **Service Accounts** tab
3. Click **Generate new private key**
4. Download the JSON file

### 3. Configure Backend

1. Open the downloaded JSON file
2. Copy the entire JSON content
3. Minify it to a single line (remove line breaks)
4. Add to your `.env` file:

```env
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"your-project-id",...}
```

**Important:** Keep this file secure and never commit it to version control!

### 4. Install Dependencies

```bash
cd backend
npm install firebase-admin
```

### 5. Run Database Migration

```bash
npm run migrate
```

This will create the `fcm_tokens` table for storing device tokens.

## Mobile App Setup

### 1. Install Dependencies

```bash
cd mobile
npx expo install expo-notifications expo-device
```

### 2. Configure Expo Project

1. Create an Expo account at [expo.dev](https://expo.dev)
2. Create a new project or link existing one:
   ```bash
   npx expo login
   eas init
   ```
3. Get your project ID from Expo dashboard
4. Add to `.env` file:
   ```env
   EXPO_PROJECT_ID=your-expo-project-id
   ```

### 3. Configure app.json

Add the following to your `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#ffffff",
          "sounds": ["./assets/notification-sound.wav"]
        }
      ]
    ],
    "notification": {
      "icon": "./assets/notification-icon.png",
      "color": "#ffffff",
      "androidMode": "default",
      "androidCollapsedTitle": "#{unread_notifications} new notifications"
    }
  }
}
```

### 4. iOS Configuration (if targeting iOS)

1. In Firebase Console, add iOS app
2. Download `GoogleService-Info.plist`
3. Add to your Expo project
4. Configure APNs in Firebase Console

### 5. Android Configuration (if targeting Android)

1. In Firebase Console, add Android app
2. Download `google-services.json`
3. Add to your Expo project
4. FCM is automatically configured for Android

## Testing Push Notifications

### 1. Start Backend Server

```bash
cd backend
npm run dev
```

### 2. Start Mobile App

```bash
cd mobile
npm start
```

### 3. Test Flow

1. Register/login to the app
2. The app will automatically request notification permissions
3. FCM token will be saved to backend
4. Create an order to trigger notifications
5. Accept/complete orders to test different notification types

## Notification Types

The system sends the following push notifications:

1. **Order Accepted** - When executor accepts client's order
2. **Order Completed** - When executor completes the order
3. **Payment Success** - When payment is processed successfully
4. **New Order** - When new order is available for executors
5. **Urgent Order Assigned** - When urgent order is auto-assigned to executor
6. **Ticket Reply** - When support replies to user's ticket

## API Endpoints

### Save FCM Token
```
POST /api/notifications/fcm-token
Authorization: Bearer <token>
Body: {
  "token": "ExponentPushToken[...]",
  "deviceType": "ios" | "android",
  "deviceId": "optional-device-id"
}
```

### Remove FCM Token
```
DELETE /api/notifications/fcm-token
Authorization: Bearer <token>
Body: {
  "token": "ExponentPushToken[...]"
}
```

### Get Notifications
```
GET /api/notifications?limit=50
Authorization: Bearer <token>
```

### Mark Notification as Read
```
PUT /api/notifications/:notificationId/read
Authorization: Bearer <token>
```

### Mark All Notifications as Read
```
PUT /api/notifications/read-all
Authorization: Bearer <token>
```

## Troubleshooting

### Notifications not received

1. Check if FCM token is saved in database:
   ```sql
   SELECT * FROM fcm_tokens WHERE user_id = 'your-user-id';
   ```

2. Check backend logs for errors
3. Verify Firebase service account is configured correctly
4. Ensure notification permissions are granted on device

### Token registration fails

1. Verify `EXPO_PROJECT_ID` is set correctly
2. Check if device is physical (push notifications don't work on simulators)
3. Ensure app has notification permissions

### Firebase Admin SDK errors

1. Verify `FIREBASE_SERVICE_ACCOUNT` is valid JSON
2. Check if service account has correct permissions
3. Ensure project ID matches your Firebase project

## Production Considerations

1. **Security**: Never expose Firebase service account credentials
2. **Rate Limiting**: Implement rate limiting for notification endpoints
3. **Token Cleanup**: Regularly clean up inactive tokens
4. **Error Handling**: Handle failed token deliveries gracefully
5. **Analytics**: Track notification delivery and open rates
6. **Batching**: For bulk notifications, use FCM batch sending
7. **Retry Logic**: Implement retry mechanism for failed sends

## Resources

- [Firebase Cloud Messaging Documentation](https://firebase.google.com/docs/cloud-messaging)
- [Expo Notifications Documentation](https://docs.expo.dev/push-notifications/overview/)
- [Firebase Admin SDK Documentation](https://firebase.google.com/docs/admin/setup)

# Push Notification & Email Setup Guide

## ✅ What's Already Done

### 1. **Activities & Tasks are Dynamic**
- Location: `app/field/[id]/components/OverviewTab.tsx`
- Activities automatically update based on:
  - Rice variety selected
  - Current growth stage
  - Days since planting
  - Planting method (transplant vs direct planting)
- Tasks can be checked off and saved to Firestore
- Pre-planting activities are shown for transplant method

### 2. **Push Notification Infrastructure**
- FCM token storage updated to use array field in user document
- Cloud Function `sendTestNotification` created
- Notification dispatcher triggers on new notifications
- Client hook `usePushNotifications` handles token management
- Test page created at `/test/push`

### 3. **Email Notifications with Nodemailer**
- Nodemailer added to Cloud Functions
- Email sending integrated into `notificationDispatcher`
- Supports Gmail SMTP (configurable)
- HTML email templates included

## 🚀 Deployment Steps

### Step 1: Install Dependencies in Functions
```bash
cd functions
npm install
```

### Step 2: Configure Email (Gmail)
```bash
# Set email credentials (use Gmail App Password, not regular password)
firebase functions:config:set email.user="your-email@gmail.com"
firebase functions:config:set email.password="your-app-password"

# View current config
firebase functions:config:get
```

**How to get Gmail App Password:**
1. Go to Google Account → Security
2. Enable 2-Step Verification
3. Go to App Passwords
4. Create new app password for "Mail"
5. Use that 16-character password (not your regular Gmail password)

### Step 3: Deploy Cloud Functions
```bash
# From project root
firebase deploy --only functions
```

This will deploy:
- `logUserAction` - Logs control panel actions
- `sendTestNotification` - Sends test notifications
- `dispatchNotification` - Handles push & email delivery

### Step 4: Test Push Notifications

1. **Open test page**: Navigate to `/test/push` in your app
2. **Request permission**: Click "Request Permission" button
3. **Verify FCM token**: Check that token is saved
4. **Send test**: Click any test button
5. **Check results**:
   - Browser notification should appear
   - Email should arrive (if configured)
   - Check browser console for logs

## 📱 How It Works

### Push Notification Flow
```
1. User grants permission → FCM token generated
2. Token saved to Firestore: users/{uid}/fcmTokens (array)
3. Client calls sendTestNotification Cloud Function
4. Function creates notification document
5. dispatchNotification trigger fires
6. Function sends:
   - Push notification via FCM
   - Email via Nodemailer
7. User receives both notifications
```

### Automatic Triggers

The notification system can be triggered automatically for:

**Device Offline:**
```typescript
import { notifyError } from '@/lib/utils/pushNotifications';

// When device goes offline
await notifyError(
  `Device ${deviceId} is offline`,
  deviceId,
  fieldId
);
```

**Sensor Warnings:**
```typescript
import { notifyWarning } from '@/lib/utils/pushNotifications';

// When NPK levels are low
await notifyWarning(
  'NPK levels below threshold',
  deviceId,
  fieldId
);
```

**Command Failures:**
```typescript
import { notifyError } from '@/lib/utils/pushNotifications';

// When relay command fails
await notifyError(
  `Command failed for relay ${relayNum}`,
  deviceId,
  fieldId
);
```

## 🔧 Integration Examples

### In ControlPanelTab.tsx
```typescript
import { notifyError, notifyWarning } from '@/lib/utils/pushNotifications';

// After running a command
const response = await runCommandRef.update({ /* ... */ });

if (response.status === 'failed') {
  // Notify user of failure
  await notifyError(
    `Failed to turn ${action} relay ${relayNum}`,
    deviceId,
    fieldId
  );
}
```

### In HeartbeatMonitor (Functions)
Already implemented! The `monitorHeartbeat` function:
- Detects when devices go offline
- Automatically creates notification documents
- Triggers email & push notifications

### In Device Status Check
```typescript
// Check if device is offline
if (!hasHeartbeat) {
  await notifyWarning(
    `Device ${deviceId} appears to be offline`,
    deviceId,
    fieldId
  );
}
```

## 📧 Email Template Customization

Edit `functions/src/notificationDispatcher.ts`:

```typescript
const emailBody = `
  <div style="font-family: Arial, sans-serif;">
    <h2>${emailSubject}</h2>
    <p>${notification.message}</p>
    // Add your custom content here
  </div>
`;
```

## 🔐 Security Rules

Make sure notifications collection has proper security:

```javascript
// firestore.rules
match /users/{userId}/notifications/{notificationId} {
  allow read: if request.auth.uid == userId;
  allow write: if false; // Only Cloud Functions can write
}
```

## 🐛 Troubleshooting

### No Push Notifications Received
1. Check browser console for FCM token
2. Verify token is in Firestore: `users/{uid}` → `fcmTokens` array
3. Check Firebase Console → Cloud Messaging
4. Ensure service worker is registered

### No Email Received
1. Verify email config: `firebase functions:config:get`
2. Check Gmail App Password is correct
3. Look for errors in Functions logs: `firebase functions:log`
4. Check spam folder

### Permission Denied
1. Ensure user is authenticated
2. Check Firestore security rules
3. Verify user document exists

## 📊 Monitoring

View function logs:
```bash
firebase functions:log
```

View real-time logs:
```bash
firebase functions:log --only sendTestNotification,dispatchNotification
```

## ✨ Next Steps

1. **Deploy functions**: `firebase deploy --only functions`
2. **Configure email**: Set Gmail credentials
3. **Test**: Visit `/test/push` page
4. **Integrate**: Add notification calls to critical actions
5. **Monitor**: Check logs and user feedback

---

**Note**: Activities and tasks in the Overview tab are already fully dynamic and working! They update automatically based on variety data and growth stages.

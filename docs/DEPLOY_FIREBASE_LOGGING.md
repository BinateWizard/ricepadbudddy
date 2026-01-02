# Deploy Firebase Scheduled Function for Auto-Logging

This guide will help you deploy the `scheduledSensorLogger` function that automatically logs sensor readings every 5 minutes.

## ✅ Prerequisites

1. **Firebase Blaze Plan** (Pay-as-you-go)
   - Scheduled functions require the Blaze plan
   - Go to Firebase Console → Project Settings → Upgrade
   - Don't worry - you only pay for what you use, and this function is very lightweight

2. **Cloud Scheduler API Enabled**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Select your Firebase project
   - Go to **APIs & Services** → **Library**
   - Search for "Cloud Scheduler API"
   - Click **Enable**

3. **Firebase CLI Installed**
   ```bash
   npm install -g firebase-tools
   ```

4. **Logged into Firebase**
   ```bash
   firebase login
   ```

## 📋 Deployment Steps

### 1. Navigate to Functions Directory

```bash
cd functions
```

### 2. Install Dependencies (if not already done)

```bash
npm install
```

### 3. Build TypeScript

```bash
npm run build
```

### 4. Deploy the Scheduled Function

```bash
# Deploy only the scheduled function
firebase deploy --only functions:scheduledSensorLogger
```

Or deploy all functions:

```bash
firebase deploy --only functions
```

### 5. Verify Deployment

After deployment, you should see:
```
✔  functions[scheduledSensorLogger(us-central1)] Successful create operation.
```

## 🔍 Verify It's Running

### Check Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Functions** tab
4. You should see `scheduledSensorLogger` with a clock icon ⏰
5. Status should be **Active**

### Check Cloud Scheduler

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project
3. Go to **Cloud Scheduler**
4. You should see a job named `firebase-schedule-scheduledSensorLogger-us-central1`
5. Status should be **Enabled**
6. Schedule should show: `*/5 * * * *` (every 5 minutes)

### Check Logs

1. Go to Firebase Console → **Functions** → `scheduledSensorLogger`
2. Click **Logs** tab
3. After 5-10 minutes, you should see execution logs:
   ```
   [Scheduled] Starting sensor logging job...
   [Scheduled] Logged X reading(s) for device {deviceId}
   [Scheduled] Job completed. Logged X reading(s) total.
   ```

Or use Firebase CLI:

```bash
firebase functions:log --only scheduledSensorLogger
```

## 🐛 Troubleshooting

### Function shows 0 invocations

**Problem:** Function is deployed but not running.

**Solutions:**
1. **Check Cloud Scheduler API is enabled**
   - Go to Google Cloud Console → APIs & Services → Library
   - Search "Cloud Scheduler API" → Enable

2. **Check Firebase Plan**
   - Go to Firebase Console → Project Settings
   - Must be on **Blaze plan** (pay-as-you-go)

3. **Check Function Status**
   - Firebase Console → Functions
   - Should show "Active" status

4. **Manually Trigger (for testing)**
   ```bash
   # In Google Cloud Console → Cloud Scheduler
   # Click on the job → Click "RUN NOW"
   ```

### Function errors in logs

**Check common issues:**
- RTDB URL is correct in `functions/src/index.ts`
- Firestore rules allow writes to logs collection
- Devices exist in RTDB with NPK data
- Paddies have `deviceId` field set correctly

### Build errors

```bash
# Make sure TypeScript is installed
cd functions
npm install

# Clean and rebuild
rm -rf lib node_modules
npm install
npm run build
```

### Permission errors

Make sure you're logged in:
```bash
firebase login
firebase use <your-project-id>
```

## ✅ Success Indicators

After successful deployment and a few minutes:

1. **Function appears in Firebase Console** with clock icon
2. **Logs appear every 5 minutes** in Firebase Functions logs
3. **Sensor readings increase** in Firestore at:
   `users/{userId}/fields/{fieldId}/paddies/{paddyId}/logs`
4. **Readings visible** in your app's device/field pages

## 🔄 Update the Function

If you make changes to `functions/src/index.ts`:

```bash
cd functions
npm run build
firebase deploy --only functions:scheduledSensorLogger
```

## 📊 Monitoring

- **Firebase Console** → Functions → `scheduledSensorLogger` → Logs
- **Google Cloud Console** → Cloud Scheduler → View job history
- **Google Cloud Console** → Logging → Filter by function name

## 💡 Tips

- The function runs every 5 minutes automatically
- It works 24/7 even when your app is closed
- Deduplication prevents duplicate logs (same values within 5 minutes)
- Each execution processes all devices in RTDB
- Logs are written to all paddies associated with each device

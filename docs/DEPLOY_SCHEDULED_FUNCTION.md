# Deploy Scheduled Function to Firebase

The `scheduledSensorLogger` function needs to be deployed to Firebase so it runs automatically every 5 minutes, even when your app is offline.

## Steps to Deploy:

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

This compiles `src/index.ts` to `lib/index.js`

### 4. Deploy to Firebase
```bash
firebase deploy --only functions:scheduledSensorLogger
```

Or deploy all functions:
```bash
firebase deploy --only functions
```

### 5. Verify Deployment

After deployment, check Firebase Console:
1. Go to Firebase Console → Functions
2. You should see `scheduledSensorLogger` listed
3. It should show trigger type: **Pub/Sub schedule** with schedule `every 5 minutes`

### 6. Check Logs

To see if it's running:
```bash
firebase functions:log --only scheduledSensorLogger
```

Or check in Firebase Console → Functions → scheduledSensorLogger → Logs

## What This Function Does:

- **Runs every 5 minutes** automatically on Firebase servers
- **Checks all devices** in RTDB for sensor readings
- **Logs to Firestore** even when your app is closed
- **Works 24/7** - no need for your PC or app to be running

## Expected Behavior:

After deployment, your readings should increase automatically:
- If you have 61 readings now
- After 5 minutes: Should have 62+ (if device sent new data)
- After 10 minutes: Should have 63+ (if device sent new data)
- This continues even if you close the app

## Troubleshooting:

### Function not appearing after deploy:
- Check deployment logs for errors
- Verify TypeScript compiled successfully (`lib/index.js` exists)
- Check Firebase Console for deployment status

### Function not running:
- Check Firebase Console → Functions → scheduledSensorLogger
- Look at the "Logs" tab for errors
- Verify the schedule shows "every 5 minutes"

### No new logs being created:
- Check function logs for errors
- Verify devices exist in RTDB with NPK data
- Verify paddies are linked to devices (`deviceId` field exists)
- Check Firestore rules allow writes

## Firestore Index

The function uses `collectionGroup('paddies').where('deviceId', '==', deviceId)` which should work without an index if you have the default indexes enabled. If you get an index error, Firebase will provide a link to create the required index.

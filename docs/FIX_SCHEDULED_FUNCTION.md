# Fix Scheduled Function Not Running

Your `scheduledSensorLogger` function is deployed but showing 0 invocations. Here's how to fix it:

## Common Issues & Solutions:

### 1. Enable Cloud Scheduler API (Most Common Issue)

The scheduled function requires Cloud Scheduler API to be enabled:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project (`rice-padbuddy`)
3. Go to **APIs & Services** → **Library**
4. Search for "Cloud Scheduler API"
5. Click **Enable**

Also enable:
- **Cloud Pub/Sub API** (if not already enabled)

### 2. Check Firebase Plan

Scheduled functions require the **Blaze (pay-as-you-go) plan**:
- Go to Firebase Console → Project Settings → Usage and billing
- If on Spark (free) plan, upgrade to Blaze
- Note: Blaze plan has a free tier, so you won't be charged unless you exceed free limits

### 3. Verify Cloud Scheduler Job

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **Cloud Scheduler**
3. Look for a job named: `firebase-scheduled-scheduledSensorLogger-us-central1`
4. Check if it's **Enabled** (should be green/enabled)
5. If it's paused/disabled, click to enable it

### 4. Check Function Logs

View logs to see if there are any errors:
```bash
firebase functions:log --only scheduledSensorLogger
```

Or in Firebase Console → Functions → scheduledSensorLogger → Logs

### 5. Redeploy After Enabling APIs

After enabling Cloud Scheduler API, redeploy:
```bash
cd functions
npm run build
firebase deploy --only functions:scheduledSensorLogger
```

## Verify It's Working:

After enabling APIs and redeploying:
1. Wait 5-10 minutes
2. Check Firebase Console → Functions → scheduledSensorLogger
3. "Requests (24 hrs)" should increase
4. Check the logs tab for execution logs

## Alternative: Use Vercel Cron Instead

If Cloud Scheduler continues to have issues, you can use the Vercel cron job we created earlier:
- File: `app/api/cron/log-sensors/route.ts`
- Config: `vercel.json`
- This runs on Vercel's infrastructure and doesn't require Cloud Scheduler

## Quick Checklist:

- [ ] Cloud Scheduler API enabled
- [ ] Cloud Pub/Sub API enabled  
- [ ] Firebase project on Blaze plan
- [ ] Cloud Scheduler job exists and is enabled
- [ ] Function redeployed after enabling APIs
- [ ] Checked function logs for errors

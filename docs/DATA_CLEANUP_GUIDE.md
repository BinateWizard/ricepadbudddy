# Data Cleanup Guide

## 🧹 Firestore Data Cleanup Tool

A secure, admin-only cleanup tool to permanently delete all user data, fields, paddies, and related documents from Firestore.

---

## ✅ Quick Start

### Step 1: Access the Cleanup Page

Navigate to:
```
http://localhost:3000/test/cleanup-data
```

Or in production:
```
https://your-padbuddy-domain.com/test/cleanup-data
```

### Step 2: Delete Data

1. Click **"Delete All User Data"**
2. A confirmation message will appear
3. Click **"CONFIRM DELETE"** again to proceed
4. The cleanup will run via Cloud Function with admin privileges

---

## 🔒 Security Features

### Admin-Only Access
- Requires authentication
- Only `ricepaddy.contact@gmail.com` can trigger cleanup
- Uses Firebase Cloud Function with admin SDK (bypasses security rules)
- All operations logged to Cloud Function logs

### Safe Deletion
- Uses Firestore batch operations (500-doc limit per batch)
- Handles large datasets efficiently
- Real-time progress updates
- Error handling and detailed reporting

---

## 📊 What Gets Deleted

### User Data
- ✅ All user documents (`users/{userId}`)
- ✅ All user fields (`users/{userId}/fields/{fieldId}`)
- ✅ All user paddies (`users/{userId}/fields/{fieldId}/paddies/{paddyId}`)
- ✅ All paddy logs (`users/{userId}/fields/{fieldId}/paddies/{paddyId}/logs/{logId}`)
- ✅ All field tasks (`users/{userId}/fields/{fieldId}/tasks/{taskId}`)
- ✅ All user notifications (`users/{userId}/notifications/{notificationId}`)
- ✅ All FCM tokens (`users/{userId}/fcmTokens/{tokenId}`)

### What Stays Intact
- ✓ Device collection (DEVICE_0001, DEVICE_0002, etc.)
- ✓ System logs and command logs
- ✓ Rice varieties collection
- ✓ All Firebase Functions
- ✓ All RTDB data

---

## 🛠️ Technical Implementation

### Cloud Function: `cleanupAllUserData`

**Location:** [functions/src/index.ts](../functions/src/index.ts#L925)

**Type:** Callable Cloud Function (HTTPS)

**Authentication:**
```typescript
// Must be authenticated
if (!context.auth) {
  throw new HttpsError('unauthenticated', 'Must be logged in to cleanup data');
}

// Must be admin email
const idTokenResult = await admin.auth().getUser(context.auth.uid);
if (idTokenResult.email !== 'ricepaddy.contact@gmail.com') {
  throw new HttpsError('permission-denied', 'Only admins can cleanup data');
}
```

**Process:**
1. Gets all users from Firestore
2. For each user:
   - Deletes all fields and nested documents
   - Deletes all notifications and FCM tokens
   - Deletes user document itself
3. Uses batch commits (500 docs per batch)
4. Returns statistics of deleted documents

**Returns:**
```typescript
{
  success: true,
  message: "Cleanup complete! Deleted X documents.",
  stats: {
    users: number,
    fields: number,
    paddies: number,
    logs: number,
    tasks: number,
    notifications: number,
    fcmTokens: number,
    totalDeleted: number
  }
}
```

### Client Page: `cleanup-data/page.tsx`

**Location:** [app/test/cleanup-data/page.tsx](../app/test/cleanup-data/page.tsx)

**Features:**
- Real-time progress updates
- Double-confirmation for safety
- Statistics display
- Error handling with detailed messages
- Uses `httpsCallable` to invoke Cloud Function

**Usage:**
```typescript
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

const cleanupFunction = httpsCallable(functions, 'cleanupAllUserData');
const result = await cleanupFunction({});

// Result contains stats and success message
```

---

## 🚀 Deployment

### Cloud Function
The `cleanupAllUserData` function was automatically deployed with:
```bash
cd functions
npm run deploy
```

**Deployment status:**
✅ `cleanupAllUserData(us-central1)` - Successful create operation

### Client Page
No deployment needed - it's part of your Next.js app and uses the deployed Cloud Function.

---

## 📋 Cleanup Checklist

Before running cleanup:
- [ ] Verify you're logged in as the admin user
- [ ] Backup any data you need (if applicable)
- [ ] Ensure no users are actively using the app
- [ ] Navigate to `/test/cleanup-data`
- [ ] Click "Delete All User Data"
- [ ] Click "CONFIRM DELETE" to proceed

After cleanup:
- [ ] Verify devices are still in DEVICE_* collection
- [ ] Check Cloud Function logs for success
- [ ] Verify all user documents are deleted
- [ ] Check that Firebase Functions still work

---

## 🔍 Monitoring & Logs

### Cloud Function Logs
View cleanup execution logs:
```
Firebase Console > Functions > cleanupAllUserData > Logs
```

Look for messages like:
```
[Cleanup] Starting data cleanup...
[Cleanup] Successfully cleaned up data: { users: 2, fields: 5, paddies: 10, ... }
```

### Firestore Verification
After cleanup, verify deletion:
1. Open Firebase Console
2. Go to Firestore Database
3. Check `users` collection - should be empty
4. Check `devices` collection - should still have devices

---

## ⚠️ Important Notes

### Cannot Undo
- ❌ **Deletion is permanent!** 
- Firestore does not have an "undo" feature
- Make backups before running cleanup if needed

### Rate Limiting
- If you have 10,000+ documents, cleanup may take several minutes
- Cloud Functions have a 9-minute timeout limit
- For massive datasets, consider manual Firestore deletion or contacting Firebase support

### Time Zones
- Cleanup runs in `us-central1` region
- Timestamps use UTC

---

## 🆘 Troubleshooting

### "Permission Denied" Error

**Cause:** User is not logged in as admin

**Solution:**
1. Log out
2. Log in as `ricepaddy.contact@gmail.com`
3. Try again

### "Must be logged in" Error

**Cause:** Not authenticated

**Solution:**
1. Open browser DevTools
2. Check localStorage for Firebase auth token
3. Log in to the app
4. Try cleanup again

### Function Timeout (9 minutes exceeded)

**Cause:** Too many documents to delete

**Solution:**
- Run cleanup during off-peak hours
- Consider manual Firestore deletion for very large datasets
- Contact Firebase support for bulk deletion

### Cleanup Doesn't Complete

**Cause:** Network interruption or function crash

**Solution:**
1. Check Cloud Function logs
2. Try again - the function is idempotent (safe to re-run)
3. If stuck, check Firestore directly to see partial deletion

---

## 📝 API Reference

### Call from Client

```typescript
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

try {
  const cleanupFunction = httpsCallable(functions, 'cleanupAllUserData');
  const result = await cleanupFunction({});
  
  console.log('Cleanup complete:', result.data);
  // {
  //   success: true,
  //   message: "Cleanup complete! Deleted 47 documents.",
  //   stats: { users: 1, fields: 3, paddies: 5, ... }
  // }
} catch (error) {
  console.error('Cleanup failed:', error.message);
  // Possible errors:
  // - 'unauthenticated': Not logged in
  // - 'permission-denied': Not admin user
  // - 'internal': Cleanup failed (see Cloud Function logs)
}
```

### Error Handling

```typescript
if (error.code === 'unauthenticated') {
  // User not logged in - redirect to login
} else if (error.code === 'permission-denied') {
  // Not an admin - show "contact administrator" message
} else if (error.code === 'internal') {
  // Cleanup failed - show error details from Cloud Function logs
}
```

---

## 📊 Example Cleanup Output

```
✅ Cleanup complete! Deleted 47 documents.

Breakdown:
- 2 users
- 5 fields
- 10 paddies
- 25 logs
- 3 tasks
- 1 notifications
- 1 FCM tokens
```

---

## 🔗 Related Documentation

- [Firestore Security Rules](../firestore.rules)
- [Cloud Functions](../functions/src/index.ts)
- [Firebase Auth](../lib/firebase.ts)
- [Admin Dashboard](../app/admin/)

---

**Created:** January 3, 2026  
**Version:** 1.0  
**Status:** ✅ Deployed & Tested

# PadBuddy Data Migration Guide

## Overview
This guide helps you migrate from the legacy data structure (users/{userId}/fields/{fieldId}/paddies/{paddyId}) to the new layered architecture with top-level collections.

## Architecture Changes

### OLD STRUCTURE (Legacy)
```
/users/{userId}
  └─ /fields/{fieldId}
      └─ /paddies/{paddyId}
          ├─ deviceId
          ├─ paddyName
          └─ /logs/{logId}
```

### NEW STRUCTURE (Layered)
```
/users/{userId}                    # User profiles
  ├─ fieldsOwned: ["field_001"]
  ├─ devicesOwned: ["DEVICE_0005"]
  └─ notifications: [...]

/fields/{fieldId}                  # Top-level fields
  ├─ ownerId: "user_001"
  ├─ name: "North Rice Field"
  ├─ devices: ["DEVICE_0005"]
  └─ plot: [{lat, lng}, ...]

/devices/{deviceId}                # Top-level devices (CRITICAL)
  ├─ ownerId: "user_001"
  ├─ fieldId: "field_001"
  ├─ connected: true
  ├─ lastHeartbeat: 1234567890
  └─ /logs/{logId}                 # Device action logs
      └─ /schedules/{scheduleId}   # Scheduled commands
```

## Key Differences

### 1. **Devices Now Top-Level**
- Devices are no longer nested under users/fields/paddies
- They exist at `/devices/{deviceId}` for global access
- Easier for Firebase Functions to monitor ALL devices
- Better for cross-user device transfers

### 2. **Device Logs Under Devices**
- Old: `/users/{uid}/fields/{fid}/paddies/{pid}/logs`
- New: `/devices/{deviceId}/logs`
- Device-centric logging

### 3. **Schedules Subcollection**
- New: `/devices/{deviceId}/schedules/{scheduleId}`
- Stores pending, executed, or failed scheduled commands

### 4. **User References**
- Users maintain arrays of `fieldsOwned` and `devicesOwned`
- Quick lookups without deep queries

### 5. **Field-Device Relationship**
- Fields store array of device IDs: `devices: ["DEVICE_0005", "DEVICE_0006"]`
- Devices store `fieldId` for reverse lookup

## Migration Steps

### Step 1: Backup Current Data
```bash
# Export existing Firestore data
firebase firestore:export gs://your-bucket-name/backups/pre-migration
```

### Step 2: Run Migration Script
```bash
cd scripts
node migrateToNewArchitecture.js
```

The script will:
1. Read all existing users, fields, and paddies
2. Create top-level `/fields` and `/devices` collections
3. Update user documents with `fieldsOwned` and `devicesOwned` arrays
4. Migrate logs from paddies to devices
5. Preserve all existing data

### Step 3: Update RTDB References
The RTDB structure remains at `/devices/{deviceId}` but ensure:
- `ownedBy` field points to userId
- `fieldId` field references the Firestore field ID
- Heartbeat monitoring continues at `/devices/{deviceId}/heartbeat`

### Step 4: Update Frontend Code
Update queries from:
```typescript
// OLD
const paddiesRef = collection(db, `users/${uid}/fields/${fid}/paddies`);
```

To:
```typescript
// NEW
const devicesRef = collection(db, 'devices');
const q = query(devicesRef, where('ownerId', '==', uid));
```

### Step 5: Update Firebase Functions
Functions now query `/devices` directly instead of collectionGroup:
```typescript
// OLD
const paddiesSnapshot = await firestore.collectionGroup('paddies').get();

// NEW
const devicesSnapshot = await firestore.collection('devices').get();
```

## Compatibility Layer

For a smooth transition, you can maintain both structures temporarily:

```typescript
// Write to both old and new locations
async function createDeviceCompat(deviceData) {
  // New structure
  await addDoc(collection(db, 'devices'), deviceData);
  
  // Old structure (for backward compat)
  await addDoc(collection(db, `users/${uid}/fields/${fid}/paddies`), {
    deviceId: deviceData.deviceId,
    paddyName: deviceData.name
  });
}
```

## Testing Checklist

- [ ] All devices appear in admin panel
- [ ] Device heartbeat monitoring works
- [ ] NPK logging continues successfully
- [ ] Scheduled commands execute
- [ ] User can view their devices
- [ ] Field-device relationships intact
- [ ] Historical logs preserved
- [ ] Notifications work correctly

## Rollback Plan

If issues arise:
1. Stop the migration script
2. Delete newly created `/fields` and `/devices` collections
3. Restore from backup:
   ```bash
   firebase firestore:import gs://your-bucket-name/backups/pre-migration
   ```

## Benefits of New Architecture

✅ **Faster Queries**: No more collectionGroup queries  
✅ **Scalability**: Devices can be queried globally  
✅ **Device-Centric**: Logs and schedules live with devices  
✅ **Extensibility**: Easy to add new device types  
✅ **Admin Dashboard**: View all devices across all users  
✅ **Transfer Support**: Devices can move between users/fields  

## Schema Validation

Use TypeScript types from `/lib/types/firestore-schema.ts`:
```typescript
import { DeviceDocument, FieldDocument, UserDocument } from '@/lib/types/firestore-schema';
```

## Support

For migration issues:
1. Check logs in Firebase Console
2. Review error collection: `/errors`
3. Verify RTDB structure at `/devices/{deviceId}`
4. Check function deployment logs

## Next Steps

After migration:
1. Update all frontend queries
2. Deploy updated Firebase Functions
3. Test scheduled sensor logging
4. Verify heartbeat monitoring
5. Test device commands (live + scheduled)
6. Update documentation

/**
 * Data Migration Script: Legacy to New Layered Architecture
 * 
 * Migrates from:
 *   users/{userId}/fields/{fieldId}/paddies/{paddyId}
 * 
 * To:
 *   /users/{userId} (with fieldsOwned, devicesOwned arrays)
 *   /fields/{fieldId} (top-level)
 *   /devices/{deviceId} (top-level with logs/schedules subcollections)
 * 
 * USAGE:
 *   node scripts/migrateToNewArchitecture.js
 * 
 * OPTIONS:
 *   --dry-run    : Show what would be migrated without making changes
 *   --batch-size : Number of documents to process at once (default: 500)
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json'); // You'll need this

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://rice-padbuddy-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.firestore();
const rtdb = admin.database();

// Parse command line args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const BATCH_SIZE = parseInt(args.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '500');

console.log('🚀 PadBuddy Data Migration Script');
console.log('====================================');
console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '✍️  LIVE MIGRATION'}`);
console.log(`Batch Size: ${BATCH_SIZE}`);
console.log('');

// Migration statistics
const stats = {
  usersProcessed: 0,
  fieldsCreated: 0,
  devicesCreated: 0,
  logsM igrated: 0,
  errors: []
};

async function migrateData() {
  try {
    // Step 1: Get all users
    console.log('📂 Step 1: Fetching all users...');
    const usersSnapshot = await db.collection('users').get();
    console.log(`   Found ${usersSnapshot.size} users\n`);

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      console.log(`👤 Processing user: ${userData.email || userId}`);
      
      try {
        // Track user's fields and devices
        const fieldsOwned = [];
        const devicesOwned = [];
        
        // Step 2: Get all fields for this user
        const fieldsSnapshot = await db.collection(`users/${userId}/fields`).get();
        console.log(`   📍 Found ${fieldsSnapshot.size} fields`);
        
        for (const fieldDoc of fieldsSnapshot.docs) {
          const fieldId = fieldDoc.id;
          const fieldData = fieldDoc.data();
          
          // Create top-level field document
          const newFieldData = {
            ownerId: userId,
            name: fieldData.fieldName || 'Unnamed Field',
            description: fieldData.description || '',
            variety: fieldData.riceVariety || null,
            plantingType: fieldData.plantingMethod || null,
            startDate: fieldData.startDay ? new Date(fieldData.startDay).getTime() : null,
            devices: [],
            createdAt: fieldData.createdAt?._seconds ? fieldData.createdAt._seconds * 1000 : Date.now()
          };
          
          if (!DRY_RUN) {
            await db.collection('fields').doc(fieldId).set(newFieldData);
          }
          
          fieldsOwned.push(fieldId);
          stats.fieldsCreated++;
          
          console.log(`      ✅ Migrated field: ${newFieldData.name}`);
          
          // Step 3: Get all paddies (devices) for this field
          const paddiesSnapshot = await db.collection(`users/${userId}/fields/${fieldId}/paddies`).get();
          console.log(`         🔌 Found ${paddiesSnapshot.size} devices`);
          
          for (const paddyDoc of paddiesSnapshot.docs) {
            const paddyId = paddyDoc.id;
            const paddyData = paddyDoc.data();
            const deviceId = paddyData.deviceId;
            
            if (!deviceId) {
              console.log(`         ⚠️  Skipping paddy ${paddyId}: no deviceId`);
              continue;
            }
            
            // Check if device already exists (avoid duplicates)
            const existingDevice = await db.collection('devices')
              .where('deviceId', '==', deviceId)
              .limit(1)
              .get();
            
            let deviceDocId;
            
            if (!existingDevice.empty) {
              deviceDocId = existingDevice.docs[0].id;
              console.log(`         ℹ️  Device ${deviceId} already exists, updating...`);
              
              if (!DRY_RUN) {
                await db.collection('devices').doc(deviceDocId).update({
                  fieldId: fieldId,
                  name: paddyData.paddyName || deviceId
                });
              }
            } else {
              // Create new device document
              const newDeviceData = {
                ownerId: userId,
                fieldId: fieldId,
                name: paddyData.paddyName || deviceId,
                deviceType: 'ESP32',
                deviceId: deviceId,
                description: paddyData.description || '',
                connected: false,
                lastHeartbeat: Date.now(),
                createdAt: paddyData.connectedAt?._seconds ? paddyData.connectedAt._seconds * 1000 : Date.now()
              };
              
              // Get heartbeat from RTDB
              try {
                const heartbeatSnap = await rtdb.ref(`devices/${deviceId}/heartbeat`).once('value');
                if (heartbeatSnap.exists()) {
                  const heartbeat = heartbeatSnap.val();
                  newDeviceData.connected = heartbeat.status === 'online';
                  newDeviceData.lastHeartbeat = heartbeat.lastSeen || Date.now();
                }
              } catch (error) {
                console.log(`         ⚠️  Could not fetch heartbeat for ${deviceId}`);
              }
              
              // Get GPS from RTDB
              try {
                const gpsSnap = await rtdb.ref(`devices/${deviceId}/gps`).once('value');
                if (gpsSnap.exists()) {
                  const gps = gpsSnap.val();
                  if (gps.lat && gps.lng) {
                    newDeviceData.location = { lat: gps.lat, lng: gps.lng };
                  }
                }
              } catch (error) {
                // GPS is optional
              }
              
              if (!DRY_RUN) {
                const deviceRef = await db.collection('devices').add(newDeviceData);
                deviceDocId = deviceRef.id;
              } else {
                deviceDocId = 'dry-run-id';
              }
              
              stats.devicesCreated++;
              console.log(`         ✅ Created device: ${deviceId}`);
            }
            
            // Add device to field's devices array
            if (!DRY_RUN && !newFieldData.devices.includes(deviceId)) {
              newFieldData.devices.push(deviceId);
              await db.collection('fields').doc(fieldId).update({ devices: newFieldData.devices });
            }
            
            devicesOwned.push(deviceId);
            
            // Step 4: Migrate logs from paddy to device
            const logsSnapshot = await db.collection(`users/${userId}/fields/${fieldId}/paddies/${paddyId}/logs`).get();
            
            if (!logsSnapshot.empty) {
              console.log(`            📋 Migrating ${logsSnapshot.size} logs...`);
              
              for (const logDoc of logsSnapshot.docs) {
                const logData = logDoc.data();
                
                const newLogData = {
                  type: 'system',
                  command: 'sensor_reading',
                  requestedState: 'LOG',
                  actualState: 'LOGGED',
                  success: true,
                  timestamp: logData.timestamp?._seconds ? logData.timestamp._seconds * 1000 : Date.now(),
                  commandId: `migrated_${logDoc.id}`,
                  userId: userId
                };
                
                if (!DRY_RUN && deviceDocId !== 'dry-run-id') {
                  await db.collection('devices').doc(deviceDocId).collection('logs').add(newLogData);
                }
                
                stats.logsMigrated++;
              }
            }
          }
        }
        
        // Step 5: Update user document with fieldsOwned and devicesOwned
        const userUpdate = {
          fieldsOwned: Array.from(new Set(fieldsOwned)),
          devicesOwned: Array.from(new Set(devicesOwned)),
          statistics: {
            totalFields: fieldsOwned.length,
            totalDevices: devicesOwned.length
          }
        };
        
        if (!DRY_RUN) {
          await db.collection('users').doc(userId).update(userUpdate);
        }
        
        console.log(`   ✅ Updated user with ${fieldsOwned.length} fields, ${devicesOwned.length} devices\n`);
        stats.usersProcessed++;
        
      } catch (error) {
        console.error(`   ❌ Error processing user ${userId}:`, error.message);
        stats.errors.push({ userId, error: error.message });
      }
    }
    
    // Print summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(50));
    console.log(`Users Processed:    ${stats.usersProcessed}`);
    console.log(`Fields Created:     ${stats.fieldsCreated}`);
    console.log(`Devices Created:    ${stats.devicesCreated}`);
    console.log(`Logs Migrated:      ${stats.logsMigrated}`);
    console.log(`Errors:             ${stats.errors.length}`);
    
    if (stats.errors.length > 0) {
      console.log('\n⚠️  ERRORS:');
      stats.errors.forEach(({ userId, error }) => {
        console.log(`   - ${userId}: ${error}`);
      });
    }
    
    if (DRY_RUN) {
      console.log('\n🔍 This was a DRY RUN. No changes were made.');
      console.log('   Run without --dry-run to perform actual migration.');
    } else {
      console.log('\n✅ Migration completed successfully!');
      console.log('   Next steps:');
      console.log('   1. Verify data in Firebase Console');
      console.log('   2. Update frontend queries');
      console.log('   3. Deploy updated Firebase Functions');
      console.log('   4. Test device monitoring and commands');
    }
    
  } catch (error) {
    console.error('❌ Fatal error during migration:', error);
    process.exit(1);
  }
}

// Run migration
migrateData()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

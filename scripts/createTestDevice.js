// Script to create test devices in Firestore for development
// Run this with: node scripts/createTestDevice.js

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, serverTimestamp } = require('firebase/firestore');

// Firebase configuration - make sure your .env.local is set up
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function createTestDevices() {
  try {
    console.log('Creating test devices...\n');

    // Create DEVICE_0001
    const device1Ref = doc(db, 'devices', 'DEVICE_0001');
    await setDoc(device1Ref, {
      deviceId: 'DEVICE_0001',
      name: 'Test Device 1',
      status: 'available',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      // connectedTo will be added when user connects
      // fieldId will be added when user connects
      // paddyName will be added when user connects
    });
    console.log('✅ Created DEVICE_0001');

    // Create DEVICE_0002
    const device2Ref = doc(db, 'devices', 'DEVICE_0002');
    await setDoc(device2Ref, {
      deviceId: 'DEVICE_0002',
      name: 'Test Device 2',
      status: 'available',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    console.log('✅ Created DEVICE_0002');

    // Create DEVICE_0003
    const device3Ref = doc(db, 'devices', 'DEVICE_0003');
    await setDoc(device3Ref, {
      deviceId: 'DEVICE_0003',
      name: 'Test Device 3',
      status: 'available',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    console.log('✅ Created DEVICE_0003');

    console.log('\n✨ All test devices created successfully!');
    console.log('\nYou can now use these device IDs in your app:');
    console.log('  - DEVICE_0001');
    console.log('  - DEVICE_0002');
    console.log('  - DEVICE_0003');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating devices:', error);
    process.exit(1);
  }
}

createTestDevices();

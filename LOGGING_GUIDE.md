# Sensor Data Logging System

## Overview
The system automatically logs sensor readings (NPK levels, temperature, humidity, water level) to Firestore with timestamps for historical tracking and trend analysis.

## Data Structure

```
users/
  └── {userId}/
      └── fields/
          └── {fieldId}/
              └── paddies/
                  └── {paddyId}/
                      └── logs/
                          └── {logId}
                              ├── nitrogen: number (mg/kg)
                              ├── phosphorus: number (mg/kg)
                              ├── potassium: number (mg/kg)
                              ├── temperature: number (°C) [coming soon]
                              ├── humidity: number (%) [coming soon]
                              ├── waterLevel: number (cm) [coming soon]
                              ├── timestamp: Date
                              └── createdAt: string (ISO)
```

## Usage

### Logging Sensor Readings

```typescript
// From Firebase RTDB device readings
await logSensorReading(user.uid, fieldId, paddyId, {
  nitrogen: 45.2,
  phosphorus: 12.8,
  potassium: 38.5
});
```

### Viewing Historical Data

The Statistics tab automatically fetches and displays historical logs based on selected time range:
- **7 Days** - Last week of readings
- **30 Days** - Last month of readings
- **90 Days** - Last 3 months of readings
- **All Time** - Complete history since planting

## Integration Points

### 1. Automatic Logging (TODO)
When device readings are received from Firebase RTDB, automatically log them:

```typescript
// In device reading listener
realtimeDb.ref(`devices/${deviceId}/readings`).on('value', (snapshot) => {
  const readings = snapshot.val();
  
  // Log to Firestore for history
  await logSensorReading(user.uid, fieldId, paddyId, {
    nitrogen: readings.N,
    phosphorus: readings.P,
    potassium: readings.K
  });
});
```

### 2. Manual Logging
For testing or manual data entry, use the `logSensorReading()` function directly.

### 3. Data Retrieval
The Statistics tab fetches logs with:
- Time-based filtering (last 7/30/90 days or all time)
- Automatic aggregation across all paddies
- Loading states and error handling

## Firestore Security Rules

Logs are protected by user authentication:

```
match /paddies/{paddyId} {
  match /logs/{logId} {
    allow read, write: if isOwner(userId);
  }
}
```

## Testing

### Manual Test Logging

You can test the logging system using the browser console on the field detail page:

```javascript
// Get current user ID and field ID from page
const userId = 'your-user-id';
const fieldId = 'your-field-id';
const paddyId = 'your-paddy-id';

// Create a test log (call logSensorReading from console)
// Note: logSensorReading is not exported, so use this approach:

// Open Firebase console and add manually, or
// Add a test button in development mode
```

### Automated Logging Schedule

For production, implement periodic logging (recommended intervals):
- **NPK readings**: Every 24 hours (soil nutrients change slowly)
- **Temperature/Humidity**: Every 30 minutes (environmental monitoring)
- **Water Level**: Every hour (irrigation management)

## Visualization (Coming Soon)

The Data Trends section will display:
- Line charts showing NPK levels over time
- Average values with min/max ranges
- Comparison across multiple paddies
- Growth stage correlation
- Recommendations based on trends

## Database Costs

Firestore pricing considerations:
- Each log entry = 1 write operation
- Historical queries = reads based on time range
- Recommended: Implement batching for high-frequency sensors
- Consider using Firebase RTDB for real-time data, Firestore for historical logs

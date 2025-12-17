# Firebase Realtime Database Structure for PadBuddy Devices

## Overview
This document defines the expected RTDB structure for IoT devices (Arduino/ESP32 sensors) that connect to PadBuddy.

## RTDB Path Structure

```
devices/
  DEVICE_0001/
    heartbeat: 1734393600000           # Unix timestamp (ms) - updated every 60s by device
    sensors/
      nitrogen: 45.2                   # Nitrogen level in mg/kg
      phosphorus: 12.8                 # Phosphorus level in mg/kg
      potassium: 38.5                  # Potassium level in mg/kg
      temperature: 28.5                # Temperature in °C (optional)
      humidity: 75.3                   # Humidity in % (optional)
      waterLevel: 15.2                 # Water level in cm (optional)
      lastUpdate: 1734393600000        # Timestamp of sensor reading
    location/
      latitude: 14.5995                # GPS latitude
      longitude: 120.9842              # GPS longitude
      timestamp: 1734393600000         # When GPS was last updated
    metadata/
      deviceType: "NPK-SENSOR-V1"      # Device model/type
      firmwareVersion: "1.0.2"         # Firmware version
      batteryLevel: 85                 # Battery percentage (optional)
```

## Device Heartbeat

**Purpose:** Determine if device is online/offline

**Update Frequency:** Every 60 seconds

**Implementation (Arduino/ESP32):**
```cpp
// Send heartbeat every 60 seconds
unsigned long lastHeartbeat = 0;
const long heartbeatInterval = 60000; // 60 seconds

void sendHeartbeat() {
  unsigned long currentTime = millis();
  if (currentTime - lastHeartbeat >= heartbeatInterval) {
    Firebase.setInt(firebaseData, "/devices/DEVICE_0001/heartbeat", getCurrentTimestamp());
    lastHeartbeat = currentTime;
  }
}
```

**Status Logic:**
- **Offline**: No heartbeat for > 5 minutes
- **Online**: Heartbeat within last 5 minutes

## Sensor Readings

### NPK Sensors (Primary)

**Required Fields:**
- `nitrogen` (number, mg/kg)
- `phosphorus` (number, mg/kg)
- `potassium` (number, mg/kg)
- `lastUpdate` (timestamp, ms)

**Update Frequency:** Every 5-10 minutes (configurable)

**Implementation:**
```cpp
void updateSensorReadings() {
  float n = readNitrogenSensor();
  float p = readPhosphorusSensor();
  float k = readPotassiumSensor();
  
  Firebase.setFloat(firebaseData, "/devices/DEVICE_0001/sensors/nitrogen", n);
  Firebase.setFloat(firebaseData, "/devices/DEVICE_0001/sensors/phosphorus", p);
  Firebase.setFloat(firebaseData, "/devices/DEVICE_0001/sensors/potassium", k);
  Firebase.setInt(firebaseData, "/devices/DEVICE_0001/sensors/lastUpdate", getCurrentTimestamp());
}
```

### Environmental Sensors (Optional)

**Fields:**
- `temperature` (number, °C)
- `humidity` (number, %)
- `waterLevel` (number, cm)

**Update Frequency:** Every 10-30 minutes

## GPS Location

**Purpose:** Track device physical location for field mapping

**Update Frequency:** 
- On startup: Immediately
- During operation: Every 6-12 hours (GPS module is power-intensive)

**Implementation:**
```cpp
void updateLocation() {
  if (gps.location.isValid()) {
    float lat = gps.location.lat();
    float lng = gps.location.lng();
    
    Firebase.setFloat(firebaseData, "/devices/DEVICE_0001/location/latitude", lat);
    Firebase.setFloat(firebaseData, "/devices/DEVICE_0001/location/longitude", lng);
    Firebase.setInt(firebaseData, "/devices/DEVICE_0001/location/timestamp", getCurrentTimestamp());
  }
}
```

## Security Rules (RTDB)

```json
{
  "rules": {
    "devices": {
      "$deviceId": {
        ".read": "auth != null",
        ".write": "auth != null || root.child('devices/' + $deviceId + '/apiKey').val() == auth.token.apiKey"
      }
    }
  }
}
```

## Device Registration Flow

1. **Hardware:** Device powers on, connects to WiFi
2. **Verification:** Device verifies connection by reading `/devices/{DEVICE_ID}/registered`
3. **Initialization:** Device sets initial heartbeat and metadata
4. **App:** User adds device via PadBuddy app (verifies device exists)
5. **Connection:** Device begins sending regular heartbeat and sensor data

## Data Flow

### Device → Firebase RTDB (Hardware writes)
- Heartbeat every 60s
- Sensor readings every 5-10 min
- GPS location every 6-12 hours

### RTDB → PadBuddy App (App reads)
- Status checks: Real-time (every page load)
- Sensor readings: On-demand when viewing device/field
- Auto-logging: Reads sensor data and logs to Firestore hourly for history

### Firestore Logs (App writes)
- Historical sensor readings stored in Firestore
- Path: `users/{userId}/fields/{fieldId}/paddies/{paddyId}/logs/{logId}`
- Enables trend analysis and long-term tracking

## Testing Device Data

Use Firebase Console or this script to populate test data:

```javascript
// Set via Firebase Console > Realtime Database
{
  "devices": {
    "DEVICE_0001": {
      "heartbeat": 1734393600000,
      "sensors": {
        "nitrogen": 45.2,
        "phosphorus": 12.8,
        "potassium": 38.5,
        "lastUpdate": 1734393600000
      },
      "location": {
        "latitude": 14.5995,
        "longitude": 120.9842,
        "timestamp": 1734393600000
      },
      "metadata": {
        "deviceType": "NPK-SENSOR-V1",
        "firmwareVersion": "1.0.0"
      }
    }
  }
}
```

## Critical Thresholds (for Notifications)

**NPK Levels (mg/kg):**
- Nitrogen: < 20 (critically low), > 80 (too high)
- Phosphorus: < 8 (critically low), > 40 (too high)
- Potassium: < 25 (critically low), > 100 (too high)

**Device Status:**
- Heartbeat missing > 5 min: Send offline notification
- Heartbeat returns: Send online notification
- Sensor readings missing > 1 hour: Sensor issue notification

## Hardware Requirements

**Minimum:**
- ESP32 or Arduino with WiFi
- NPK sensor (RS485/Modbus)
- Power supply (5V DC or battery with solar)

**Optional:**
- GPS module (NEO-6M or better)
- DHT22 (temperature/humidity)
- Ultrasonic sensor (water level)
- Battery monitoring circuit

## Power Management

Devices should implement sleep modes:
- **Active mode**: 30 seconds (read sensors, send data)
- **Sleep mode**: 5-10 minutes (deep sleep between readings)
- **GPS mode**: Only when necessary (power-intensive)

This extends battery life significantly for solar/battery-powered deployments.

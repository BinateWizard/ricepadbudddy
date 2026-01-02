# Quick Reference: Cloud Functions & Alert System

## 5 Minute Setup (After Initial Development)

### 1. Deploy Functions
```bash
cd functions && npm run build && npm run deploy
```

### 2. Initialize Firestore (Firebase Console)
Collection: `settings` → Document: `system`
```json
{
  "alertThresholds": {
    "nitrogen_min": 20, "nitrogen_max": 50,
    "phosphorus_min": 10, "phosphorus_max": 40,
    "potassium_min": 150, "potassium_max": 250
  },
  "features": { "offlineAlerting": true, "pushNotifications": true }
}
```

### 3. Apply Security Rules (Firebase Console)
Copy from `CLOUD_FUNCTIONS_IMPLEMENTATION.md`

### 4. Create Indexes (Firebase Console)
- Logs: `timestamp` DESC + `deviceId` ASC
- Alerts: `createdAt` DESC + `severity` ASC
- Commands: `deviceId` ASC + `requestedAt` DESC

### 5. Update Layout
```typescript
import { AlertProvider } from '@/context/AlertContext';

<AlertProvider>
  {children}
</AlertProvider>
```

### 6. Add Alerts to Header
```typescript
import { AlertBadge } from '@/components/AlertNotifications';

<AlertBadge />
```

---

## Cloud Functions at a Glance

| Function | Trigger | Frequency | Purpose |
|----------|---------|-----------|---------|
| `scheduledSensorLogger` | PubSub | Every 5 min | Read RTDB → Write Firestore |
| `realtimeAlertProcessor` | Firestore | On log create | Check thresholds → Create alerts |
| `deviceHealthMonitor` | PubSub | Every 2 min | Check heartbeat → Mark offline |
| `commandAuditLogger` | RTDB | On command write | Log to audit trail |
| `alertCleanupScheduler` | PubSub | Daily 2 AM | Delete old alerts |

---

## Firestore Collections

```
settings/
  system/                  # Read-only config
    alertThresholds
    features
    retention policies

fields/
  {fieldId}/
    paddies/
      {paddyId}/
        logs/              # Sensor history (created by scheduledSensorLogger)
        statistics/
    metadata

alerts/
  {fieldId}/
    alerts/                # Created by realtimeAlertProcessor
      type, severity, message, read, acknowledged

devices/
  {deviceId}/              # Created by deviceHealthMonitor
    status, lastHeartbeat

command_audit/
  {commandId}/             # Created by commandAuditLogger
    deviceId, action, status, timestamps
```

---

## RTDB Data Flow

```
devices/{deviceId}/
├─ heartbeat: timestamp           ← Device sends every 60s
├─ sensors/
│  ├─ nitrogen: number            ← Device sends every 5-10 min
│  ├─ phosphorus: number
│  ├─ potassium: number
│  └─ lastUpdate: timestamp
├─ commands/
│  └─ {nodeId}/
│     ├─ action: string           ← Web app writes command
│     ├─ ack: boolean             ← Device sets true when received
│     └─ status: "pending"|"done" ← Device updates on completion
└─ location/
   ├─ latitude, longitude
   └─ timestamp
```

---

## Alert Types & Severity

| Type | Trigger | Severity | Action |
|------|---------|----------|--------|
| `npk_low` | N/P/K below min | critical | Add fertilizer |
| `npk_high` | N/P/K above max | warning | Reduce application |
| `device_offline` | No heartbeat 10+ min | critical | Check device |
| `water_level` | Level critical | critical | Check irrigation |
| `anomaly` | Unusual pattern | warning | Review data |

---

## Using Alert Context in Components

```typescript
import { useAlerts } from '@/context/AlertContext';

export function MyComponent() {
  const { 
    alerts,              // All alerts
    unreadCount,         // Number of unread
    criticalCount,       // Number of critical
    isLoading,
    error,
    markAsRead,          // Function
    acknowledge,         // Function
    getAlertsByField,    // Function
    getAlertsByPaddy,    // Function
  } = useAlerts();

  return (
    <>
      <AlertBadge />
      <AlertPanel fieldId={fieldId} />
      <AlertBanner />
      <AlertStats />
    </>
  );
}
```

---

## Common Tasks

### Change Alert Thresholds
1. Open `settings/system` in Firestore
2. Update `alertThresholds`
3. Thresholds apply to next sensor reading

### Acknowledge Critical Alert
```typescript
const { acknowledge } = useAlerts();
await acknowledge(alertId, fieldId);
```

### Get Recent Alerts
```typescript
import { getRecentAlerts } from '@/lib/utils/alertUtils';
const alerts = await getRecentAlerts(fieldId, 20);
```

### Get Critical Alerts
```typescript
import { getCriticalAlerts } from '@/lib/utils/alertUtils';
const critical = await getCriticalAlerts(fieldId);
```

### Get Device Alerts
```typescript
import { getDeviceAlerts } from '@/lib/utils/alertUtils';
const deviceAlerts = await getDeviceAlerts(fieldId, deviceId);
```

---

## Monitoring

### View Cloud Function Logs
```bash
npm run logs
```

Or Firebase Console > Cloud Functions > Click function > Logs

### Check Function Status
Firebase Console > Cloud Functions > See green checkmarks

### Monitor Costs
Firebase Console > Billing > Usage

---

## Testing Checklist

- [ ] Deploy functions: `npm run deploy`
- [ ] Check settings/system created in Firestore
- [ ] Verify security rules applied
- [ ] Confirm all indexes created
- [ ] Test sensor reading logged to Firestore
- [ ] Test alert created when reading out of range
- [ ] Test device offline alert after 10 min no heartbeat
- [ ] Test command audit logged
- [ ] Test AlertProvider in layout
- [ ] Test AlertBadge shows count
- [ ] Test AlertPanel displays alerts
- [ ] Test mark as read functionality
- [ ] Test acknowledge functionality

---

## Emergency: Disable Function

If a function is causing problems:

```bash
firebase functions:delete functionName --region=asia-southeast1
```

For example:
```bash
firebase functions:delete realtimeAlertProcessor
```

Then fix and redeploy:
```bash
npm run deploy
```

---

## Key Files

- `functions/src/index.ts` - All cloud functions
- `context/AlertContext.tsx` - Alert state management
- `components/AlertNotifications.tsx` - UI components
- `lib/utils/alertUtils.ts` - Helper functions
- `CLOUD_FUNCTIONS_IMPLEMENTATION.md` - Full guide
- `BACKEND_ARCHITECTURE.md` - System design

---

## Support

- Cloud Functions docs: https://firebase.google.com/docs/functions
- Firestore docs: https://firebase.google.com/docs/firestore
- React Context: https://react.dev/reference/react/useContext
- Firebase Rules: https://firebase.google.com/docs/rules

You now have a **production-ready alert system!** 🎉

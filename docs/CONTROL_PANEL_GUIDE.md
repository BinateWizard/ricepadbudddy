# Control Panel - Simplified Design

## Overview

The control panel provides **quick, focused actions** for controlling field devices:
- **Primary Action**: SCAN NPK (orchestrates motor extend → NPK scan → motor retract)
- **Motor Controls**: Manual extend/stop/retract (predefined 5-second durations)
- **Relay Controls**: Toggle 2 relay channels on/off

## Quick Scan Action

The **SCAN NPK** button is the primary action and orchestrates a complete workflow:

```
1. Extend motor (5s) ↓
   ↓ Wait 1.5s ↓
2. Scan NPK sensor (10s)
   ↓ Wait 11s ↓
3. Retract motor (5s)
   
Total: ~20 seconds
```

**Usage:**
- Click "📊 SCAN NPK" button
- System automatically handles all 3 steps
- Latest NPK readings appear below the button

**Result:**
- Motor extends into soil
- NPK sensor takes reading
- Motor retracts to original position
- Results shown in N-P-K display

---

## Motor Controls

**Simple button controls** with fixed 5-second durations:

- **⬇️ Extend** - Push motor down 5 seconds
- **⏹️ Stop** - Stop motor immediately
- **⬆️ Retract** - Pull motor up 5 seconds

No custom durations (simplified design).

---

## Relay Controls

**Toggle switches** for 2 independent relay channels:

1. Click **ON/OFF** buttons to toggle relay state
2. Click **Apply** to send configuration to device

Example use cases:
- Relay 1: Irrigation pump
- Relay 2: Valve control

---

## Device Status

Shows online/offline status for each ESP32 node:
- 🟢 **Online** - Node is connected and responding
- 🔴 **Offline** - Node not responding

---

## Implementation Notes

### SCAN NPK Workflow Code

```typescript
const handleScanNPK = async () => {
  setIsLoading(true);
  setActiveAction('scan-npk');
  
  try {
    // 1. Extend motor (5 seconds)
    await sendCommand('ESP32B', 'motor', 'extend', {
      direction: 'extend',
      duration: 5000
    });
    await sleep(1500); // Wait for motor to extend

    // 2. Scan NPK (10 seconds)
    await sendCommand('ESP32C', 'npk', 'scan', {
      duration: 10000
    });
    await sleep(11000); // Wait for scan to complete

    // 3. Retract motor (5 seconds)
    await sendCommand('ESP32B', 'motor', 'retract', {
      direction: 'retract',
      duration: 5000
    });

    onUpdate();
    alert('✓ NPK scan complete');
  } finally {
    setIsLoading(false);
    setActiveAction(null);
  }
};
```

### Design Principles

✅ **Simplicity** - Only essential actions shown  
✅ **Single Primary Flow** - SCAN NPK is main use case  
✅ **Safe Defaults** - Fixed durations prevent misconfiguration  
✅ **Visual Feedback** - Loading state during scanning  
✅ **Quick Access** - All controls on one panel  

---

## Future Enhancement

Device-specific control panel (for advanced commands) will be added later at:
```
/device/[id]/controls
```

For now, all field device control is unified on the field page.

# Field Boundary Mapping Feature

## Overview
Users can now map the physical boundaries of their rice fields directly in the app. This feature allows for better visualization and automatic area calculation.

## Data Structure

### Boundary Data Format
Boundaries are stored directly in the field document under the `boundary` field:

```typescript
{
  boundary: {
    coordinates: [
      { lat: 14.5995, lng: 120.9842 },
      { lat: 14.5996, lng: 120.9843 },
      { lat: 14.5997, lng: 120.9844 },
      // ... more points
    ],
    area: 50000, // in square meters
    updatedAt: "2025-12-30T10:00:00.000Z"
  }
}
```

### Firestore Path
```
users/{userId}/fields/{fieldId}
  └── boundary: {
        coordinates: Array<{lat: number, lng: number}>,
        area: number (square meters),
        updatedAt: string (ISO timestamp)
      }
```

## Features Implemented

### 1. Map Boundary Modal
- Interactive map interface for drawing field boundaries
- Start/Stop drawing mode
- Add points by clicking on the map
- Undo last point
- Clear all points
- Real-time area calculation

### 2. Area Calculation
- Automatic calculation using the Shoelace formula
- Displays area in hectares (1 hectare = 10,000 m²)
- Updates in real-time as points are added

### 3. Boundary Management
- **Create**: Draw new boundary if none exists
- **Edit**: Modify existing boundary
- **Remove**: Delete boundary data
- **View**: Display current boundary information

### 4. User Interface
Located in the **Information Tab** of each field:
- Shows boundary status and area
- "Map Field Area" button to open mapping interface
- "Edit Boundary" button if boundary exists
- "Remove Boundary" button to delete

## Security Rules

The existing Firestore security rules already cover boundary data since it's stored in the field document:

```javascript
match /users/{userId}/fields/{fieldId} {
  allow read: if request.auth != null && (request.auth.uid == userId || isAdmin());
  allow write: if request.auth != null && request.auth.uid == userId;
}
```

## Usage Flow

1. Navigate to field → Information tab
2. Click "Map Field Area"
3. Click "Start Drawing"
4. Click on map to add boundary points (minimum 3 points)
5. Click "Stop Drawing" when complete
6. Review calculated area
7. Click "Save Boundary" to store

## Technical Notes

### Area Calculation
- Uses Shoelace formula for polygon area
- Converts lat/lng to approximate meters
- Formula accounts for Earth's curvature (spherical model)
- Accurate for small to medium-sized fields

### Map Integration
- Uses Google Maps embedded iframe
- Centers on user's location if geolocation is available
- Falls back to Philippines center (14.5995, 120.9842)
- Zoom level: 18 (detailed view)

### Limitations
- Map interface is for approximate visualization
- For precise measurements, GPS devices should be used in the field
- Manual coordinate entry possible via the coordinates display

## Future Enhancements

Potential improvements for later:
1. **Interactive Drawing**: Full Google Maps API integration for click-to-draw polygons
2. **GPS Import**: Import boundary coordinates from GPS devices
3. **Polygon Editing**: Drag points to adjust boundaries
4. **Multiple Boundaries**: Support for fields with multiple non-contiguous areas
5. **Boundary Visualization**: Display boundaries on device location maps
6. **Area-based Recommendations**: Use field area for fertilizer/seed calculations
7. **Export**: Export boundary coordinates as KML/GeoJSON

## Data Migration

No migration needed - boundary field is optional. Existing fields without boundaries continue to work normally.

## Testing Checklist

- [ ] Create new boundary
- [ ] Edit existing boundary
- [ ] Remove boundary
- [ ] Area calculation accuracy
- [ ] Geolocation centering
- [ ] Undo/Clear operations
- [ ] Save with minimum 3 points
- [ ] Validation error messages
- [ ] Modal open/close
- [ ] Display boundary info on Information tab

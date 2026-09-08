# Frontend Integration Guide: Menu Item → Kitchen Station Assignment

## Overview

This guide is for the **frontend team** to implement Kitchen Station assignment for Menu Items.

**Backend Status:** ✅ Complete and ready to use  
**Frontend Status:** ⏳ To be implemented

---

## What This Feature Does

Allows admins/managers to assign a Kitchen Station to each Menu Item so the KDS knows where to send orders.

**Example:**
- Cheeseburger → MAIN station
- French Fries → MAIN station
- Caesar Salad → SALAD station
- Mojito → BAR station
- Coke → No station (bottled, no prep needed)

---

## Backend APIs Available

### 1. Get All Kitchen Stations

**Endpoint:**
```http
GET /api/v1/kitchen/stations
Authorization: Bearer <token>
```

**Response:**
```json
{
  "status": "success",
  "results": 3,
  "data": {
    "stations": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "code": "MAIN",
        "name": "Main Kitchen",
        "description": "Main kitchen preparation area",
        "isActive": true,
        "displayOrder": 1
      },
      {
        "_id": "507f1f77bcf86cd799439012",
        "code": "SALAD",
        "name": "Salad Station",
        "isActive": true,
        "displayOrder": 2
      },
      {
        "_id": "507f1f77bcf86cd799439013",
        "code": "BAR",
        "name": "Bar Station",
        "isActive": true,
        "displayOrder": 3
      }
    ]
  }
}
```

**Query Parameters:**
- `includeInactive=true` - Include inactive stations (default: false)

**Use:** Load this once when the menu page loads to populate station dropdowns.

---

### 2. Assign Station to Menu Item

**Endpoint:**
```http
PATCH /api/v1/kitchen/menu-items/:menuItemId/station
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body (Assign):**
```json
{
  "stationId": "507f1f77bcf86cd799439011"
}
```

**Request Body (Remove):**
```json
{
  "stationId": null
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "message": "Kitchen station assigned to menu item",
    "menuItem": {
      "_id": "65abc001",
      "name": "Cheeseburger",
      "kitchenStation": {
        "_id": "507f1f77bcf86cd799439011",
        "code": "MAIN",
        "name": "Main Kitchen"
      }
    }
  }
}
```

**Error Responses:**

**404 - Menu Item Not Found:**
```json
{
  "status": "fail",
  "message": "Menu item not found"
}
```

**404 - Station Not Found / Wrong Branch:**
```json
{
  "status": "fail",
  "message": "Kitchen station not found or does not belong to your branch"
}
```

**400 - Inactive Station:**
```json
{
  "status": "fail",
  "message": "Cannot assign an inactive station to a menu item"
}
```

---

### 3. Get Menu Items (Existing Endpoint)

Your existing menu endpoint should already populate `kitchenStation`:

**Endpoint:**
```http
GET /api/v1/menu
```

**Response (with station):**
```json
{
  "status": "success",
  "data": {
    "menu": [
      {
        "_id": "65abc001",
        "name": "Cheeseburger",
        "price": 10.99,
        "category": "main-course",
        "kitchenStation": {
          "_id": "507f1f77bcf86cd799439011",
          "code": "MAIN",
          "name": "Main Kitchen"
        }
      }
    ]
  }
}
```

**Response (without station):**
```json
{
  "_id": "65abc002",
  "name": "Coke",
  "price": 2.99,
  "category": "drinks",
  "kitchenStation": null
}
```

---

## Frontend Implementation Guide

### Architecture

```
MenuItemsPage
  ├─ MenuItemsTable
  │   ├─ MenuItemRow
  │   │   ├─ ...other columns...
  │   │   └─ StationSelector ← NEW COMPONENT
  │   └─ ...
  └─ ...
```

---

### Component: StationSelector

**Location:** `src/components/StationSelector.jsx` (or your component structure)

**Props:**
```javascript
{
  menuItem: {
    _id: string,
    name: string,
    kitchenStation: {
      _id: string,
      code: string,
      name: string
    } | null
  },
  stations: Array<{
    _id: string,
    code: string,
    name: string,
    isActive: boolean
  }>,
  onUpdate?: (menuItemId, stationId) => void
}
```

**Example Implementation (Plain React):**

```javascript
import React, { useState } from 'react';

export const StationSelector = ({ menuItem, stations, onUpdate }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = async (e) => {
    const stationId = e.target.value === 'null' ? null : e.target.value;
    
    setIsUpdating(true);
    setError(null);

    try {
      // Call your API client
      const response = await apiClient.patch(
        `/api/v1/kitchen/menu-items/${menuItem._id}/station`,
        { stationId }
      );

      // Show success notification
      toast.success('Station assigned successfully');

      // Callback to parent (optional)
      if (onUpdate) {
        onUpdate(menuItem._id, stationId);
      }

      // Refresh menu items list
      // (or use React Query invalidation)
      
    } catch (err) {
      setError(err.message);
      toast.error(err.message || 'Failed to assign station');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="station-selector">
      <select
        value={menuItem.kitchenStation?._id || 'null'}
        onChange={handleChange}
        disabled={isUpdating}
        className={error ? 'error' : ''}
      >
        <option value="null">No Station</option>
        {stations.map(station => (
          <option key={station._id} value={station._id}>
            {station.name}
          </option>
        ))}
      </select>
      
      {isUpdating && <span className="loading">Updating...</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
};
```

---

### React Query Implementation

**1. Query Hook: Load Stations**

```javascript
// src/hooks/useKitchenStations.js
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

export const useKitchenStations = () => {
  return useQuery({
    queryKey: ['kitchen-stations'],
    queryFn: async () => {
      const response = await apiClient.get('/api/v1/kitchen/stations');
      return response.data.data.stations;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes (stations don't change often)
  });
};
```

**2. Mutation Hook: Assign Station**

```javascript
// src/hooks/useAssignMenuItemStation.js
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { toast } from '../utils/toast'; // Your toast system

export const useAssignMenuItemStation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ menuItemId, stationId }) => {
      const response = await apiClient.patch(
        `/api/v1/kitchen/menu-items/${menuItemId}/station`,
        { stationId }
      );
      return response.data;
    },
    onSuccess: (data, variables) => {
      // Invalidate menu items query to refresh
      queryClient.invalidateQueries(['menu-items']);
      
      // Show success message
      toast.success('Station assigned successfully');
    },
    onError: (error) => {
      // Show error message
      toast.error(error.response?.data?.message || 'Failed to assign station');
    },
  });
};
```

**3. Component with React Query**

```javascript
// src/components/StationSelector.jsx
import React from 'react';
import { useAssignMenuItemStation } from '../hooks/useAssignMenuItemStation';

export const StationSelector = ({ menuItem, stations }) => {
  const { mutate, isPending, error } = useAssignMenuItemStation();

  const handleChange = (e) => {
    const stationId = e.target.value === 'null' ? null : e.target.value;
    
    mutate({
      menuItemId: menuItem._id,
      stationId,
    });
  };

  return (
    <div className="station-selector">
      <select
        value={menuItem.kitchenStation?._id || 'null'}
        onChange={handleChange}
        disabled={isPending}
      >
        <option value="null">No Station</option>
        {stations.map(station => (
          <option key={station._id} value={station._id}>
            {station.name}
          </option>
        ))}
      </select>
      
      {isPending && <span className="spinner">⏳</span>}
    </div>
  );
};
```

**4. Integration in Menu Page**

```javascript
// src/pages/MenuItems.jsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useKitchenStations } from '../hooks/useKitchenStations';
import { StationSelector } from '../components/StationSelector';

export const MenuItemsPage = () => {
  // Load menu items (your existing query)
  const { data: menuItems, isLoading: menuLoading } = useQuery({
    queryKey: ['menu-items'],
    queryFn: fetchMenuItems,
  });

  // Load kitchen stations
  const { data: stations, isLoading: stationsLoading } = useKitchenStations();

  if (menuLoading || stationsLoading) {
    return <Loading />;
  }

  return (
    <div className="menu-items-page">
      <h1>Menu Items</h1>
      
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Price</th>
            <th>Category</th>
            <th>Kitchen Station</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {menuItems.map(item => (
            <tr key={item._id}>
              <td>{item.name}</td>
              <td>${item.price}</td>
              <td>{item.category}</td>
              <td>
                <StationSelector 
                  menuItem={item} 
                  stations={stations} 
                />
              </td>
              <td>
                <button onClick={() => editItem(item)}>Edit</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

---

## Permissions/RBAC

**Backend Task:** `kitchen.menuItems.assignStation`

**Frontend Implementation:**

```javascript
// Example: Hide selector if user doesn't have permission
import { usePermissions } from '../hooks/usePermissions';

export const StationSelector = ({ menuItem, stations }) => {
  const { hasPermission } = usePermissions();
  
  // Check if user can assign stations
  const canAssign = hasPermission('kitchen.menuItems.assignStation');

  if (!canAssign) {
    // Show read-only station name
    return (
      <span>
        {menuItem.kitchenStation?.name || 'No Station'}
      </span>
    );
  }

  // Show editable dropdown
  return (
    <select ...>
      ...
    </select>
  );
};
```

---

## Edge Cases to Handle

### 1. Menu Item Has No Station
```javascript
menuItem.kitchenStation === null
```
**Display:** "No Station" option selected

### 2. Station is Inactive
```javascript
station.isActive === false
```
**Action:** Do NOT show in dropdown for new assignments. If already assigned, show but disable changing to another inactive station.

### 3. Network Error
```javascript
try {
  await assignStation();
} catch (error) {
  if (error.code === 'NETWORK_ERROR') {
    toast.error('Network error. Please check your connection.');
  }
}
```

### 4. Unauthorized (403)
```javascript
if (error.status === 403) {
  toast.error('You do not have permission to assign stations');
}
```

### 5. Multiple Rapid Changes
**Use debounce or disable dropdown while updating:**
```javascript
<select
  disabled={isPending}
  onChange={handleChange}
>
```

---

## Testing Checklist

### Manual Testing

- [ ] Load menu items page - stations dropdown appears
- [ ] Select a station - saves successfully
- [ ] Select "No Station" - removes assignment
- [ ] Change station - updates correctly
- [ ] Try without permission - dropdown hidden or disabled
- [ ] Network failure - shows error message
- [ ] Invalid station ID - shows error from backend
- [ ] Inactive station - not in dropdown

### Integration Testing

```javascript
describe('StationSelector', () => {
  it('should display current station', () => {
    const menuItem = {
      _id: '123',
      name: 'Burger',
      kitchenStation: {
        _id: 'station-1',
        name: 'Main Kitchen'
      }
    };
    
    render(<StationSelector menuItem={menuItem} stations={stations} />);
    
    expect(screen.getByDisplayValue('Main Kitchen')).toBeInTheDocument();
  });

  it('should call API when station changed', async () => {
    const menuItem = { _id: '123', kitchenStation: null };
    
    render(<StationSelector menuItem={menuItem} stations={stations} />);
    
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'station-1' } });
    
    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/api/v1/kitchen/menu-items/123/station',
        { stationId: 'station-1' }
      );
    });
  });
});
```

---

## UX States

### Initial State
```
Kitchen Station: [ Main Kitchen ▼ ]
```

### Loading State
```
Kitchen Station: [ Main Kitchen ▼ ] ⏳ Updating...
```

### Success State
```
Kitchen Station: [ Main Kitchen ▼ ] ✓
(Flash green, then remove checkmark after 2 seconds)
```

### Error State
```
Kitchen Station: [ Main Kitchen ▼ ] ❌
Error: Station not found
```

---

## Complete Flow Example

### 1. Admin Opens Menu Page
```
GET /api/v1/menu
GET /api/v1/kitchen/stations
```

### 2. Admin Sees Table
```
Name            Price   Kitchen Station
Cheeseburger    $10     [ Main Kitchen ▼ ]
French Fries    $4      [ Main Kitchen ▼ ]
Coke            $2      [ No Station ▼ ]
```

### 3. Admin Changes Coke to Bar
```
PATCH /api/v1/kitchen/menu-items/COKE_ID/station
{ "stationId": "BAR_STATION_ID" }

Response: 200 OK
```

### 4. UI Updates
```
Coke            $2      [ Bar Station ▼ ] ✓
```

### 5. Backend Impact (Automatic)
```
Next time customer orders Coke:
→ Order transitions to "preparing"
→ Backend creates KitchenTicket for BAR station
→ Bartender sees ticket on BAR screen
```

---

## API Error Codes Reference

| Status | Message | Action |
|--------|---------|--------|
| 200 | Success | Show success toast |
| 400 | Invalid station / Inactive station | Show error, restore previous selection |
| 401 | Unauthorized | Redirect to login |
| 403 | Insufficient permissions | Show error, hide selector |
| 404 | Menu item not found | Show error |
| 404 | Station not found | Show error, restore previous |
| 500 | Server error | Show error, allow retry |

---

## FAQ

### Q: Do I need to create KitchenTickets from the frontend?
**A:** No! The backend automatically creates tickets when orders transition to "preparing".

### Q: Can a menu item have multiple stations?
**A:** No, one station per menu item. The backend groups order items by their station.

### Q: What if I assign a station and then deactivate it?
**A:** Menu items keep their assignment. The backend still creates tickets. Before deactivating, reassign menu items.

### Q: Can customers see which station their food is at?
**A:** Not directly. This is internal kitchen configuration. Customers just see their order status.

### Q: How do I test without a real kitchen?
**A:** 
1. Create test menu items
2. Assign them to MAIN station
3. Create a test order
4. Transition order to "preparing"
5. Check KDS screen (or backend logs) for created tickets

---

## Support

### Backend API Documentation
- Complete Guide: `KDS-COMPLETE-GUIDE.md`
- Quick Start: `KDS-MENU-STATION-QUICK-START.md`
- Integration Details: `KDS-MENU-STATION-INTEGRATION-COMPLETE.md`

### Questions?
Contact the backend team with:
- API endpoint issues
- Validation errors
- Permission problems
- Data structure questions

---

## Summary

**What You Need to Build:**
1. ✅ StationSelector component
2. ✅ React Query hooks (useKitchenStations, useAssignMenuItemStation)
3. ✅ Integration into existing Menu Items page
4. ✅ Permission checks
5. ✅ Loading/error/success states

**What Backend Provides:**
- ✅ GET /api/v1/kitchen/stations
- ✅ PATCH /api/v1/kitchen/menu-items/:id/station
- ✅ Validation
- ✅ Automatic ticket creation
- ✅ RBAC permissions

**Result:**
Admin assigns stations → Backend creates tickets automatically → Kitchen sees orders on correct screens 🎉

# Kitchen Station Management API

## Overview

Complete CRUD API for managing kitchen stations. Admins can create, update, and manage stations that determine how orders are distributed to different kitchen areas.

---

## Table of Contents

1. [Endpoints Summary](#endpoints-summary)
2. [Detailed API Reference](#detailed-api-reference)
3. [Request/Response Examples](#requestresponse-examples)
4. [Validation Rules](#validation-rules)
5. [Error Handling](#error-handling)
6. [Frontend Integration](#frontend-integration)

---

## Endpoints Summary

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| **GET** | `/api/v1/kitchen/stations` | kitchen, waiter, admin, superAdmin | List all stations |
| **GET** | `/api/v1/kitchen/stations/:id` | kitchen, waiter, admin, superAdmin | Get single station |
| **POST** | `/api/v1/kitchen/stations` | admin, superAdmin | Create new station |
| **PATCH** | `/api/v1/kitchen/stations/:id` | admin, superAdmin | Update station |
| **DELETE** | `/api/v1/kitchen/stations/:id` | admin, superAdmin | Delete station |

**Authentication:** All endpoints require JWT token in `Authorization: Bearer <token>` header

**Tenant Isolation:** All operations are scoped to the user's branch

---

## Detailed API Reference

### 1. List All Stations

**Purpose:** Get all kitchen stations for the current branch

```http
GET /api/v1/kitchen/stations
```

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `includeInactive` | boolean | No | false | Include disabled stations |

#### Response

```json
{
  "status": "success",
  "results": 5,
  "data": {
    "stations": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "merchant": "507f...",
        "branch": "507f...",
        "code": "GRILL",
        "name": "Grill Station",
        "description": "Hot food preparation area",
        "isActive": true,
        "displayOrder": 1,
        "createdAt": "2026-08-18T10:00:00.000Z",
        "updatedAt": "2026-08-18T10:00:00.000Z"
      },
      {
        "_id": "507f1f77bcf86cd799439012",
        "merchant": "507f...",
        "branch": "507f...",
        "code": "SALAD",
        "name": "Salad Station",
        "description": "Cold food preparation",
        "isActive": true,
        "displayOrder": 2,
        "createdAt": "2026-08-18T10:00:00.000Z",
        "updatedAt": "2026-08-18T10:00:00.000Z"
      }
    ]
  }
}
```

#### Use Cases

- Load stations on app initialization
- Populate station selector in admin UI
- Display available stations to kitchen staff

---

### 2. Get Single Station

**Purpose:** Get details of a specific kitchen station

```http
GET /api/v1/kitchen/stations/:id
```

#### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Station ObjectId **OR** station code (e.g., "GRILL", "507f...") |

#### Response

```json
{
  "status": "success",
  "data": {
    "station": {
      "_id": "507f1f77bcf86cd799439011",
      "merchant": "507f...",
      "branch": "507f...",
      "code": "GRILL",
      "name": "Grill Station",
      "description": "Hot food preparation area",
      "isActive": true,
      "displayOrder": 1,
      "createdAt": "2026-08-18T10:00:00.000Z",
      "updatedAt": "2026-08-18T10:00:00.000Z"
    }
  }
}
```

#### Error Responses

**404 Not Found:**
```json
{
  "status": "fail",
  "message": "Kitchen station not found"
}
```

---

### 3. Create Station

**Purpose:** Create a new kitchen station

```http
POST /api/v1/kitchen/stations
```

#### Request Body

```json
{
  "name": "Pizza Station",
  "code": "PIZZA",
  "description": "Pizza preparation and baking",
  "displayOrder": 5
}
```

#### Body Parameters

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `name` | string | ✅ Yes | 1-100 chars | Human-readable station name |
| `code` | string | ✅ Yes | 1-20 chars, uppercase | Unique identifier (e.g., "GRILL") |
| `description` | string | No | 0-500 chars | Station description |
| `displayOrder` | number | No | Integer | Sort order in UI (default: 0) |

#### Response

**201 Created:**
```json
{
  "status": "success",
  "data": {
    "station": {
      "_id": "507f1f77bcf86cd799439015",
      "merchant": "507f...",
      "branch": "507f...",
      "code": "PIZZA",
      "name": "Pizza Station",
      "description": "Pizza preparation and baking",
      "isActive": true,
      "displayOrder": 5,
      "createdAt": "2026-08-18T14:30:00.000Z",
      "updatedAt": "2026-08-18T14:30:00.000Z"
    }
  }
}
```

#### Error Responses

**400 Bad Request - Missing Fields:**
```json
{
  "status": "fail",
  "message": "Name and code are required"
}
```

**400 Bad Request - Duplicate Code:**
```json
{
  "status": "fail",
  "message": "Station code 'GRILL' already exists in this branch"
}
```

---

### 4. Update Station

**Purpose:** Update an existing kitchen station

```http
PATCH /api/v1/kitchen/stations/:id
```

#### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Station ObjectId |

#### Request Body

```json
{
  "name": "Updated Grill Station",
  "description": "Main hot food prep area",
  "displayOrder": 2,
  "isActive": false
}
```

#### Body Parameters (All Optional)

| Field | Type | Validation | Description |
|-------|------|------------|-------------|
| `name` | string | 1-100 chars | Update station name |
| `code` | string | 1-20 chars, uppercase | Update station code |
| `description` | string | 0-500 chars | Update description |
| `displayOrder` | number | Integer | Update sort order |
| `isActive` | boolean | true/false | Enable/disable station |

#### Response

**200 OK:**
```json
{
  "status": "success",
  "data": {
    "station": {
      "_id": "507f1f77bcf86cd799439011",
      "merchant": "507f...",
      "branch": "507f...",
      "code": "GRILL",
      "name": "Updated Grill Station",
      "description": "Main hot food prep area",
      "isActive": false,
      "displayOrder": 2,
      "createdAt": "2026-08-18T10:00:00.000Z",
      "updatedAt": "2026-08-18T14:45:00.000Z"
    }
  }
}
```

#### Error Responses

**404 Not Found:**
```json
{
  "status": "fail",
  "message": "Kitchen station not found"
}
```

**400 Bad Request - Duplicate Code:**
```json
{
  "status": "fail",
  "message": "Station code 'PIZZA' already exists in this branch"
}
```

---

### 5. Delete Station

**Purpose:** Delete (deactivate) a kitchen station

```http
DELETE /api/v1/kitchen/stations/:id
```

#### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Station ObjectId |

#### Behavior

- **Soft delete:** Station is marked as `isActive: false`
- **Data preserved:** Station record remains in database
- **Safety check:** Cannot delete if station has active tickets

#### Response

**200 OK:**
```json
{
  "status": "success",
  "data": {
    "message": "Station deactivated successfully",
    "station": {
      "_id": "507f1f77bcf86cd799439011",
      "code": "GRILL",
      "name": "Grill Station",
      "isActive": false,
      "updatedAt": "2026-08-18T15:00:00.000Z"
    }
  }
}
```

#### Error Responses

**404 Not Found:**
```json
{
  "status": "fail",
  "message": "Kitchen station not found"
}
```

**400 Bad Request - Active Tickets:**
```json
{
  "status": "fail",
  "message": "Cannot delete station with 5 active tickets. Complete or cancel them first."
}
```

---

## Request/Response Examples

### Example 1: Admin Creates New Station

**Scenario:** Restaurant adds a new dessert station

**Request:**
```bash
curl -X POST http://localhost:8000/api/v1/kitchen/stations \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dessert Station",
    "code": "DESSERT",
    "description": "Desserts and sweet items",
    "displayOrder": 10
  }'
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "station": {
      "_id": "507f1f77bcf86cd799439020",
      "merchant": "507f...",
      "branch": "507f...",
      "code": "DESSERT",
      "name": "Dessert Station",
      "description": "Desserts and sweet items",
      "isActive": true,
      "displayOrder": 10,
      "createdAt": "2026-08-18T15:30:00.000Z",
      "updatedAt": "2026-08-18T15:30:00.000Z"
    }
  }
}
```

---

### Example 2: Update Station Display Order

**Scenario:** Reorder stations in the UI

**Request:**
```bash
curl -X PATCH http://localhost:8000/api/v1/kitchen/stations/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "displayOrder": 1
  }'
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "station": {
      "_id": "507f1f77bcf86cd799439011",
      "code": "GRILL",
      "name": "Grill Station",
      "displayOrder": 1,
      "updatedAt": "2026-08-18T15:35:00.000Z"
    }
  }
}
```

---

### Example 3: Temporarily Disable Station

**Scenario:** Station equipment is broken, temporarily disable

**Request:**
```bash
curl -X PATCH http://localhost:8000/api/v1/kitchen/stations/507f1f77bcf86cd799439012 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "isActive": false
  }'
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "station": {
      "_id": "507f1f77bcf86cd799439012",
      "code": "SALAD",
      "name": "Salad Station",
      "isActive": false,
      "updatedAt": "2026-08-18T15:40:00.000Z"
    }
  }
}
```

**Note:** Menu items assigned to this station won't create tickets until it's re-enabled.

---

### Example 4: List All Stations (Including Inactive)

**Scenario:** Admin wants to see all stations for audit

**Request:**
```bash
curl -X GET "http://localhost:8000/api/v1/kitchen/stations?includeInactive=true" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response:**
```json
{
  "status": "success",
  "results": 6,
  "data": {
    "stations": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "code": "GRILL",
        "name": "Grill Station",
        "isActive": true,
        "displayOrder": 1
      },
      {
        "_id": "507f1f77bcf86cd799439012",
        "code": "SALAD",
        "name": "Salad Station",
        "isActive": false,
        "displayOrder": 2
      }
    ]
  }
}
```

---

## Validation Rules

### Station Code Rules

- **Format:** Uppercase letters only (auto-converted)
- **Length:** 1-20 characters
- **Uniqueness:** Must be unique per branch
- **Examples:** "GRILL", "SALAD", "FRY", "DESSERT", "BAR"
- **Invalid:** "grill station", "grill-1", "123", ""

### Station Name Rules

- **Format:** Any text
- **Length:** 1-100 characters
- **Examples:** "Grill Station", "Cold Prep Area", "主厨台"

### Display Order Rules

- **Type:** Integer
- **Default:** 0
- **Usage:** Lower numbers appear first in UI
- **Example:** Set GRILL=1, SALAD=2, FRY=3 for ordering

---

## Error Handling

### Common Error Codes

| Status Code | Scenario | Example |
|-------------|----------|---------|
| **400** | Missing required fields | "Name and code are required" |
| **400** | Duplicate station code | "Station code 'GRILL' already exists in this branch" |
| **400** | Cannot delete with active tickets | "Cannot delete station with 5 active tickets" |
| **401** | Missing/invalid auth token | "You are not logged in" |
| **403** | Insufficient permissions | "You do not have permission to perform this action" |
| **404** | Station not found | "Kitchen station not found" |

### Error Response Format

```json
{
  "status": "fail",
  "message": "Error description here"
}
```

---

## Frontend Integration

### Complete Station Management Component

```javascript
// StationManagement.jsx
import React, { useState, useEffect } from 'react';
import api from './api';

function StationManagement() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingStation, setEditingStation] = useState(null);

  // Load stations
  useEffect(() => {
    loadStations();
  }, []);

  const loadStations = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/v1/kitchen/stations');
      setStations(data.stations);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Create station
  const handleCreate = async (formData) => {
    setLoading(true);
    try {
      await api.post('/api/v1/kitchen/stations', formData);
      setShowForm(false);
      loadStations();
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Update station
  const handleUpdate = async (stationId, formData) => {
    setLoading(true);
    try {
      await api.patch(`/api/v1/kitchen/stations/${stationId}`, formData);
      setEditingStation(null);
      loadStations();
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete station
  const handleDelete = async (stationId) => {
    if (!confirm('Are you sure you want to deactivate this station?')) {
      return;
    }

    setLoading(true);
    try {
      await api.delete(`/api/v1/kitchen/stations/${stationId}`);
      loadStations();
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Toggle active status
  const handleToggleActive = async (station) => {
    setLoading(true);
    try {
      await api.patch(`/api/v1/kitchen/stations/${station._id}`, {
        isActive: !station.isActive
      });
      loadStations();
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="station-management">
      <div className="header">
        <h1>Kitchen Stations</h1>
        <button onClick={() => setShowForm(true)}>
          + Add Station
        </button>
      </div>

      {loading && <div className="loading">Loading...</div>}

      <div className="stations-list">
        {stations.map(station => (
          <StationCard
            key={station._id}
            station={station}
            onEdit={() => setEditingStation(station)}
            onDelete={() => handleDelete(station._id)}
            onToggleActive={() => handleToggleActive(station)}
          />
        ))}
      </div>

      {showForm && (
        <StationForm
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}

      {editingStation && (
        <StationForm
          station={editingStation}
          onSubmit={(data) => handleUpdate(editingStation._id, data)}
          onCancel={() => setEditingStation(null)}
        />
      )}
    </div>
  );
}

// Station Card Component
function StationCard({ station, onEdit, onDelete, onToggleActive }) {
  return (
    <div className={`station-card ${!station.isActive ? 'inactive' : ''}`}>
      <div className="station-info">
        <h3>{station.name}</h3>
        <span className="code">{station.code}</span>
        <p className="description">{station.description}</p>
        <span className="order">Display Order: {station.displayOrder}</span>
      </div>

      <div className="station-actions">
        <button onClick={onEdit}>✏️ Edit</button>
        <button onClick={onToggleActive}>
          {station.isActive ? '🔴 Disable' : '🟢 Enable'}
        </button>
        <button onClick={onDelete} className="danger">
          🗑️ Delete
        </button>
      </div>

      {!station.isActive && (
        <div className="inactive-badge">INACTIVE</div>
      )}
    </div>
  );
}

// Station Form Component
function StationForm({ station, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    name: station?.name || '',
    code: station?.code || '',
    description: station?.description || '',
    displayOrder: station?.displayOrder || 0,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>{station ? 'Edit Station' : 'New Station'}</h2>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Station Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              maxLength={100}
              placeholder="e.g., Grill Station"
            />
          </div>

          <div className="form-group">
            <label>Station Code *</label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ 
                ...formData, 
                code: e.target.value.toUpperCase() 
              })}
              required
              maxLength={20}
              placeholder="e.g., GRILL"
              disabled={!!station} // Can't change code after creation
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              maxLength={500}
              rows={3}
              placeholder="Optional description..."
            />
          </div>

          <div className="form-group">
            <label>Display Order</label>
            <input
              type="number"
              value={formData.displayOrder}
              onChange={(e) => setFormData({ 
                ...formData, 
                displayOrder: parseInt(e.target.value) || 0 
              })}
              placeholder="0"
            />
            <small>Lower numbers appear first</small>
          </div>

          <div className="form-actions">
            <button type="submit">
              {station ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default StationManagement;
```

---

## Use Cases

### 1. Restaurant Setup

**Scenario:** New restaurant sets up kitchen stations

**Steps:**
1. Admin logs in
2. Creates stations: GRILL, SALAD, FRY, BAR, DESSERT
3. Sets display order: 1, 2, 3, 4, 5
4. Assigns menu items to stations

---

### 2. Equipment Maintenance

**Scenario:** Grill is broken, needs repair

**Steps:**
1. Admin disables GRILL station
2. System stops sending tickets to GRILL
3. Menu items assigned to GRILL show "unavailable"
4. After repair, admin re-enables GRILL

---

### 3. Seasonal Station

**Scenario:** Add BBQ station for summer

**Steps:**
1. Admin creates BBQ station
2. Assigns seasonal items to BBQ
3. At end of season, admin deactivates BBQ
4. Station data preserved for next year

---

## Summary

**Key Features:**
- ✅ Full CRUD operations for kitchen stations
- ✅ Soft delete (deactivate instead of remove)
- ✅ Duplicate code prevention
- ✅ Active tickets safety check
- ✅ Branch-level tenant isolation
- ✅ Display order management

**Access Control:**
- **Read:** kitchen, waiter, admin, superAdmin
- **Write:** admin, superAdmin only

**Next Steps:**
1. Run seeder: `node scripts/seed-roles-and-tasks.js`
2. Restart server
3. Test with Postman/curl
4. Implement frontend UI
5. Assign menu items to stations

---

**Related Documentation:**
- `KDS-COMPLETE-GUIDE.md` - Complete KDS system overview
- `PHASE-1-FRONTEND-INTEGRATION-GUIDE.md` - Ticket operations API

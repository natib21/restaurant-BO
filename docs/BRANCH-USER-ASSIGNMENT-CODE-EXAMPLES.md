# Branch-User Assignment - Code Examples

Integration examples in multiple languages/frameworks.

---

## JavaScript / Node.js

### Using Fetch API

```javascript
// Branch User Assignment Client
class BranchUserAssignmentClient {
  constructor(baseURL, token) {
    this.baseURL = baseURL;
    this.token = token;
  }

  async assignBranchesToUser(userId, branchIds) {
    const response = await fetch(`${this.baseURL}/api/v1/users/${userId}/branches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        branchIds: Array.isArray(branchIds) ? branchIds : [branchIds]
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Assignment failed');
    }

    return response.json();
  }

  async removeBranchFromUser(userId, branchId) {
    const response = await fetch(`${this.baseURL}/api/v1/users/${userId}/branches/${branchId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Removal failed');
    }

    return response.json();
  }

  async getUserBranches(userId) {
    const response = await fetch(`${this.baseURL}/api/v1/users/${userId}/branches`, {
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Fetch failed');
    }

    return response.json();
  }
}

// Usage
const client = new BranchUserAssignmentClient('https://api.example.com', 'your-jwt-token');

// Assign multiple branches
const result = await client.assignBranchesToUser(
  '507f1f77bcf86cd799439010',
  ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']
);

if (result.data.user.refreshHint) {
  console.log('Token refresh required');
  // Handle token refresh
}
```

### Using Axios

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://api.example.com/api/v1',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

// Assign branches
async function assignBranches(userId, branchIds) {
  try {
    const { data } = await api.post(`/users/${userId}/branches`, {
      branchIds: Array.isArray(branchIds) ? branchIds : [branchIds]
    });
    
    return data;
  } catch (error) {
    console.error('Assignment failed:', error.response?.data?.message);
    throw error;
  }
}

// Remove branch
async function removeBranch(userId, branchId) {
  try {
    const { data } = await api.delete(`/users/${userId}/branches/${branchId}`);
    return data;
  } catch (error) {
    console.error('Removal failed:', error.response?.data?.message);
    throw error;
  }
}

// Get branches
async function getUserBranches(userId) {
  try {
    const { data } = await api.get(`/users/${userId}/branches`);
    return data;
  } catch (error) {
    console.error('Fetch failed:', error.response?.data?.message);
    throw error;
  }
}

// Usage with error handling
const userId = '507f1f77bcf86cd799439010';
const branchIds = ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'];

assignBranches(userId, branchIds)
  .then(result => {
    console.log(`Assigned ${result.data.user.branch.length} branches`);
    
    if (result.data.user.refreshHint) {
      // Refresh token or re-login
      refreshUserSession();
    }
  })
  .catch(err => console.error('Error:', err));
```

---

## React

### Custom Hook

```javascript
import { useState, useCallback } from 'react';
import axios from 'axios';

export function useBranchUserAssignment(token) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const api = axios.create({
    baseURL: '/api/v1',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  const assignBranches = useCallback(async (userId, branchIds) => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.post(`/users/${userId}/branches`, {
        branchIds: Array.isArray(branchIds) ? branchIds : [branchIds]
      });

      setLoading(false);
      return data;
    } catch (err) {
      setError(err.response?.data?.message || 'Assignment failed');
      setLoading(false);
      throw err;
    }
  }, [token]);

  const removeBranch = useCallback(async (userId, branchId) => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.delete(`/users/${userId}/branches/${branchId}`);
      setLoading(false);
      return data;
    } catch (err) {
      setError(err.response?.data?.message || 'Removal failed');
      setLoading(false);
      throw err;
    }
  }, [token]);

  const getUserBranches = useCallback(async (userId) => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.get(`/users/${userId}/branches`);
      setLoading(false);
      return data;
    } catch (err) {
      setError(err.response?.data?.message || 'Fetch failed');
      setLoading(false);
      throw err;
    }
  }, [token]);

  return {
    assignBranches,
    removeBranch,
    getUserBranches,
    loading,
    error
  };
}

// Usage in component
function UserBranchManager({ userId }) {
  const { token } = useAuth();
  const { assignBranches, removeBranch, loading, error } = useBranchUserAssignment(token);
  const [selectedBranches, setSelectedBranches] = useState([]);

  const handleAssign = async () => {
    try {
      const result = await assignBranches(userId, selectedBranches);
      
      if (result.data.user.refreshHint && userId === currentUserId) {
        // Show notification
        toast.warning('Branch access updated. Please refresh your session.');
      } else {
        toast.success(result.data.user.message);
      }
    } catch (err) {
      toast.error(error || 'Failed to assign branches');
    }
  };

  return (
    <div>
      <BranchSelector 
        value={selectedBranches}
        onChange={setSelectedBranches}
      />
      <Button onClick={handleAssign} loading={loading}>
        Assign Branches
      </Button>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
```

---

## TypeScript

### Type-Safe Client

```typescript
interface Branch {
  _id: string;
  name: string;
  branchCode: string;
  isMain: boolean;
  isActive: boolean;
}

interface User {
  _id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  branch: Branch[];
  isActive: boolean;
}

interface AssignmentResponse {
  status: 'success' | 'fail';
  data: {
    user: User & {
      refreshHint?: boolean;
      message?: string;
    };
  };
}

interface UserBranchesResponse {
  status: 'success';
  data: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    branches: Branch[];
    totalBranches: number;
  };
}

class BranchUserAssignmentService {
  constructor(
    private baseURL: string,
    private token: string
  ) {}

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }

  async assignBranches(
    userId: string,
    branchIds: string | string[]
  ): Promise<AssignmentResponse> {
    const response = await fetch(
      `${this.baseURL}/api/v1/users/${userId}/branches`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          branchIds: Array.isArray(branchIds) ? branchIds : [branchIds]
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Assignment failed');
    }

    return response.json();
  }

  async removeBranch(
    userId: string,
    branchId: string
  ): Promise<AssignmentResponse> {
    const response = await fetch(
      `${this.baseURL}/api/v1/users/${userId}/branches/${branchId}`,
      {
        method: 'DELETE',
        headers: this.getHeaders()
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Removal failed');
    }

    return response.json();
  }

  async getUserBranches(userId: string): Promise<UserBranchesResponse> {
    const response = await fetch(
      `${this.baseURL}/api/v1/users/${userId}/branches`,
      {
        headers: this.getHeaders()
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Fetch failed');
    }

    return response.json();
  }
}

// Usage
const service = new BranchUserAssignmentService(
  'https://api.example.com',
  'your-jwt-token'
);

const result = await service.assignBranches(
  '507f1f77bcf86cd799439010',
  ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']
);

if (result.data.user.refreshHint) {
  console.log('Token refresh required');
}
```

---

## Python

### Using Requests

```python
import requests
from typing import List, Union, Dict, Any

class BranchUserAssignmentClient:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url
        self.token = token
        self.headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    def assign_branches(
        self,
        user_id: str,
        branch_ids: Union[str, List[str]]
    ) -> Dict[str, Any]:
        """Assign one or more branches to a user."""
        if isinstance(branch_ids, str):
            branch_ids = [branch_ids]

        response = requests.post(
            f'{self.base_url}/api/v1/users/{user_id}/branches',
            headers=self.headers,
            json={'branchIds': branch_ids}
        )

        response.raise_for_status()
        return response.json()

    def remove_branch(self, user_id: str, branch_id: str) -> Dict[str, Any]:
        """Remove a branch from a user."""
        response = requests.delete(
            f'{self.base_url}/api/v1/users/{user_id}/branches/{branch_id}',
            headers=self.headers
        )

        response.raise_for_status()
        return response.json()

    def get_user_branches(self, user_id: str) -> Dict[str, Any]:
        """Get all branches assigned to a user."""
        response = requests.get(
            f'{self.base_url}/api/v1/users/{user_id}/branches',
            headers=self.headers
        )

        response.raise_for_status()
        return response.json()

# Usage
client = BranchUserAssignmentClient(
    base_url='https://api.example.com',
    token='your-jwt-token'
)

try:
    result = client.assign_branches(
        user_id='507f1f77bcf86cd799439010',
        branch_ids=['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']
    )
    
    if result['data']['user'].get('refreshHint'):
        print('Token refresh required')
    
    print(f"Assigned {len(result['data']['user']['branch'])} branches")

except requests.HTTPError as e:
    print(f'Error: {e.response.json().get("message")}')
```

---

## PHP

### Using cURL

```php
<?php

class BranchUserAssignmentClient {
    private $baseURL;
    private $token;

    public function __construct($baseURL, $token) {
        $this->baseURL = $baseURL;
        $this->token = $token;
    }

    private function getHeaders() {
        return [
            'Authorization: Bearer ' . $this->token,
            'Content-Type: application/json'
        ];
    }

    public function assignBranches($userId, $branchIds) {
        if (!is_array($branchIds)) {
            $branchIds = [$branchIds];
        }

        $ch = curl_init($this->baseURL . "/api/v1/users/$userId/branches");
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "POST");
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['branchIds' => $branchIds]));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $this->getHeaders());

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) {
            throw new Exception("Assignment failed with code $httpCode");
        }

        return json_decode($response, true);
    }

    public function removeBranch($userId, $branchId) {
        $ch = curl_init($this->baseURL . "/api/v1/users/$userId/branches/$branchId");
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "DELETE");
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $this->getHeaders());

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) {
            throw new Exception("Removal failed with code $httpCode");
        }

        return json_decode($response, true);
    }

    public function getUserBranches($userId) {
        $ch = curl_init($this->baseURL . "/api/v1/users/$userId/branches");
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $this->getHeaders());

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) {
            throw new Exception("Fetch failed with code $httpCode");
        }

        return json_decode($response, true);
    }
}

// Usage
$client = new BranchUserAssignmentClient(
    'https://api.example.com',
    'your-jwt-token'
);

try {
    $result = $client->assignBranches(
        '507f1f77bcf86cd799439010',
        ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']
    );

    if (isset($result['data']['user']['refreshHint']) && $result['data']['user']['refreshHint']) {
        echo "Token refresh required\n";
    }

    echo "Assigned " . count($result['data']['user']['branch']) . " branches\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
```

---

## Go

### Using net/http

```go
package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
)

type BranchUserAssignmentClient struct {
    BaseURL string
    Token   string
    Client  *http.Client
}

type AssignmentRequest struct {
    BranchIDs []string `json:"branchIds"`
}

type Branch struct {
    ID         string `json:"_id"`
    Name       string `json:"name"`
    BranchCode string `json:"branchCode"`
    IsMain     bool   `json:"isMain"`
    IsActive   bool   `json:"isActive"`
}

type User struct {
    ID          string   `json:"_id"`
    FirstName   string   `json:"firstName"`
    LastName    string   `json:"lastName"`
    Branch      []Branch `json:"branch"`
    RefreshHint bool     `json:"refreshHint"`
    Message     string   `json:"message"`
}

type AssignmentResponse struct {
    Status string `json:"status"`
    Data   struct {
        User User `json:"user"`
    } `json:"data"`
}

func NewBranchUserAssignmentClient(baseURL, token string) *BranchUserAssignmentClient {
    return &BranchUserAssignmentClient{
        BaseURL: baseURL,
        Token:   token,
        Client:  &http.Client{},
    }
}

func (c *BranchUserAssignmentClient) AssignBranches(userID string, branchIDs []string) (*AssignmentResponse, error) {
    reqBody := AssignmentRequest{BranchIDs: branchIDs}
    jsonData, err := json.Marshal(reqBody)
    if err != nil {
        return nil, err
    }

    url := fmt.Sprintf("%s/api/v1/users/%s/branches", c.BaseURL, userID)
    req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
    if err != nil {
        return nil, err
    }

    req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.Token))
    req.Header.Set("Content-Type", "application/json")

    resp, err := c.Client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    body, err := io.ReadAll(resp.Body)
    if err != nil {
        return nil, err
    }

    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("assignment failed with status %d: %s", resp.StatusCode, string(body))
    }

    var result AssignmentResponse
    if err := json.Unmarshal(body, &result); err != nil {
        return nil, err
    }

    return &result, nil
}

func main() {
    client := NewBranchUserAssignmentClient(
        "https://api.example.com",
        "your-jwt-token",
    )

    result, err := client.AssignBranches(
        "507f1f77bcf86cd799439010",
        []string{"507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"},
    )

    if err != nil {
        fmt.Printf("Error: %v\n", err)
        return
    }

    if result.Data.User.RefreshHint {
        fmt.Println("Token refresh required")
    }

    fmt.Printf("Assigned %d branches\n", len(result.Data.User.Branch))
}
```

---

## Summary

Each example demonstrates:
- ✅ Proper authentication headers
- ✅ Request body formatting
- ✅ Error handling
- ✅ `refreshHint` detection
- ✅ Type safety (where applicable)

Choose the example that matches your tech stack and adapt as needed.

# Customer Frontend Integration Guide

Complete guide for integrating the **Customer Mobile/Web App** with the dining session backend.

---

## 📱 Overview

**Purpose:** Allow customers to scan table QR codes, view menu, place orders, and track their food in real-time.

**Key Feature:** Multiple customers at the same table can scan the QR code and order independently.

**Platforms:** Mobile app (iOS/Android) or Mobile web

---

## 🎯 Customer User Journey

```
1. Customer sits at table
   ↓
2. Scans QR code on table
   ↓
3. Sees restaurant menu
   ↓
4. Adds items to cart
   ↓
5. Enters name and places order
   ↓
6. Tracks order status in real-time
   ↓
7. Receives notification when food is ready
```

---

## 🚀 Quick Setup

### Prerequisites
```bash
npm install socket.io-client axios
# For QR scanning
npm install react-qr-reader  # React
# or
npm install expo-camera      # React Native
```

### Configuration
```javascript
// config/api.js
export const API_BASE_URL = 'https://api.restaurant.com/api/v1';
export const SOCKET_URL = 'https://api.restaurant.com';
```

---

## 📋 Implementation Steps

### Step 1: QR Code Scanner

**React Native (Recommended for Mobile)**
```javascript
// screens/QRScannerScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Camera } from 'expo-camera';
import { BarCodeScanner } from 'expo-barcode-scanner';

export default function QRScannerScreen({ navigation }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleBarCodeScanned = ({ data }) => {
    if (scanned) return;
    
    setScanned(true);

    try {
      // Parse QR code data
      const qrData = JSON.parse(data);
      // Expected: { tableId, merchantId, branchId, token }
      
      console.log('✅ QR Scanned:', qrData);
      
      // Navigate to menu with table info
      navigation.navigate('Menu', { qrData });
      
    } catch (error) {
      Alert.alert(
        'Invalid QR Code',
        'Please scan a valid table QR code',
        [{ 
          text: 'Try Again', 
          onPress: () => setScanned(false) 
        }]
      );
    }
  };

  if (hasPermission === null) {
    return <Text>Requesting camera permission...</Text>;
  }

  if (hasPermission === false) {
    return <Text>Camera access denied. Please enable in settings.</Text>;
  }

  return (
    <View style={styles.container}>
      <Camera
        style={styles.camera}
        onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
        barCodeScannerSettings={{
          barCodeTypes: [BarCodeScanner.Constants.BarCodeType.qr],
        }}
      />
      
      <View style={styles.overlay}>
        <View style={styles.scanFrame} />
        <Text style={styles.instructions}>
          Point camera at table QR code
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 10,
  },
  instructions: {
    position: 'absolute',
    bottom: 100,
    color: 'white',
    fontSize: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 15,
    borderRadius: 10,
  },
});
```

**React Web**
```javascript
// components/QRScanner.jsx
import React, { useState } from 'react';
import { QrReader } from 'react-qr-reader';
import { useNavigate } from 'react-router-dom';

export default function QRScanner() {
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleScan = async (result) => {
    if (!result) return;
    
    try {
      setScanning(false);
      
      const qrData = JSON.parse(result.text);
      console.log('✅ QR Scanned:', qrData);
      
      // Navigate to menu
      navigate('/menu', { state: { qrData } });
      
    } catch (err) {
      console.error('Invalid QR code:', err);
      setError('Invalid QR code. Please scan a valid table QR.');
      setTimeout(() => {
        setError(null);
        setScanning(true);
      }, 3000);
    }
  };

  return (
    <div className="qr-scanner">
      <h2>Scan Table QR Code</h2>
      
      {scanning && (
        <QrReader
          onResult={handleScan}
          constraints={{ facingMode: 'environment' }}
          style={{ width: '100%', maxWidth: '400px' }}
        />
      )}
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      <p className="instructions">
        Point your camera at the QR code on your table
      </p>
    </div>
  );
}
```

---

### Step 2: Menu & Cart

**Menu Screen (React Native)**
```javascript
// screens/MenuScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

export default function MenuScreen({ route, navigation }) {
  const { qrData } = route.params;
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMenu();
  }, []);

  const loadMenu = async () => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/menu?branchId=${qrData.branchId}`
      );
      setMenu(response.data.items);
    } catch (error) {
      console.error('Failed to load menu:', error);
      Alert.alert('Error', 'Failed to load menu. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (item) => {
    const existing = cart.find(c => c._id === item._id);
    if (existing) {
      setCart(cart.map(c => 
        c._id === item._id 
          ? { ...c, quantity: c.quantity + 1 }
          : c
      ));
    } else {
      setCart([...cart, { ...item, quantity: 1 }]);
    }
  };

  const removeFromCart = (itemId) => {
    setCart(cart.filter(c => c._id !== itemId));
  };

  const updateQuantity = (itemId, change) => {
    setCart(cart.map(c => {
      if (c._id === itemId) {
        const newQuantity = c.quantity + change;
        return newQuantity > 0 ? { ...c, quantity: newQuantity } : c;
      }
      return c;
    }).filter(c => c.quantity > 0));
  };

  const getTotalAmount = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <Text>Loading menu...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Table Info Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Table {qrData.tableNumber}</Text>
        <Text style={styles.headerSubtitle}>
          Order independently - others at your table can scan too!
        </Text>
      </View>

      {/* Menu Items */}
      <ScrollView style={styles.menuList}>
        {menu.map(item => (
          <MenuItem
            key={item._id}
            item={item}
            onAdd={addToCart}
            inCart={cart.find(c => c._id === item._id)}
          />
        ))}
      </ScrollView>

      {/* Cart Button */}
      {cart.length > 0 && (
        <TouchableOpacity
          style={styles.cartButton}
          onPress={() => navigation.navigate('Checkout', { cart, qrData })}
        >
          <Text style={styles.cartButtonText}>
            View Cart ({cart.length} items) - {getTotalAmount()} ETB
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// Menu Item Component
function MenuItem({ item, onAdd, inCart }) {
  return (
    <View style={styles.menuItem}>
      <Image
        source={{ uri: item.image || 'https://via.placeholder.com/100' }}
        style={styles.menuItemImage}
      />
      <View style={styles.menuItemInfo}>
        <Text style={styles.menuItemName}>{item.name}</Text>
        <Text style={styles.menuItemDescription}>{item.description}</Text>
        <Text style={styles.menuItemPrice}>{item.price} ETB</Text>
      </View>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => onAdd(item)}
      >
        <Text style={styles.addButtonText}>
          {inCart ? `+ (${inCart.quantity})` : 'Add'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  menuList: {
    flex: 1,
  },
  menuItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 1,
    alignItems: 'center',
  },
  menuItemImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  menuItemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  menuItemName: {
    fontSize: 16,
    fontWeight: '600',
  },
  menuItemDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  menuItemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 4,
  },
  addButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  cartButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    alignItems: 'center',
  },
  cartButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
```

---

### Step 3: Checkout & Place Order

**Checkout Screen (React Native)**
```javascript
// screens/CheckoutScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

export default function CheckoutScreen({ route, navigation }) {
  const { cart, qrData } = route.params;
  const [customerName, setCustomerName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const getTotalAmount = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const placeOrder = async () => {
    if (!customerName.trim()) {
      Alert.alert('Name Required', 'Please enter your name');
      return;
    }

    setSubmitting(true);

    try {
      // Place order - backend will automatically create/reuse dining session
      const response = await axios.post(`${API_BASE_URL}/orders`, {
        tableId: qrData.tableId,
        merchantId: qrData.merchantId,
        branchId: qrData.branchId,
        orderType: 'dine_in',
        customerName: customerName.trim(),
        items: cart.map(item => ({
          menuItem: item._id,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
          totalPrice: item.price * item.quantity,
        })),
        // Backend automatically sets:
        // - order.session (links to dining session)
        // - order.source = 'qr'
      });

      console.log('✅ Order placed:', response.data);

      // Show success and navigate to tracking
      Alert.alert(
        'Order Placed!',
        `Your order #${response.data.order.orderNumber} has been sent to the kitchen.`,
        [
          {
            text: 'Track Order',
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{
                  name: 'OrderTracking',
                  params: { orderId: response.data.order._id }
                }],
              });
            }
          }
        ]
      );

    } catch (error) {
      console.error('Order placement failed:', error);
      
      const errorMessage = error.response?.data?.message 
        || 'Failed to place order. Please try again.';
      
      Alert.alert('Error', errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content}>
        {/* Order Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Order</Text>
          {cart.map(item => (
            <View key={item._id} style={styles.cartItem}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemQuantity}>x{item.quantity}</Text>
              <Text style={styles.itemPrice}>
                {item.price * item.quantity} ETB
              </Text>
            </View>
          ))}
        </View>

        {/* Total */}
        <View style={styles.totalSection}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>{getTotalAmount()} ETB</Text>
        </View>

        {/* Customer Name */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your name"
            value={customerName}
            onChangeText={setCustomerName}
            editable={!submitting}
          />
        </View>
      </ScrollView>

      {/* Place Order Button */}
      <TouchableOpacity
        style={[
          styles.placeOrderButton,
          submitting && styles.placeOrderButtonDisabled
        ]}
        onPress={placeOrder}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.placeOrderButtonText}>
            Place Order - {getTotalAmount()} ETB
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  cartItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  itemName: {
    flex: 1,
    fontSize: 14,
  },
  itemQuantity: {
    fontSize: 14,
    color: '#666',
    marginRight: 12,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
  },
  totalSection: {
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  placeOrderButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
  },
  placeOrderButtonDisabled: {
    opacity: 0.6,
  },
  placeOrderButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
```

---

### Step 4: Order Tracking (Real-Time)

**Order Tracking Screen (React Native)**
```javascript
// screens/OrderTrackingScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import axios from 'axios';
import io from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../config/api';

export default function OrderTrackingScreen({ route }) {
  const { orderId } = route.params;
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    loadOrder();
    setupSocket();

    return () => {
      if (socket) socket.disconnect();
    };
  }, [orderId]);

  const loadOrder = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/orders/${orderId}`);
      setOrder(response.data.order);
    } catch (error) {
      console.error('Failed to load order:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupSocket = () => {
    const newSocket = io(SOCKET_URL);

    newSocket.on('connect', () => {
      console.log('✅ Socket connected');
      
      // Subscribe to this order's updates
      newSocket.emit('join', `order:${orderId}`);
    });

    // Listen for order status changes
    newSocket.on('order:status-changed', (data) => {
      console.log('📊 Order status changed:', data);
      
      if (data.orderId === orderId) {
        setOrder(prev => ({
          ...prev,
          status: data.newStatus
        }));
        
        // Show notification if ready
        if (data.newStatus === 'ready') {
          // You can use push notifications here
          console.log('🍔 Your food is ready!');
        }
      }
    });

    // Listen for item status changes
    newSocket.on('order:item-status-changed', (data) => {
      console.log('📦 Item status changed:', data);
      
      if (data.orderId === orderId) {
        setOrder(prev => ({
          ...prev,
          items: prev.items.map(item =>
            item._id === data.itemId
              ? { ...item, status: data.newStatus }
              : item
          )
        }));
      }
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Socket disconnected');
    });

    setSocket(newSocket);
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <Text>Loading order...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.loading}>
        <Text>Order not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Order Header */}
      <View style={styles.header}>
        <Text style={styles.orderNumber}>Order #{order.orderNumber}</Text>
        <Text style={styles.customerName}>{order.customerName}</Text>
        <Text style={styles.tableNumber}>Table {order.table?.tableNumber}</Text>
      </View>

      {/* Status Progress */}
      <View style={styles.statusSection}>
        <Text style={styles.sectionTitle}>Status</Text>
        <OrderStatusProgress status={order.status} />
      </View>

      {/* Items */}
      <View style={styles.itemsSection}>
        <Text style={styles.sectionTitle}>Your Items</Text>
        {order.items.map(item => (
          <View key={item._id} style={styles.item}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemQuantity}>x{item.quantity}</Text>
            </View>
            <View style={[
              styles.itemStatusBadge,
              styles[`status_${item.status}`]
            ]}>
              <Text style={styles.itemStatusText}>
                {formatStatus(item.status)}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Order Info */}
      <View style={styles.infoSection}>
        <InfoRow label="Total" value={`${order.totalAmount} ETB`} />
        <InfoRow label="Payment" value={order.paymentStatus} />
        <InfoRow label="Placed At" value={formatTime(order.placedAt)} />
      </View>
    </ScrollView>
  );
}

// Status Progress Component
function OrderStatusProgress({ status }) {
  const statuses = [
    { key: 'pending', label: 'Received' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'preparing', label: 'Preparing' },
    { key: 'ready', label: 'Ready' },
    { key: 'completed', label: 'Served' },
  ];

  const currentIndex = statuses.findIndex(s => s.key === status);

  return (
    <View style={styles.progressBar}>
      {statuses.map((s, index) => (
        <View key={s.key} style={styles.progressStep}>
          <View style={[
            styles.progressDot,
            index <= currentIndex && styles.progressDotActive
          ]} />
          <Text style={[
            styles.progressLabel,
            index <= currentIndex && styles.progressLabelActive
          ]}>
            {s.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function formatStatus(status) {
  return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#4CAF50',
    padding: 20,
    alignItems: 'center',
  },
  orderNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  customerName: {
    fontSize: 16,
    color: '#fff',
    marginTop: 4,
  },
  tableNumber: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  statusSection: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressStep: {
    alignItems: 'center',
    flex: 1,
  },
  progressDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0e0e0',
    marginBottom: 8,
  },
  progressDotActive: {
    backgroundColor: '#4CAF50',
  },
  progressLabel: {
    fontSize: 10,
    color: '#999',
    textAlign: 'center',
  },
  progressLabelActive: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  itemsSection: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 8,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '500',
  },
  itemQuantity: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  itemStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  status_pending: {
    backgroundColor: '#FFF3E0',
  },
  status_preparing: {
    backgroundColor: '#E3F2FD',
  },
  status_ready: {
    backgroundColor: '#E8F5E9',
  },
  itemStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoSection: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
  },
});
```

---

## 🔌 API Integration Summary

### 1. Place Order (Core API)
```javascript
POST /api/v1/orders

// Request
{
  "tableId": "...",
  "merchantId": "...",
  "branchId": "...",
  "orderType": "dine_in",
  "customerName": "John Doe",
  "items": [
    {
      "menuItem": "...",
      "name": "Burger",
      "quantity": 1,
      "unitPrice": 150,
      "totalPrice": 150
    }
  ]
}

// Backend automatically:
// ✅ Creates/reuses dining session
// ✅ Links order to session
// ✅ Sets source = 'qr'

// Response
{
  "success": true,
  "order": {
    "_id": "...",
    "orderNumber": "#QR-001",
    "session": "...",  // Linked to dining session
    "source": "qr",
    "status": "pending",
    "totalAmount": 150
  }
}
```

### 2. Load Menu
```javascript
GET /api/v1/menu?branchId={branchId}

// Response
{
  "success": true,
  "items": [
    {
      "_id": "...",
      "name": "Burger",
      "description": "Beef burger with cheese",
      "price": 150,
      "image": "https://...",
      "category": "Main Course"
    }
  ]
}
```

### 3. Get Order Details
```javascript
GET /api/v1/orders/{orderId}

// Response
{
  "success": true,
  "order": {
    "_id": "...",
    "orderNumber": "#QR-001",
    "customerName": "John Doe",
    "table": { "tableNumber": "T-101" },
    "status": "preparing",
    "items": [...],
    "totalAmount": 150,
    "paymentStatus": "unpaid"
  }
}
```

---

## 📡 Socket.IO Events (Real-Time Updates)

### Subscribe to Order Updates
```javascript
// After placing order
const socket = io(SOCKET_URL);

socket.on('connect', () => {
  // Join room for this specific order
  socket.emit('join', `order:${orderId}`);
});
```

### Listen for Status Changes
```javascript
// Order overall status changed
socket.on('order:status-changed', (data) => {
  /*
  data = {
    orderId: string,
    orderNumber: string,
    oldStatus: string,
    newStatus: string,  // 'pending' → 'preparing' → 'ready'
    changedAt: Date
  }
  */
  
  // Update UI
  setOrderStatus(data.newStatus);
  
  // Show notification if ready
  if (data.newStatus === 'ready') {
    showNotification('Your food is ready! 🍔');
  }
});

// Individual item status changed
socket.on('order:item-status-changed', (data) => {
  /*
  data = {
    orderId: string,
    itemId: string,
    itemName: string,
    oldStatus: string,
    newStatus: string,
    changedAt: Date
  }
  */
  
  // Update specific item status in UI
  updateItemStatus(data.itemId, data.newStatus);
});
```

---

## 📱 Complete App Structure (React Native)

```
customer-app/
├── screens/
│   ├── QRScannerScreen.js      # Step 1: Scan QR
│   ├── MenuScreen.js            # Step 2: Browse menu
│   ├── CheckoutScreen.js        # Step 3: Checkout
│   └── OrderTrackingScreen.js   # Step 4: Track order
├── config/
│   └── api.js                   # API URLs
├── utils/
│   └── api-client.js            # Axios instance
└── App.js                       # Navigation setup
```

### Navigation Setup
```javascript
// App.js
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import QRScannerScreen from './screens/QRScannerScreen';
import MenuScreen from './screens/MenuScreen';
import CheckoutScreen from './screens/CheckoutScreen';
import OrderTrackingScreen from './screens/OrderTrackingScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="QRScanner">
        <Stack.Screen 
          name="QRScanner" 
          component={QRScannerScreen}
          options={{ title: 'Scan QR Code' }}
        />
        <Stack.Screen 
          name="Menu" 
          component={MenuScreen}
          options={{ title: 'Menu' }}
        />
        <Stack.Screen 
          name="Checkout" 
          component={CheckoutScreen}
          options={{ title: 'Checkout' }}
        />
        <Stack.Screen 
          name="OrderTracking" 
          component={OrderTrackingScreen}
          options={{ title: 'Your Order' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

---

## ✅ Testing Checklist

### Before Deploying Customer App

- [ ] **QR Scanner**
  - [ ] Works on iOS
  - [ ] Works on Android
  - [ ] Handles invalid QR codes
  - [ ] Camera permissions requested properly

- [ ] **Menu & Cart**
  - [ ] Menu loads successfully
  - [ ] Can add items to cart
  - [ ] Can update quantities
  - [ ] Total calculates correctly

- [ ] **Order Placement**
  - [ ] Order places successfully
  - [ ] Shows success message
  - [ ] Navigates to tracking
  - [ ] Handles network errors

- [ ] **Order Tracking**
  - [ ] Socket.IO connects
  - [ ] Real-time updates work
  - [ ] Status progress shows correctly
  - [ ] Item statuses update

- [ ] **Multiple Customers**
  - [ ] Two phones can scan same QR
  - [ ] Both can place orders
  - [ ] Orders tracked separately
  - [ ] No interference between customers

---

## 🚨 Error Handling

### Common Errors & Solutions

**Camera not working:**
```javascript
// Check permissions
const { status } = await Camera.requestCameraPermissionsAsync();
if (status !== 'granted') {
  Alert.alert('Permission needed', 'Camera access required to scan QR codes');
}
```

**Network errors:**
```javascript
try {
  await placeOrder();
} catch (error) {
  if (!error.response) {
    // Network error
    Alert.alert('No Internet', 'Please check your connection');
  } else {
    // Server error
    Alert.alert('Error', error.response.data.message);
  }
}
```

**Socket disconnection:**
```javascript
socket.on('disconnect', () => {
  // Show reconnecting message
  setConnectionStatus('Reconnecting...');
});

socket.on('connect', () => {
  // Re-join room
  socket.emit('join', `order:${orderId}`);
  setConnectionStatus('Connected');
});
```

---

## 🎨 UI/UX Best Practices

1. **Loading States:** Show spinners while loading menu/placing order
2. **Success Feedback:** Clear confirmation after order placed
3. **Real-Time Updates:** Update UI immediately when status changes
4. **Notifications:** Alert customer when food is ready
5. **Offline Support:** Show message if no internet
6. **Clear Instructions:** Guide users through QR scanning

---

## 📦 Required Packages (React Native)

```json
{
  "dependencies": {
    "react": "18.2.0",
    "react-native": "0.72.0",
    "@react-navigation/native": "^6.1.6",
    "@react-navigation/native-stack": "^6.9.12",
    "expo-camera": "~13.2.1",
    "expo-barcode-scanner": "~12.3.2",
    "socket.io-client": "^4.6.0",
    "axios": "^1.4.0"
  }
}
```

---

## 🎯 Key Takeaways

✅ **Backend handles session management** - You just place orders normally  
✅ **Multiple customers work automatically** - Backend creates/reuses sessions  
✅ **Real-time updates** - Use Socket.IO for live order tracking  
✅ **Simple API** - Only 2 main endpoints (menu, orders)  
✅ **Mobile-first** - Optimized for phone cameras and touch screens  

---

*Customer frontend integration complete! Your customers can now order independently at the same table.* 🎉

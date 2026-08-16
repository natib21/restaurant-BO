# Report Caching Strategy (Future Optimization)

**Status:** 📋 DOCUMENTED (Not Implemented)  
**Task:** 18.3 - X-Cache-Status Header & Caching Strategy  
**Date:** 2026-08-15

---

## Current Implementation

### X-Cache-Status Header ✅
All report endpoints now include the `X-Cache-Status` response header:
- **Current Value:** `MISS` (no caching implemented)
- **Location:** `src/modules/reports/controller/report.controller.js`
- **Applied To:** All 8 report types + export job status

```javascript
// Example response headers
HTTP/1.1 200 OK
Content-Type: application/json
X-Cache-Status: MISS
...
```

### Cache States (Future Implementation)
| Status | Meaning | When to Return |
|--------|---------|----------------|
| `MISS` | Cache miss, data fetched from DB | Current: always returned |
| `HIT` | Cache hit, data served from cache | Future: when cache entry exists and valid |
| `STALE` | Cache hit but stale, revalidating in background | Future: during background refresh |
| `BYPASS` | Cache bypassed due to query parameters | Future: for real-time/uncacheable queries |

---

## Recommended Caching Architecture

### Technology Stack
**Primary Cache:** Redis  
**Why Redis:**
- In-memory speed (~1ms latency vs 50-100ms for DB queries)
- Built-in TTL expiration
- Atomic operations for cache invalidation
- Pub/Sub for distributed cache invalidation
- Support for data structures (strings, hashes, lists)

### Cache Key Pattern

```javascript
// Template
`report:${reportType}:${merchantId}:${branchId || 'all'}:${dateFrom}:${dateTo}:${groupBy}:${page}:${limit}`

// Examples
'report:sales:merchant123:all:2024-01-01:2024-01-31:day:1:50'
'report:orders:merchant123:branch456:2024-01-01:2024-01-31:week:2:50'
'report:profitability:merchant789:all:2024-06-01:2024-06-30:month:1:100'
```

**Key Components:**
- `reportType`: One of 8 report types (sales, orders, products, etc.)
- `merchantId`: Tenant isolation
- `branchId`: Branch filter (`all` if not provided)
- `dateFrom`: Start date (YYYY-MM-DD)
- `dateTo`: End date (YYYY-MM-DD)
- `groupBy`: Time bucket (day/week/month)
- `page`: Page number
- `limit`: Items per page

---

## TTL Strategy

### Time-Based TTL (Initial Approach)

| Report Type | TTL | Rationale |
|-------------|-----|-----------|
| **Sales Report** | 10 minutes | High-value, frequently accessed, balance freshness vs performance |
| **Orders Report** | 5 minutes | Real-time needs, status changes frequently |
| **Products Report** | 15 minutes | Slower to change, top sellers stable within short periods |
| **Customers Report** | 15 minutes | Customer classification relatively stable |
| **Delivery Report** | 10 minutes | Moderate update frequency |
| **Profitability Report** | 5 minutes | Depends on cost data updates |
| **Staff Report** | 15 minutes | Staff assignments change less frequently |
| **Inventory Report** | 5 minutes | Stock levels change frequently |

### Dynamic TTL (Advanced)

Adjust TTL based on query characteristics:

```javascript
function calculateTTL(reportType, dateFrom, dateTo, now) {
  const isHistorical = new Date(dateTo) < new Date(now - 7 * 24 * 60 * 60 * 1000); // Older than 7 days
  const isCurrentDay = new Date(dateTo).toDateString() === new Date().toDateString();
  
  if (isHistorical) {
    // Historical data rarely changes - cache for 1 hour
    return 3600;
  } else if (isCurrentDay) {
    // Today's data changes frequently - short TTL
    return baseTTL[reportType];
  } else {
    // Recent but not today - medium TTL
    return baseTTL[reportType] * 2;
  }
}
```

**TTL Rules:**
1. **Historical reports** (older than 7 days): 1 hour TTL
2. **Current day reports**: Standard TTL (5-15 minutes)
3. **Recent reports** (1-7 days ago): 2x standard TTL
4. **Large date ranges** (>30 days): 30 minutes TTL

---

## Cache Invalidation Strategy

### 1. Time-Based Expiration (Passive)
Redis automatically evicts keys after TTL expires.

**Pros:**
- Simple to implement
- No manual invalidation logic
- Predictable cache behavior

**Cons:**
- May serve stale data for up to TTL duration
- No immediate updates on data changes

### 2. Event-Based Invalidation (Active)

Invalidate cache when underlying data changes:

```javascript
// Order creation/update events
EventEmitter.on('order.created', async (order) => {
  await invalidateReportCache(order.merchant, order.branch);
});

EventEmitter.on('order.statusChanged', async (order) => {
  await invalidateReportCache(order.merchant, order.branch);
});

// Invalidation function
async function invalidateReportCache(merchantId, branchId = null) {
  // Invalidate all report types for this merchant/branch
  const patterns = [
    `report:*:${merchantId}:${branchId || '*'}:*`,
    `report:*:${merchantId}:all:*` // Also invalidate "all branches" queries
  ];
  
  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}
```

**Events to Monitor:**
- `order.created`
- `order.statusChanged` (especially `paid`, `completed`, `canceled`)
- `order.updated` (item changes)
- `ingredient.stockChanged` (for inventory reports)
- `menu.updated` (for products reports)

### 3. Hybrid Approach (Recommended)

Combine time-based TTL with selective event-based invalidation:

1. **Set TTL** on all cached reports (5-15 minutes)
2. **Invalidate** on critical events:
   - Order payment completed (affects sales reports)
   - Order status to `completed` (affects orders reports)
   - Order status to `canceled` (affects cancellation rates)
3. **Skip invalidation** for minor updates:
   - Order notes updated (doesn't affect metrics)
   - Status changes between intermediate states (pending → accepted)

---

## Cache Warming Strategy

### Predictive Warming

Pre-populate cache for commonly accessed reports:

```javascript
// Run daily at midnight
async function warmReportCache() {
  const merchants = await Merchant.find({ subscription: { $in: ['premium', 'enterprise'] } });
  
  for (const merchant of merchants) {
    // Warm today's sales report
    await generateAndCacheReport({
      reportType: 'sales',
      merchantId: merchant._id,
      dateFrom: startOfToday(),
      dateTo: endOfToday(),
      groupBy: 'day',
      page: 1,
      limit: 50
    });
    
    // Warm last 7 days sales report
    await generateAndCacheReport({
      reportType: 'sales',
      merchantId: merchant._id,
      dateFrom: startOfDay(-7),
      dateTo: endOfToday(),
      groupBy: 'day',
      page: 1,
      limit: 50
    });
    
    // Warm this month's orders report
    await generateAndCacheReport({
      reportType: 'orders',
      merchantId: merchant._id,
      dateFrom: startOfMonth(),
      dateTo: endOfToday(),
      groupBy: 'day',
      page: 1,
      limit: 50
    });
  }
}
```

**Warming Schedule:**
- **Daily at midnight:** Today's reports, last 7 days, current month
- **Hourly (business hours):** Current day reports
- **On-demand:** After major events (holiday sales, promotions)

### Warming Priority (by access frequency)

Based on typical usage patterns:

1. **High Priority** (warm hourly):
   - Sales report: Today, Last 7 days
   - Orders report: Today

2. **Medium Priority** (warm daily):
   - Sales report: Current month, Last 30 days
   - Products report: Last 7 days
   - Staff report: Today

3. **Low Priority** (on-demand only):
   - Profitability reports (complex, varies by merchant)
   - Custom date ranges
   - Historical reports (older than 30 days)

---

## Implementation Roadmap

### Phase 1: Basic Caching (1-2 weeks)
- [x] Add X-Cache-Status header (always MISS) ✅ DONE
- [ ] Set up Redis connection
- [ ] Implement cache key generation
- [ ] Cache GET responses with fixed TTL
- [ ] Update X-Cache-Status header (HIT/MISS)

```javascript
// Pseudo-code
async function getCachedReport(cacheKey, serviceMethod, params) {
  const cached = await redis.get(cacheKey);
  if (cached) {
    return { data: JSON.parse(cached), cacheStatus: 'HIT' };
  }
  
  const data = await serviceMethod(params);
  await redis.setex(cacheKey, TTL, JSON.stringify(data));
  return { data, cacheStatus: 'MISS' };
}
```

### Phase 2: Smart Invalidation (2-3 weeks)
- [ ] Implement event-based invalidation
- [ ] Add pub/sub for distributed cache invalidation
- [ ] Monitor cache hit rate
- [ ] Tune TTL values based on metrics

### Phase 3: Advanced Optimization (1-2 months)
- [ ] Implement cache warming
- [ ] Dynamic TTL based on query characteristics
- [ ] Background cache refresh (stale-while-revalidate)
- [ ] Cache compression for large reports
- [ ] Cache analytics dashboard

---

## Cache Middleware Example

```javascript
// middleware/reportCache.js
const redis = require('../config/redis');

/**
 * Cache middleware for report endpoints
 */
function cacheReportResponse(ttl = 600) {
  return async (req, res, next) => {
    // Build cache key from request parameters
    const cacheKey = buildCacheKey(req);
    
    try {
      // Try to get from cache
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        // Cache hit - parse and return
        const data = JSON.parse(cached);
        return res
          .header('X-Cache-Status', 'HIT')
          .status(200)
          .json(data);
      }
      
      // Cache miss - continue to handler
      // Override res.json to cache response
      const originalJson = res.json.bind(res);
      res.json = function (body) {
        // Cache the response
        redis.setex(cacheKey, ttl, JSON.stringify(body));
        
        // Set cache status header
        res.header('X-Cache-Status', 'MISS');
        
        // Return original response
        return originalJson(body);
      };
      
      next();
    } catch (error) {
      // Cache error - bypass and continue
      console.error('Cache error:', error);
      res.header('X-Cache-Status', 'BYPASS');
      next();
    }
  };
}

function buildCacheKey(req) {
  const { reportType } = req.params;
  const { dateFrom, dateTo, branchId, groupBy, page, limit } = req.query;
  const merchantId = getMerchantId(req);
  
  return `report:${reportType}:${merchantId}:${branchId || 'all'}:${dateFrom}:${dateTo}:${groupBy}:${page}:${limit}`;
}

module.exports = { cacheReportResponse };
```

**Usage in routes:**
```javascript
const { cacheReportResponse } = require('../middleware/reportCache');

// Apply cache middleware to report routes
router.get('/sales', 
  protect,
  requireFeature('reports'),
  restrictTo('MERCHANT_ADMIN', 'SUPER_ADMIN'),
  validate(reportQuerySchema, 'query'),
  cacheReportResponse(600), // 10 minute TTL
  getSalesReport
);
```

---

## Monitoring & Metrics

### Key Metrics to Track

1. **Cache Hit Rate**
   ```javascript
   cacheHitRate = (cacheHits / totalRequests) × 100
   ```
   **Target:** >70% for frequently accessed reports

2. **Cache Miss Latency**
   - Measure time for DB query + aggregation
   - **Target:** <100ms average

3. **Cache Hit Latency**
   - Measure time for Redis fetch + deserialization
   - **Target:** <5ms average

4. **Cache Size**
   - Total memory used by report cache
   - **Target:** <500MB for typical merchant

5. **Cache Eviction Rate**
   - How often cache entries are evicted before TTL
   - **Target:** <5%

### Monitoring Dashboard

```javascript
// Cache statistics endpoint
router.get('/cache/stats', async (req, res) => {
  const stats = await redis.info('stats');
  const keys = await redis.keys('report:*');
  
  res.json({
    totalKeys: keys.length,
    hitRate: calculateHitRate(),
    avgLatency: calculateAvgLatency(),
    memoryUsed: stats.used_memory_human,
    evictedKeys: stats.evicted_keys
  });
});
```

---

## Cost-Benefit Analysis

### Performance Gains

| Metric | Without Cache | With Cache | Improvement |
|--------|---------------|------------|-------------|
| Avg Response Time | 50-100ms | 5-10ms | **10x faster** |
| P95 Response Time | 200-500ms | 10-20ms | **20x faster** |
| DB Load | 100% | 20-30% | **70% reduction** |
| Concurrent Users | 50 | 250+ | **5x capacity** |

### Infrastructure Costs

**Redis Setup:**
- Small instance (1GB RAM): $20/month
- Medium instance (5GB RAM): $50/month
- Large instance (20GB RAM): $150/month

**ROI:**
- Reduce DB read load by 70%
- Potentially downgrade DB instance: **Save $100-300/month**
- Improved user experience: **Increased retention**
- **Net Savings:** $50-250/month + UX improvements

---

## Security Considerations

### 1. Cache Poisoning Prevention
- Never cache user-specific sensitive data
- Validate cache key components
- Use merchant-scoped keys only

### 2. Multi-Tenant Isolation
- Always include `merchantId` in cache key
- Never share cache between merchants
- Verify tenant scope before cache retrieval

### 3. Data Freshness
- Balance cache TTL vs data accuracy needs
- Consider SLA requirements for report freshness
- Allow cache bypass for critical real-time queries

### 4. Memory Limits
- Set Redis `maxmemory` policy to `allkeys-lru`
- Monitor memory usage
- Implement cache size limits per merchant

---

## Testing Strategy

### Cache Functionality Tests
```javascript
describe('Report Cache', () => {
  it('should return MISS on first request', async () => {
    const res = await request(app).get('/api/v1/reports/sales?...');
    expect(res.headers['x-cache-status']).toBe('MISS');
  });
  
  it('should return HIT on second request within TTL', async () => {
    await request(app).get('/api/v1/reports/sales?...');
    const res = await request(app).get('/api/v1/reports/sales?...');
    expect(res.headers['x-cache-status']).toBe('HIT');
  });
  
  it('should invalidate cache on order creation', async () => {
    await request(app).get('/api/v1/reports/sales?...');
    await Order.create({ ... });
    const res = await request(app).get('/api/v1/reports/sales?...');
    expect(res.headers['x-cache-status']).toBe('MISS');
  });
});
```

---

## Related Documentation

- [Task 18.3 Implementation Summary](../TASK-18-PERFORMANCE-OPTIMIZATION-SUMMARY.md)
- [Order Index Reference](./ORDER-INDEXES-REFERENCE.md)
- [Advanced Reporting Design](../.kiro/specs/advanced-reporting/design.md)

---

**Status:** Documentation complete, implementation pending  
**Next Steps:** 
1. Provision Redis instance
2. Implement Phase 1 (basic caching)
3. Monitor metrics and tune TTL values
4. Roll out Phase 2 (smart invalidation)

**Last Updated:** 2026-08-15  
**Task:** 18.3 - X-Cache-Status Header

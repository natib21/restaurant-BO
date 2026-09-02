/**
 * @file src/common/middleware/metrics.middleware.js
 * @description Performance monitoring middleware - tracks request metrics
 * 
 * Metrics collected:
 * - Request count (by status, method, route)
 * - Response time (avg, p50, p95, p99)
 * - Error rate
 * - Active requests
 * - Slow requests (>1s)
 */

const logger = require('../../../utils/logger');

// In-memory metrics store (consider Redis for multi-instance deployments)
const metrics = {
  requests: {
    total: 0,
    byStatus: {},
    byMethod: {},
    byRoute: {},
  },
  responseTimes: [],
  errors: {
    total: 0,
    byType: {},
    recent: [], // Last 100 errors
  },
  activeRequests: 0,
  slowRequests: [],
  startTime: Date.now(),
};

// Keep only last 1000 response times to prevent memory leak
const MAX_RESPONSE_TIMES = 1000;
const MAX_RECENT_ERRORS = 100;
const MAX_SLOW_REQUESTS = 50;
const SLOW_REQUEST_THRESHOLD = 1000; // 1 second

/**
 * Calculate percentile from sorted array
 */
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const index = Math.ceil((arr.length * p) / 100) - 1;
  return arr[Math.max(0, Math.min(index, arr.length - 1))];
}

/**
 * Get aggregated metrics
 */
function getMetrics() {
  const sortedTimes = [...metrics.responseTimes].sort((a, b) => a - b);
  const uptime = (Date.now() - metrics.startTime) / 1000;
  
  return {
    uptime_seconds: Math.round(uptime),
    requests: {
      total: metrics.requests.total,
      per_second: (metrics.requests.total / uptime).toFixed(2),
      by_status: metrics.requests.byStatus,
      by_method: metrics.requests.byMethod,
      by_route: Object.entries(metrics.requests.byRoute)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20) // Top 20 routes
        .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {}),
    },
    response_time_ms: {
      samples: metrics.responseTimes.length,
      avg: sortedTimes.length ? Math.round(sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length) : 0,
      min: sortedTimes.length ? sortedTimes[0] : 0,
      max: sortedTimes.length ? sortedTimes[sortedTimes.length - 1] : 0,
      p50: percentile(sortedTimes, 50),
      p95: percentile(sortedTimes, 95),
      p99: percentile(sortedTimes, 99),
    },
    errors: {
      total: metrics.errors.total,
      rate: ((metrics.errors.total / metrics.requests.total) * 100).toFixed(2) + '%',
      by_type: metrics.errors.byType,
      recent: metrics.errors.recent.slice(-10), // Last 10 errors
    },
    active_requests: metrics.activeRequests,
    slow_requests: {
      count: metrics.slowRequests.length,
      threshold_ms: SLOW_REQUEST_THRESHOLD,
      recent: metrics.slowRequests.slice(-10),
    },
  };
}

/**
 * Reset metrics (useful for testing or periodic resets)
 */
function resetMetrics() {
  metrics.requests.total = 0;
  metrics.requests.byStatus = {};
  metrics.requests.byMethod = {};
  metrics.requests.byRoute = {};
  metrics.responseTimes = [];
  metrics.errors.total = 0;
  metrics.errors.byType = {};
  metrics.errors.recent = [];
  metrics.activeRequests = 0;
  metrics.slowRequests = [];
  metrics.startTime = Date.now();
  
  logger.info('metrics.reset', { timestamp: new Date().toISOString() });
}

/**
 * Metrics collection middleware
 */
function metricsMiddleware(req, res, next) {
  const startTime = Date.now();
  metrics.activeRequests++;

  // Normalize route for grouping (replace IDs with :id)
  const normalizedRoute = req.route?.path
    ? `${req.method} ${req.baseUrl}${req.route.path}`
    : `${req.method} ${req.path}`.replace(/\/[a-f0-9]{24}/g, '/:id').replace(/\/\d+/g, '/:id');

  // Track response
  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - startTime;
    
    // Update metrics
    metrics.requests.total++;
    metrics.activeRequests--;
    
    // By status
    const statusCode = res.statusCode;
    metrics.requests.byStatus[statusCode] = (metrics.requests.byStatus[statusCode] || 0) + 1;
    
    // By method
    metrics.requests.byMethod[req.method] = (metrics.requests.byMethod[req.method] || 0) + 1;
    
    // By route
    metrics.requests.byRoute[normalizedRoute] = (metrics.requests.byRoute[normalizedRoute] || 0) + 1;
    
    // Response time
    metrics.responseTimes.push(duration);
    if (metrics.responseTimes.length > MAX_RESPONSE_TIMES) {
      metrics.responseTimes.shift();
    }
    
    // Track errors (4xx, 5xx)
    if (statusCode >= 400) {
      metrics.errors.total++;
      
      const errorType = statusCode >= 500 ? '5xx_server_error' : '4xx_client_error';
      metrics.errors.byType[errorType] = (metrics.errors.byType[errorType] || 0) + 1;
      
      // Store recent error details
      const errorDetail = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        status: statusCode,
        duration_ms: duration,
        merchant: req.merchantId?.toString(),
        user: req.user?.id?.toString(),
      };
      
      metrics.errors.recent.push(errorDetail);
      if (metrics.errors.recent.length > MAX_RECENT_ERRORS) {
        metrics.errors.recent.shift();
      }
      
      // Log error with context
      logger.warn('request.error', errorDetail);
    }
    
    // Track slow requests
    if (duration > SLOW_REQUEST_THRESHOLD) {
      const slowRequest = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        duration_ms: duration,
        merchant: req.merchantId?.toString(),
      };
      
      metrics.slowRequests.push(slowRequest);
      if (metrics.slowRequests.length > MAX_SLOW_REQUESTS) {
        metrics.slowRequests.shift();
      }
      
      logger.warn('request.slow', slowRequest);
    }
    
    // Log request completion
    if (process.env.LOG_ALL_REQUESTS === 'true' || statusCode >= 400) {
      logger.info('request.complete', {
        method: req.method,
        path: req.path,
        status: statusCode,
        duration_ms: duration,
        merchant: req.merchantId?.toString(),
        user: req.user?.id?.toString(),
      });
    }
    
    return originalSend.call(this, data);
  };

  next();
}

/**
 * Metrics endpoint - returns aggregated metrics as JSON
 */
function metricsEndpoint(req, res) {
  res.json(getMetrics());
}

/**
 * Prometheus-compatible metrics endpoint
 */
function prometheusMetricsEndpoint(req, res) {
  const m = getMetrics();
  
  // Format metrics in Prometheus text format
  const lines = [
    '# HELP restaurant_bo_requests_total Total number of HTTP requests',
    '# TYPE restaurant_bo_requests_total counter',
    `restaurant_bo_requests_total ${m.requests.total}`,
    '',
    '# HELP restaurant_bo_request_duration_seconds HTTP request duration',
    '# TYPE restaurant_bo_request_duration_seconds summary',
    `restaurant_bo_request_duration_seconds{quantile="0.5"} ${m.response_time_ms.p50 / 1000}`,
    `restaurant_bo_request_duration_seconds{quantile="0.95"} ${m.response_time_ms.p95 / 1000}`,
    `restaurant_bo_request_duration_seconds{quantile="0.99"} ${m.response_time_ms.p99 / 1000}`,
    `restaurant_bo_request_duration_seconds_sum ${(m.response_time_ms.avg * m.response_time_ms.samples) / 1000}`,
    `restaurant_bo_request_duration_seconds_count ${m.response_time_ms.samples}`,
    '',
    '# HELP restaurant_bo_errors_total Total number of errors',
    '# TYPE restaurant_bo_errors_total counter',
    `restaurant_bo_errors_total ${m.errors.total}`,
    '',
    '# HELP restaurant_bo_active_requests Current number of active requests',
    '# TYPE restaurant_bo_active_requests gauge',
    `restaurant_bo_active_requests ${m.active_requests}`,
    '',
    '# HELP restaurant_bo_uptime_seconds Server uptime in seconds',
    '# TYPE restaurant_bo_uptime_seconds counter',
    `restaurant_bo_uptime_seconds ${m.uptime_seconds}`,
  ];
  
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(lines.join('\n'));
}

module.exports = {
  metricsMiddleware,
  metricsEndpoint,
  prometheusMetricsEndpoint,
  getMetrics,
  resetMetrics,
};

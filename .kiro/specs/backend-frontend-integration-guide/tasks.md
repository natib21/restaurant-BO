# Implementation Plan: Backend Analysis & Frontend Integration Guide

## Overview

This implementation plan outlines the tasks required to complete the **Backend Analysis & Frontend Integration Guide** by performing deep code-level audits of all backend modules and documenting them with evidence-based API integration instructions. All tasks involve inspecting actual source code files, extracting API contracts, and creating comprehensive documentation.

The work is organized into logical groups: completing endpoint documentation for each module, analyzing real-time notifications, documenting system architecture, identifying gaps, and creating frontend integration guides.

## Tasks

- [ ] 1. Complete Merchant Management Module Documentation
  - [-] 1.1 Document remaining merchant CRUD endpoints (POST, PATCH, DELETE)
    - Inspect `src/modules/merchants/merchants.routes.js` and controller
    - Document request/response schemas with evidence
    - Document file upload middleware (uploadMerchantPhotos, processMerchantMedia)
    - Document KYC workflow endpoints (approve, reject, request-info)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_
  - [~] 1.2 Document merchant lifecycle management endpoints
    - Document suspend, activate, and status transition flows
    - Document merchant statistics endpoint structure
    - Document merchant-scoped role and user management endpoints
    - _Requirements: 2.3, 2.4, 2.5_

- [ ] 2. Complete Branch Management Module Documentation
  - [-] 2.1 Document all branch CRUD endpoints
    - Inspect `src/modules/branches/branches.routes.js` and controller
    - Document public endpoints (GET /nearby, GET /:id)
    - Document branch lifecycle (suspend, activate, setFeatures)
    - Document branch-scoped sub-resources (menu-groups, staff)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  - [~] 2.2 Document QR code regeneration for tables
    - Document POST /branches/:id/regenerate-qr endpoint
    - Document request/response structure
    - Document capability guard requirements
    - _Requirements: 3.4_

- [ ] 3. Complete Table Management & Staff Assignment Documentation
  - [-] 3.1 Document table CRUD and status management endpoints
    - Inspect `src/modules/tables/table.routes.js` and controller
    - Document table status transitions and valid values
    - Document table change endpoint (move customers between tables)
    - Document QR regeneration for individual tables
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [~] 3.2 Document staff-to-table assignment workflows
    - Inspect staff assignment routes and controller
    - Document assignment, unassignment, and query endpoints
    - Document assignment history tracking
    - _Requirements: 4.5, 4.6, 4.7_

- [ ] 4. Complete Session Management Module Documentation
  - [-] 4.1 Document QR table session lifecycle endpoints
    - Inspect `src/modules/sessions/session.routes.js` and controller
    - Document public session start endpoint (QR scan flow)
    - Document customer account linking endpoint
    - Document staff session management (getAllSessions, getSessionByTable)
    - Document table freeing endpoint
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [~] 4.2 Document session authentication mechanisms
    - Document protectTableSession guard implementation
    - Document session token format and expiration
    - Document distinction between anonymous and linked sessions
    - _Requirements: 5.5, 5.6, 5.7_

- [ ] 5. Complete Menu Management Module Documentation
  - [ ] 5.1 Document public menu browsing endpoints
    - Inspect `src/modules/menu/menus.routes.js` and controller
    - Document GET /public, /public/beverages, /public/food, /public/search
    - Document query parameters and filtering capabilities
    - _Requirements: 6.1_
  - [~] 5.2 Document staff menu CRUD and availability endpoints
    - Document menu item creation, update, deletion
    - Document availability toggle endpoint
    - Document image upload middleware (uploadMenuPhoto, resizeAndProcessImages)
    - _Requirements: 6.2, 6.3, 6.8_
  - [~] 5.3 Document menu publishing and lifecycle endpoints
    - Document publishMenuGroup endpoint
    - Document archiveMenuItem endpoint
    - Document menu publication history
    - _Requirements: 6.4, 6.9_
  - [~] 5.4 Document menu group and combo management
    - Document menu group CRUD endpoints
    - Document branch menu group assignment
    - Document combo management endpoints
    - _Requirements: 6.5, 6.6, 6.7_

- [ ] 6. Complete Order Management Module Documentation
  - [~] 6.1 Document customer order placement flow
    - Inspect `src/modules/orders/orders.routes.js` and controller
    - Document POST / with table session authentication
    - Document request schema validation (Zod)
    - Document response structure with order details
    - _Requirements: 7.1_
  - [~] 6.2 Document staff order placement and management
    - Document POST /staff endpoint
    - Document order retrieval endpoints (getOrderById, getOrderByNumber, getActiveOrders)
    - Document filtering and pagination parameters
    - _Requirements: 7.2, 7.7, 7.8_
  - [~] 6.3 Document order status management
    - Document status query endpoints (pending, accepted, preparing, ready, served, canceled, completed)
    - Document PATCH /:id/status with valid status transitions
    - Document add items endpoint (PATCH /:id/add-items)
    - _Requirements: 7.3, 7.4, 7.6_
  - [~] 6.4 Document payment processing endpoint
    - Document POST /:id/pay with image upload requirements
    - Document payment proof validation
    - Document order summary statistics in response
    - _Requirements: 7.5, 7.9_

- [ ] 7. Complete Customer Management Module Documentation
  - [~] 7.1 Document customer table session authentication
    - Inspect `src/modules/customers/customers.routes.js` and controller
    - Document POST /login for table session customer login
    - Document protectTableSession and protectCustomer guards
    - Document distinction between session auth and staff JWT auth
    - _Requirements: 8.1, 8.7, 8.8_
  - [~] 7.2 Document customer self-service endpoints
    - Document GET /me, PATCH /me, GET /my-orders
    - Document POST /gift/claim endpoint
    - _Requirements: 8.2, 8.3_
  - [~] 7.3 Document staff CRM endpoints
    - Document getAllCustomers, getCustomer endpoints
    - Document POST /:id/gift (gift giving)
    - Document customer tagging and note endpoints
    - _Requirements: 8.4, 8.5, 8.6_

- [ ] 8. Complete Inventory Management Module Documentation
  - [~] 8.1 Document ingredient management endpoints
    - Inspect `src/modules/inventory/` routes and controllers
    - Document ingredient CRUD with request/response schemas
    - Document unit types and validation
    - _Requirements: 9.1_
  - [~] 8.2 Document recipe management endpoints
    - Document recipe CRUD including ingredient quantity mappings
    - Document recipe-menu item associations
    - _Requirements: 9.2_
  - [~] 8.3 Document supplier and purchase order management
    - Document supplier CRUD with payment terms enums
    - Document purchase order creation and receive workflow
    - _Requirements: 9.3, 9.4_
  - [~] 8.4 Document stock management endpoints
    - Document stock adjustment endpoints (adjust, batch-adjust)
    - Document stock movement audit log
    - Document stock threshold configuration
    - _Requirements: 9.5, 9.6, 9.9_
  - [~] 8.5 Document inventory analytics endpoints
    - Document inventory valuation endpoint
    - Document low stock alerts endpoint
    - Document pre-order stock validation endpoint
    - Document feature guard requirements
    - _Requirements: 9.7, 9.8, 9.10, 9.11_

- [ ] 9. Complete Analytics & Reports Module Documentation
  - [~] 9.1 Document dashboard endpoint structure
    - Inspect `src/modules/analytics/analytics.routes.js` and controller
    - Document GET /dashboard with all returned metrics
    - Document revenue breakdown by period (today, week, month, quarter, year)
    - Document top foods aggregation
    - Document VIP customers aggregation
    - Document customer growth metrics
    - Document branch filtering capability
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
  - [~] 9.2 Document direct messaging endpoint
    - Document POST /messages endpoint (Telegram integration)
    - Document analytics feature guard requirements
    - _Requirements: 10.7, 10.8_
  - [~] 9.3 Audit and document reports availability
    - Search codebase for order reports, transaction reports, sales reports
    - Identify implemented vs planned reports
    - Document existing report endpoints with evidence
    - Mark missing reports as NOT IMPLEMENTED
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 10. Complete Subscriptions & Feature Access Documentation
  - [~] 10.1 Document subscription lifecycle endpoints
    - Inspect `src/modules/subscriptions/subscriptions.routes.js` and controller
    - Document POST /initiate with plan details
    - Document POST /verify for payment verification
    - Document GET /status endpoint
    - Document POST /renew endpoint
    - _Requirements: 11.1, 11.2, 11.3, 11.6_
  - [~] 10.2 Document trial and feature access endpoints
    - Document POST /trial endpoint
    - Document POST /check-feature endpoint
    - Document GET /catalog (feature catalog)
    - _Requirements: 11.4, 11.5, 11.7_
  - [~] 10.3 Document payment provider webhook integration
    - Document POST /webhook/:provider endpoint
    - Document supported providers (Chapa, etc.)
    - Document webhook signature verification
    - _Requirements: 11.8_
  - [~] 10.4 Document admin subscription monitoring
    - Document admin endpoints (expiring-soon, stats)
    - Document feature guard middleware (requireFeature) behavior
    - Document subscription plan structure and feature mappings
    - _Requirements: 11.9, 11.10, 11.11_

- [~] 11. Checkpoint - Review progress and ask user for feedback
  - Ensure all module documentation is accurate and evidence-based
  - Ask user if questions or concerns arise

- [ ] 12. Deep Dive: Real-Time Notifications Architecture
  - [~] 12.1 Document Socket.IO server setup and authentication
    - Inspect `src/infrastructure/websocket/socket-server.js`
    - Document connection authentication (token in auth, cookies, headers)
    - Document socket session setup event (setup:session with branchId)
    - Document permission-based room joining patterns
    - _Requirements: 12.1, 12.2, 12.3_
  - [~] 12.2 Document Outbox Pattern implementation
    - Inspect `models/OutboxEvent.js`
    - Inspect Outbox service and worker implementation
    - Document event persistence and reliable delivery mechanism
    - Document retry logic and failure handling
    - _Requirements: 12.9_
  - [~] 12.3 Document order real-time events
    - Inspect `src/modules/notifications/events/order-realtime-events.js`
    - Document order:create, order:status-updated, order-paid, order-canceled events
    - Document event payload structures
    - Document room targeting (branch:ID, merchant:ID, user:ID)
    - _Requirements: 12.4, 12.10_
  - [~] 12.4 Document inventory real-time events
    - Inspect inventory notification event handlers
    - Document inventory:stock-updated, inventory:low-stock-alert events
    - Document inventory:subscribe event with merchantId
    - Document event payload structures
    - _Requirements: 12.5, 12.8, 12.10_
  - [~] 12.5 Document additional real-time event types
    - Document notification broadcast events
    - Document table sync events
    - Document room naming conventions (branch:ID:perm:TASK)
    - _Requirements: 12.6, 12.7, 12.11_

- [ ] 13. Complete System Integrity Module Documentation
  - [~] 13.1 Document integrity report endpoint
    - Inspect `src/modules/integrity/integrity.routes.js` and controller
    - Document GET /system/integrity/report
    - Document merchantId scoping and domains query parameters
    - Document SUPER-ADMIN access requirement
    - Document integrity report structure (summary, issues by domain, metadata)
    - Document available audit domains (structure, branch, menu, table, rbac, notifications, data)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

- [ ] 14. Complete File Management Module Documentation
  - [~] 14.1 Document file upload and retrieval endpoints
    - Inspect `src/modules/files/file.routes.js` and controller
    - Document POST /upload with multipart/form-data requirements
    - Document GET /:id/content as public endpoint
    - Document GET /entity for entity file listing
    - Document DELETE /:id endpoint
    - _Requirements: 14.1, 14.2, 14.3, 14.4_
  - [~] 14.2 Document file management constraints
    - Document file capability guard (FILE_MANAGE) requirements
    - Document FileAsset model structure
    - Document supported file types and size limits
    - _Requirements: 14.5, 14.6, 14.7_

- [ ] 15. Complete User Management Module Documentation
  - [~] 15.1 Document user CRUD endpoints
    - Inspect `src/modules/users/users.routes.js` and controller
    - Document self-service endpoints (GET /me, PATCH /me, DELETE /me)
    - Document admin CRUD endpoints
    - Document user filtering and pagination capabilities
    - Document user activation workflow
    - Document user-role association
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [ ] 16. Complete RBAC Module Documentation
  - [~] 16.1 Document role and task management endpoints
    - Inspect `src/modules/roles/roles.routes.js` and controller
    - Document system role CRUD endpoints (SUPER-ADMIN only)
    - Document task CRUD endpoints
    - Document role-task association structure
    - Document merchant-scoped role endpoints vs system role endpoints
    - Document restrictTo() middleware behavior with task-based authorization
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

- [ ] 17. Document Middleware Pipeline Architecture
  - [~] 17.1 Complete middleware pipeline documentation
    - Inspect `src/app/create-app.js`
    - Document complete middleware execution order (trust proxy → CORS → helmet → rate limiters → body parser → security → request context → branch context → response helpers → logging → routes → error handler)
    - Document request context (req.ctx) structure for staff JWT vs table session
    - _Requirements: 18.1, 18.2_
  - [~] 17.2 Document tenant scope and response utilities
    - Inspect `src/common/utils/` tenant scope helpers
    - Document getMerchantId, resolveStaffBranchId utility functions
    - Document response helper methods (res.sendSuccess, res.sendError, res.sendList)
    - Document global error handler behavior
    - _Requirements: 18.3, 18.4, 18.5_

- [ ] 18. Document API Error Handling & Response Formats
  - [~] 18.1 Document standard response formats
    - Inspect error handling utilities
    - Document standard success response format ({ status, data, message?, meta? })
    - Document standard error response format ({ status, statusCode, message, errors? })
    - Document common HTTP status codes (200, 201, 204, 400, 401, 403, 404, 409, 500)
    - _Requirements: 19.1, 19.2, 19.3_
  - [~] 18.2 Document validation and rate limit error structures
    - Document validation error structure with field-level errors
    - Document rate limit error responses
    - _Requirements: 19.4, 19.5_

- [ ] 19. Document Environment Configuration & Deployment
  - [~] 19.1 Document environment configuration requirements
    - Inspect `.env.example` and `src/config/env.js`
    - Document all required environment variables
    - Document CORS origin configuration
    - Document API base URL structure (local vs staging vs production)
    - Document rate limit configurations
    - _Requirements: 20.1, 20.2, 20.3, 20.4_
  - [~] 19.2 Document Socket.IO and database configuration
    - Document Socket.IO connection URL and CORS settings
    - Document MongoDB connection requirements
    - Document JWT secret and token expiration settings
    - _Requirements: 20.5, 20.6, 20.7_

- [~] 20. Checkpoint - Review all documentation sections
  - Ensure all evidence references are accurate (file paths and line numbers)
  - Ensure no invented API contracts
  - Ask user if questions or concerns arise

- [ ] 21. Analyze and Document Missing & Incomplete Functionality
  - [~] 21.1 Identify partially implemented modules
    - Review all documented endpoints for validation schema gaps
    - Review all documented endpoints for error handling gaps
    - List specific missing endpoints per module
    - _Requirements: 21.1, 21.2, 21.3_
  - [~] 21.2 Identify missing real-time events and feature gates
    - Identify missing real-time event types for existing features
    - Identify missing subscription feature gates on existing endpoints
    - _Requirements: 21.4, 21.5_
  - [~] 21.3 Create prioritized gap list
    - Categorize gaps by priority (Critical, High, Medium, Low)
    - Provide recommendations for each gap
    - _Requirements: 21.6_

- [ ] 22. Create Feature Availability Matrix
  - [~] 22.1 Generate comprehensive feature matrix table
    - Create table with columns (Module, Feature, Status, Endpoint Count, Evidence, Notes)
    - Categorize each feature as Implemented, Partially Implemented, or Not Implemented
    - Provide evidence references (file paths and line numbers)
    - List specific gaps for Partially Implemented features
    - Provide recommendations for Not Implemented features
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

- [ ] 23. Create Frontend Integration Architecture Recommendations
  - [~] 23.1 Design API client architecture
    - Suggest folder structure for API integration layer
    - Recommend API client library (axios, fetch wrapper)
    - Design authentication interceptor pattern
    - Design error handling and retry logic
    - _Requirements: 22.1, 22.2, 22.3_
  - [~] 23.2 Design state management integration
    - Recommend React Query setup for server state
    - Design query key structure
    - Design cache invalidation strategies
    - Design optimistic update patterns
    - _Requirements: 22.2, 22.3_

- [ ] 24. Create JavaScript Integration Examples
  - [~] 24.1 Write authentication flow example
    - Provide complete signup → login → store JWT → make authenticated request
    - Use JavaScript with fetch API or axios
    - Include error handling
    - _Requirements: 22.1_
  - [~] 24.2 Write customer ordering flow example
    - Provide QR scan → start session → browse menu → place order → Socket.IO status updates
    - Use JavaScript with Socket.IO client
    - Include error handling
    - _Requirements: 22.2_
  - [~] 24.3 Write staff order management flow example
    - Provide JWT auth → view pending orders → update status → mark as paid
    - Include API calls and response handling
    - _Requirements: 22.3_

- [ ] 25. Create React Query Integration Guide
  - [~] 25.1 Document query patterns
    - Provide React Query setup code
    - Document query key conventions
    - Provide examples for GET endpoints (useQuery)
    - _Requirements: 22.2_
  - [~] 25.2 Document mutation patterns
    - Provide examples for POST/PATCH/DELETE endpoints (useMutation)
    - Document optimistic updates for orders
    - Document cache invalidation strategies
    - _Requirements: 22.2, 22.3_

- [ ] 26. Create Socket.IO Integration Guide
  - [~] 26.1 Document Socket.IO client setup
    - Provide connection initialization code
    - Document authentication (token in auth object)
    - Document connection error handling
    - _Requirements: 22.4_
  - [~] 26.2 Document room setup and event handling
    - Provide setup:session event example
    - Provide event listener registration examples
    - Document all event types with payload structures
    - Document disconnection and reconnection handling
    - _Requirements: 22.4_

- [ ] 27. Create Final Frontend Integration Checklist
  - [~] 27.1 Write step-by-step integration checklist
    - Environment setup (API base URL, Socket.IO URL)
    - Authentication setup (JWT storage, interceptors)
    - API client setup (axios instance, error handling)
    - React Query setup (QueryClient, providers)
    - Socket.IO setup (connection, authentication, event listeners)
    - Feature flag integration (read merchant.features)
    - Error handling patterns (toast notifications, form errors)
    - Testing recommendations (mock API, test Socket.IO events)
    - _Requirements: 22.1, 22.2, 22.3, 22.4_

- [~] 28. Final Checkpoint - Comprehensive accuracy check
  - Verify all endpoints against actual source code
  - Verify all evidence references (file paths and line numbers)
  - Verify no invented API contracts or assumptions
  - Verify all claims supported by code inspection
  - Ask user for final review and approval

## Notes

- All tasks involve inspecting actual source code files and documenting findings with evidence
- No code implementation is required - this is pure documentation work
- Each task must provide file paths and line numbers as evidence
- Mark any missing functionality as `NOT IMPLEMENTED` with clear notes
- Mark any incomplete functionality as `PARTIALLY IMPLEMENTED` with specific gaps
- All API contracts must be derived from actual code, not assumptions
- Checkpoint tasks ensure incremental validation and user feedback

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": [
        "1.1",
        "2.1",
        "3.1",
        "4.1",
        "5.1",
        "7.1",
        "8.1",
        "9.1",
        "10.1",
        "13.1",
        "14.1",
        "15.1",
        "16.1"
      ]
    },
    {
      "id": 1,
      "tasks": [
        "1.2",
        "2.2",
        "3.2",
        "4.2",
        "5.2",
        "6.1",
        "7.2",
        "8.2",
        "9.2",
        "10.2",
        "12.1",
        "14.2",
        "17.1",
        "18.1",
        "19.1"
      ]
    },
    {
      "id": 2,
      "tasks": [
        "5.3",
        "5.4",
        "6.2",
        "6.3",
        "7.3",
        "8.3",
        "8.4",
        "9.3",
        "10.3",
        "12.2",
        "12.3",
        "17.2",
        "18.2",
        "19.2"
      ]
    },
    {
      "id": 3,
      "tasks": ["6.4", "8.5", "10.4", "12.4", "12.5"]
    },
    {
      "id": 4,
      "tasks": ["21.1", "21.2"]
    },
    {
      "id": 5,
      "tasks": ["21.3", "22.1"]
    },
    {
      "id": 6,
      "tasks": ["23.1", "23.2"]
    },
    {
      "id": 7,
      "tasks": ["24.1", "24.2", "24.3", "25.1", "26.1"]
    },
    {
      "id": 8,
      "tasks": ["25.2", "26.2"]
    },
    {
      "id": 9,
      "tasks": ["27.1"]
    }
  ]
}
```

# Requirements Document

## Introduction

This document specifies the requirements for a comprehensive **Backend Analysis & Frontend Integration Guide** for the Restaurant SaaS platform. The system is a multi-tenant Restaurant Management System built with Node.js/Express/MongoDB backend, following a modular architecture under `src/modules/*`.

The guide will enable frontend developers to understand the complete backend API surface, including all features, endpoints, authentication requirements, request/response structures, and real-time notification flows.

## Glossary

- **Backend_System**: The Node.js/Express/MongoDB REST API server located at `c:\Users\HP\Dev\projects\Restaurant_App\restaurant-BO`
- **Integration_Guide**: The comprehensive markdown documentation that maps all backend features to frontend integration instructions
- **Module**: A self-contained domain under `src/modules/*` containing routes, controllers, services, and validators
- **Endpoint**: An HTTP API route (e.g., `POST /api/v1/orders`)
- **Feature**: A business capability (e.g., Order Management, Inventory, Analytics)
- **Merchant**: A restaurant business entity in the multi-tenant system
- **Branch**: A physical restaurant location belonging to a Merchant
- **Session**: A QR code-based table session created when customers scan table QR codes
- **Outbox_Pattern**: An event-driven architecture pattern using the OutboxEvent model for reliable real-time notifications
- **RBAC**: Role-Based Access Control using tasks and permissions
- **JWT**: JSON Web Token used for authentication
- **Socket.IO**: Real-time bidirectional event-based communication library
- **Feature_Guard**: Middleware that checks if a merchant's subscription includes access to a specific feature

## Requirements

### Requirement 1: Analyze Authentication & Authorization Module

**User Story:** As a frontend developer, I want to understand authentication flows, so that I can implement login, signup, and protected route access.

#### Acceptance Criteria

1. THE Integration_Guide SHALL document all public authentication endpoints (signup, login, logout, forgot-password, reset-password)
2. THE Integration_Guide SHALL document all protected authentication endpoints (change-password, me)
3. THE Integration_Guide SHALL document JWT token format, storage requirements (cookies vs headers), and refresh mechanisms
4. THE Integration_Guide SHALL document RBAC structure including roles, tasks, and permissions
5. THE Integration_Guide SHALL document authentication middleware pipeline (protect, restrictTo, requireCapability, requireFeature)
6. THE Integration_Guide SHALL document request/response schemas for each authentication endpoint
7. THE Integration_Guide SHALL document error response formats for authentication failures

### Requirement 2: Analyze Merchant Management Module

**User Story:** As a frontend developer, I want to understand merchant operations, so that I can build merchant onboarding, profile management, and admin interfaces.

#### Acceptance Criteria

1. THE Integration_Guide SHALL document all merchant CRUD endpoints with request/response schemas
2. THE Integration_Guide SHALL document KYC onboarding workflow including file upload requirements
3. THE Integration_Guide SHALL document merchant lifecycle endpoints (approve, suspend, activate)
4. THE Integration_Guide SHALL document merchant-scoped role management endpoints
5. THE Integration_Guide SHALL document merchant-scoped user management endpoints
6. THE Integration_Guide SHALL document merchant self-service endpoints (/me, PATCH /me)
7. THE Integration_Guide SHALL document merchant statistics endpoint structure
8. THE Integration_Guide SHALL document file upload middleware (uploadMerchantPhotos, processMerchantMedia) requirements

### Requirement 3: Analyze Branch Management Module

**User Story:** As a frontend developer, I want to understand branch operations, so that I can build multi-location restaurant management interfaces.

#### Acceptance Criteria

1. THE Integration_Guide SHALL document all branch CRUD endpoints with request/response schemas
2. THE Integration_Guide SHALL document public branch endpoints (GET /nearby, GET /:id)
3. THE Integration_Guide SHALL document branch lifecycle endpoints (suspend, activate, setFeatures)
4. THE Integration_Guide SHALL document QR code regeneration endpoint for tables
5. THE Integration_Guide SHALL document branch-scoped sub-resource endpoints (menu-groups, staff)
6. THE Integration_Guide SHALL document capability-based access control for branch management
7. THE Integration_Guide SHALL document branch context enrichment middleware behavior

### Requirement 4: Analyze Table Management & Assignment Module

**User Story:** As a frontend developer, I want to understand table and staff assignment operations, so that I can build table management and assignment interfaces.

#### Acceptance Criteria

1. THE Integration_Guide SHALL document all table CRUD endpoints with request/response schemas
2. THE Integration_Guide SHALL document table status transition endpoints and valid status values
3. THE Integration_Guide SHALL document table QR code regeneration endpoint
4. THE Integration_Guide SHALL document table change endpoint for moving customers between tables
5. THE Integration_Guide SHALL document staff-to-table assignment endpoints
6. THE Integration_Guide SHALL document current assignment query endpoints
7. THE Integration_Guide SHALL document assignment history and end assignment endpoints

### Requirement 5: Analyze Session Management Module

**User Story:** As a frontend developer, I want to understand QR table session workflows, so that I can build customer-facing QR menu ordering features.

#### Acceptance Criteria

1. THE Integration_Guide SHALL document public session start endpoint (QR scan flow)
2. THE Integration_Guide SHALL document customer account linking endpoint
3. THE Integration_Guide SHALL document staff session management endpoints (getAllSessions, getSessionByTable)
4. THE Integration_Guide SHALL document table freeing endpoint
5. THE Integration_Guide SHALL document session authentication (protectTableSession guard) requirements
6. THE Integration_Guide SHALL document session token format and expiration rules
7. THE Integration_Guide SHALL document distinction between anonymous sessions and linked customer sessions

### Requirement 6: Analyze Menu Management Module

**User Story:** As a frontend developer, I want to understand menu operations, so that I can build menu browsing, editing, and publishing interfaces.

#### Acceptance Criteria

1. THE Integration_Guide SHALL document all public menu endpoints (GET /public, /public/beverages, /public/food, /public/search)
2. THE Integration_Guide SHALL document all staff menu CRUD endpoints
3. THE Integration_Guide SHALL document menu item availability toggle endpoint
4. THE Integration_Guide SHALL document menu publishing lifecycle (publishMenuGroup, archiveMenuItem)
5. THE Integration_Guide SHALL document menu group management endpoints
6. THE Integration_Guide SHALL document branch menu group assignment endpoints
7. THE Integration_Guide SHALL document combo management endpoints
8. THE Integration_Guide SHALL document menu image upload middleware (uploadMenuPhoto, resizeAndProcessImages) requirements
9. THE Integration_Guide SHALL document menu publication history endpoints

### Requirement 7: Analyze Order Management Module

**User Story:** As a frontend developer, I want to understand order operations, so that I can build customer ordering and staff order management interfaces.

#### Acceptance Criteria

1. THE Integration_Guide SHALL document customer order placement endpoint (POST /) with table session authentication
2. THE Integration_Guide SHALL document staff order placement endpoint (POST /staff)
3. THE Integration_Guide SHALL document order status query endpoints (pending, accepted, preparing, ready, served, canceled, completed)
4. THE Integration_Guide SHALL document order status transition endpoint (PATCH /:id/status) with valid status flow
5. THE Integration_Guide SHALL document payment endpoint (POST /:id/pay) with image upload requirements
6. THE Integration_Guide SHALL document add items to order endpoint (PATCH /:id/add-items)
7. THE Integration_Guide SHALL document order retrieval endpoints (getOrderById, getOrderByNumber, getActiveOrders)
8. THE Integration_Guide SHALL document order filtering and pagination query parameters
9. THE Integration_Guide SHALL document order summary statistics in completed orders response

### Requirement 8: Analyze Customer Management Module

**User Story:** As a frontend developer, I want to understand customer operations, so that I can build customer-facing self-service and staff CRM interfaces.

#### Acceptance Criteria

1. THE Integration_Guide SHALL document table session customer login endpoint (POST /login)
2. THE Integration_Guide SHALL document customer self-service endpoints (GET /me, PATCH /me, GET /my-orders)
3. THE Integration_Guide SHALL document customer gift claiming endpoint (POST /gift/claim)
4. THE Integration_Guide SHALL document staff CRM endpoints (getAllCustomers, getCustomer)
5. THE Integration_Guide SHALL document gift giving endpoint (POST /:id/gift)
6. THE Integration_Guide SHALL document customer tagging and note endpoints
7. THE Integration_Guide SHALL document customer authentication guards (protectTableSession, protectCustomer)
8. THE Integration_Guide SHALL document distinction between table session authentication and staff JWT authentication

### Requirement 9: Analyze Inventory Management Module

**User Story:** As a frontend developer, I want to understand inventory operations, so that I can build ingredient, recipe, stock, and supplier management interfaces.

#### Acceptance Criteria

1. THE Integration_Guide SHALL document all ingredient CRUD endpoints with request/response schemas
2. THE Integration_Guide SHALL document all recipe CRUD endpoints including ingredient quantity mappings
3. THE Integration_Guide SHALL document all supplier CRUD endpoints with payment terms enums
4. THE Integration_Guide SHALL document all purchase order endpoints including receive workflow
5. THE Integration_Guide SHALL document stock adjustment endpoints (adjust, batch-adjust)
6. THE Integration_Guide SHALL document stock movement audit log endpoint
7. THE Integration_Guide SHALL document inventory valuation endpoint
8. THE Integration_Guide SHALL document low stock alerts endpoint
9. THE Integration_Guide SHALL document stock threshold configuration endpoint
10. THE Integration_Guide SHALL document pre-order stock validation endpoint
11. THE Integration_Guide SHALL document inventory feature guard requirements

### Requirement 10: Analyze Analytics & Reports Module

**User Story:** As a frontend developer, I want to understand analytics operations, so that I can build dashboard, reports, and business intelligence interfaces.

#### Acceptance Criteria

1. THE Integration_Guide SHALL document dashboard endpoint (GET /dashboard) with all returned metrics
2. THE Integration_Guide SHALL document revenue breakdown by period (today, week, month, quarter, year)
3. THE Integration_Guide SHALL document top foods aggregation with quantity and revenue
4. THE Integration_Guide SHALL document VIP customers aggregation with spending and visit history
5. THE Integration_Guide SHALL document customer growth metrics (new vs returning)
6. THE Integration_Guide SHALL document branch filtering capability for all analytics queries
7. THE Integration_Guide SHALL document direct messaging endpoint (POST /messages)
8. THE Integration_Guide SHALL document analytics feature guard requirements

### Requirement 11: Analyze Subscriptions & Feature Access Module

**User Story:** As a frontend developer, I want to understand subscription workflows, so that I can build subscription purchase, verification, and feature gating interfaces.

#### Acceptance Criteria

1. THE Integration_Guide SHALL document subscription initiation endpoint (POST /initiate) with plan details
2. THE Integration_Guide SHALL document payment verification endpoint (POST /verify)
3. THE Integration_Guide SHALL document subscription status endpoint (GET /status)
4. THE Integration_Guide SHALL document trial subscription creation endpoint (POST /trial)
5. THE Integration_Guide SHALL document feature access check endpoint (POST /check-feature)
6. THE Integration_Guide SHALL document subscription renewal endpoint (POST /renew)
7. THE Integration_Guide SHALL document feature catalog endpoint (GET /catalog)
8. THE Integration_Guide SHALL document webhook endpoint for payment providers (POST /webhook/:provider)
9. THE Integration_Guide SHALL document admin subscription monitoring endpoints (expiring-soon, stats)
10. THE Integration_Guide SHALL document feature guard middleware (requireFeature) behavior
11. THE Integration_Guide SHALL document subscription plan structure and feature mappings

### Requirement 12: Analyze Real-Time Notifications Module

**User Story:** As a frontend developer, I want to understand real-time notification flows, so that I can implement Socket.IO connections and event handlers.

#### Acceptance Criteria

1. THE Integration_Guide SHALL document Socket.IO connection authentication (token in auth, cookies, or headers)
2. THE Integration_Guide SHALL document socket session setup event (setup:session with branchId)
3. THE Integration_Guide SHALL document permission-based room joining (branch:ID:perm:PERMISSION)
4. THE Integration_Guide SHALL document all order real-time events (order:create, order:status-updated, order-paid, order-canceled)
5. THE Integration_Guide SHALL document all inventory real-time events (inventory:stock-updated, inventory:low-stock-alert)
6. THE Integration_Guide SHALL document notification broadcast events
7. THE Integration_Guide SHALL document table sync events
8. THE Integration_Guide SHALL document inventory subscription event (inventory:subscribe with merchantId)
9. THE Integration_Guide SHALL document Outbox Pattern implementation (OutboxEvent model, OutboxService, OutboxWorker)
10. THE Integration_Guide SHALL document event payload structures for each event type
11. THE Integration_Guide SHALL document room naming conventions (branch:ID, merchant:ID, user:ID, branch:ID:perm:TASK)

### Requirement 13: Analyze System Integrity Module

**User Story:** As a frontend developer, I want to understand integrity audit operations, so that I can build system health monitoring interfaces.

#### Acceptance Criteria

1. THE Integration_Guide SHALL document integrity report endpoint (GET /system/integrity/report)
2. THE Integration_Guide SHALL document merchantId scoping query parameter
3. THE Integration_Guide SHALL document domains query parameter with valid domain list
4. THE Integration_Guide SHALL document SUPER-ADMIN access requirement
5. THE Integration_Guide SHALL document integrity report structure (summary, issues by domain, metadata)
6. THE Integration_Guide SHALL document available audit domains (structure, branch, menu, table, rbac, notifications, data)

### Requirement 14: Analyze File Management Module

**User Story:** As a frontend developer, I want to understand file operations, so that I can implement file uploads and downloads.

#### Acceptance Criteria

1. THE Integration_Guide SHALL document file upload endpoint (POST /upload) with multipart/form-data requirements
2. THE Integration_Guide SHALL document file retrieval endpoint (GET /:id/content) as public endpoint
3. THE Integration_Guide SHALL document entity file listing endpoint (GET /entity)
4. THE Integration_Guide SHALL document file deletion endpoint (DELETE /:id)
5. THE Integration_Guide SHALL document file capability guard (FILE_MANAGE) requirements
6. THE Integration_Guide SHALL document FileAsset model structure
7. THE Integration_Guide SHALL document supported file types and size limits

### Requirement 15: Analyze User Management Module

**User Story:** As a frontend developer, I want to understand user operations, so that I can build user profile and admin user management interfaces.

#### Acceptance Criteria

1. THE Integration_Guide SHALL document self-service user endpoints (GET /me, PATCH /me, DELETE /me)
2. THE Integration_Guide SHALL document admin user CRUD endpoints
3. THE Integration_Guide SHALL document user filtering and pagination capabilities
4. THE Integration_Guide SHALL document user activation workflow
5. THE Integration_Guide SHALL document user-role association

### Requirement 16: Analyze RBAC Module

**User Story:** As a frontend developer, I want to understand role and task management, so that I can build permission management interfaces.

#### Acceptance Criteria

1. THE Integration_Guide SHALL document system role CRUD endpoints (SUPER-ADMIN only)
2. THE Integration_Guide SHALL document task CRUD endpoints
3. THE Integration_Guide SHALL document role-task association structure
4. THE Integration_Guide SHALL document merchant-scoped role endpoints vs system role endpoints
5. THE Integration_Guide SHALL document restrictTo() middleware behavior with task-based authorization

### Requirement 17: Create Feature Availability Matrix

**User Story:** As a frontend developer, I want to see a complete feature matrix, so that I can quickly assess implementation status.

#### Acceptance Criteria

1. THE Integration_Guide SHALL include a Feature Availability Matrix table with columns (Module, Feature, Status, Endpoint Count, Notes)
2. THE Integration_Guide SHALL categorize each feature as Implemented, Partially Implemented, or Not Implemented
3. THE Integration_Guide SHALL provide evidence references (file paths and line numbers) for Implemented features
4. THE Integration_Guide SHALL list specific gaps for Partially Implemented features
5. THE Integration_Guide SHALL provide recommendations for Not Implemented features

### Requirement 18: Document Middleware Pipeline Architecture

**User Story:** As a frontend developer, I want to understand middleware execution order, so that I can predict request processing behavior.

#### Acceptance Criteria

1. THE Integration_Guide SHALL document the complete middleware pipeline from create-app.js (trust proxy → CORS → helmet → rate limiters → body parser → security → request context → branch context → response helpers → logging → routes → error handler)
2. THE Integration_Guide SHALL document request context (req.ctx) structure for staff JWT vs table session
3. THE Integration_Guide SHALL document tenant scope utility functions (getMerchantId, resolveStaffBranchId)
4. THE Integration_Guide SHALL document response helper methods (res.sendSuccess, res.sendError, res.sendList)
5. THE Integration_Guide SHALL document global error handler behavior

### Requirement 19: Document API Error Handling & Response Formats

**User Story:** As a frontend developer, I want to understand error formats, so that I can implement consistent error handling.

#### Acceptance Criteria

1. THE Integration_Guide SHALL document standard success response format ({ status, data, message?, meta? })
2. THE Integration_Guide SHALL document standard error response format ({ status, statusCode, message, errors? })
3. THE Integration_Guide SHALL document common HTTP status codes used (200, 201, 204, 400, 401, 403, 404, 409, 500)
4. THE Integration_Guide SHALL document validation error structure with field-level errors
5. THE Integration_Guide SHALL document rate limit error responses

### Requirement 20: Document Environment Configuration & Deployment

**User Story:** As a frontend developer, I want to understand backend configuration, so that I can set up local development and understand production behavior.

#### Acceptance Criteria

1. THE Integration_Guide SHALL document all required environment variables from .env.example
2. THE Integration_Guide SHALL document CORS origin configuration
3. THE Integration_Guide SHALL document API base URL structure (local vs staging vs production)
4. THE Integration_Guide SHALL document rate limit configurations (auth limiter vs API limiter)
5. THE Integration_Guide SHALL document Socket.IO connection URL and CORS settings
6. THE Integration_Guide SHALL document MongoDB connection requirements
7. THE Integration_Guide SHALL document JWT secret and token expiration settings

### Requirement 21: Document Missing & Incomplete Functionality

**User Story:** As a frontend developer, I want to know what's missing or incomplete, so that I can plan workarounds or coordinate with backend team.

#### Acceptance Criteria

1. THE Integration_Guide SHALL list all partially implemented modules with specific missing endpoints
2. THE Integration_Guide SHALL identify endpoints that exist but lack validation schemas
3. THE Integration_Guide SHALL identify endpoints that exist but lack proper error handling
4. THE Integration_Guide SHALL identify missing real-time event types for existing features
5. THE Integration_Guide SHALL identify missing subscription feature gates on existing endpoints
6. THE Integration_Guide SHALL provide prioritization recommendations (Critical, High, Medium, Low) for missing features

### Requirement 22: Create Quick Start Integration Examples

**User Story:** As a frontend developer, I want to see working code examples, so that I can quickly integrate with the backend.

#### Acceptance Criteria

1. THE Integration_Guide SHALL provide a complete authentication flow example (signup → login → store JWT → make authenticated request)
2. THE Integration_Guide SHALL provide a customer order placement flow example (QR scan → start session → browse menu → place order → Socket.IO status updates)
3. THE Integration_Guide SHALL provide a staff order management flow example (JWT auth → view pending orders → update status → mark as paid)
4. THE Integration_Guide SHALL provide a Socket.IO connection and event handling example
5. THE Integration_Guide SHALL provide examples in JavaScript (fetch API or axios)

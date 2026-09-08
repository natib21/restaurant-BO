# Route 3: POST /api/v1/menu/publish Migration

## Context

Routes 1 and 2 (GET /api/v1/menu/public and GET /api/v1/menu/staff) have been successfully migrated to the new MenuService layer. Route 3 is the publishing endpoint that transitions menu state from draft to published.

**CRITICAL DEPLOYMENT CONSTRAINT**: This route must remain in a feature branch or staging environment until the product owner resolves the tie-breaking decision documented in `PRODUCT-DECISION-TIE-BREAKING-BEHAVIOR.md`. Do not merge Route 3 changes to main or deploy to production until that document's status changes from "Pending Decision" to an approved resolution.

## Pre-Implementation Investigation Required

Before writing any code, map out the following touchpoints:

### 1. Current Publishing Logic Location
- Where does the existing POST /api/v1/menu/publish handler live?
- What service layer(s) does it currently use?
- Document the full call chain from route → controller → service → repository

### 2. State Transition Analysis
- What menu status values exist? (draft, published, scheduled, archived?)
- What validations occur before publishing? (completeness checks, required fields, etc.)
- Are there any pre-publish hooks or side effects? (notifications, cache invalidation, etc.)
- Does publishing affect related entities? (menu items, combos, menu groups, categories?)

### 3. Scheduling Logic Review
- Does the publish endpoint support scheduled publishing (publish at a future date/time)?
- If yes, how is scheduling implemented? (cron jobs, scheduled tasks, database flags?)
- Are there scheduledPublishDate or scheduledUnpublishDate fields involved?
- Does scheduling interact with branch-specific logic?

### 4. Branch-Groups Interaction
- The legacy system has a "branch-groups" concept that Routes 1 and 2 worked around
- Does publishing logic reference branch-groups?
- If yes, how does publishing a menu affect branch-group associations?
- Does the new MenuService layer need to handle branch-group logic, or can it be isolated?

### 5. Permission and RBAC
- What RBAC permissions are required to publish a menu?
- Are there branch-level or merchant-level publishing restrictions?
- Does the user's role affect what they can publish? (e.g., can a branch manager publish globally?)

### 6. Audit and Compliance
- Does the audit plugin capture menu publishing events?
- What audit metadata should be recorded? (who published, when, which branch/merchant?)

## Expected Deliverables

### Phase A: Investigation Report
Create a document (e.g., `ROUTE-3-PUBLISH-INVESTIGATION.md`) containing:
- Complete mapping of current publishing flow
- All state transitions and their rules
- Scheduling mechanism details (if applicable)
- Branch-groups interaction analysis
- List of all validations that must be preserved
- List of side effects that occur on publish
- Any blocking issues or ambiguities discovered

**Do not proceed to Phase B until this investigation is complete and reviewed.**

### Phase B: Migration Plan
Based on the investigation, create a migration plan that addresses:
- How to integrate publishing logic into MenuService
- Whether scheduling logic stays separate or moves into the service layer
- How to handle branch-groups (isolate, migrate, or deprecate in this route)
- Transaction boundaries (ensure publish is atomic)
- Rollback strategy if publish fails mid-operation
- How to preserve all existing validations
- Whether any legacy behavior should be explicitly changed (document as a decision)

### Phase C: Implementation
Implement the migration following these constraints:

1. **Branch Isolation**: All Route 3 work must be done in a feature branch (e.g., `feature/route-3-publish-migration`)
2. **Preserve Existing Behavior**: The published menu must match the current system's output exactly (same validations, same state transitions, same side effects)
3. **Service Layer Integration**: Publishing logic should route through `MenuService` to maintain consistency with Routes 1 and 2
4. **Transaction Safety**: Use database transactions to ensure atomicity (if a publish fails, no partial state should be committed)
5. **Audit Logging**: Ensure all publish events are captured by the audit system
6. **Error Handling**: Preserve existing error messages and HTTP status codes for backward compatibility
7. **RBAC Compliance**: All existing permission checks must be maintained

### Phase D: Testing
Write comprehensive tests covering:
- Successful publish (draft → published)
- Validation failures (incomplete menu, missing required fields, etc.)
- Permission denial cases (unauthorized user, wrong merchant context, etc.)
- Scheduled publish scenarios (if applicable)
- Rollback scenarios (publish fails mid-transaction)
- Branch-groups edge cases (if applicable)
- Concurrent publish attempts (race conditions)
- Audit log verification (publish event is recorded correctly)

### Phase E: Documentation
Update or create:
- API documentation for POST /api/v1/menu/publish (if changed)
- Frontend integration guide section for publishing workflow
- Any schema changes or new fields introduced
- Migration notes for other developers

## Known Constraints and Open Questions

### Tie-Breaking Decision Blocker
- Routes 1 and 2 exposed a tie-breaking ambiguity when multiple MenuGroup entities have the same `priority` field
- The fix applied was `.sort({ priority: -1, _id: 1 })` to use `_id` as a stable secondary sort key
- The decision document recommends this approach but is pending product owner approval
- Route 3 may encounter the same issue if publishing involves sorting MenuGroups by priority
- **Action**: Check if publish logic sorts MenuGroups by `priority` anywhere. If yes, apply the same tie-breaking rule used in Routes 1 and 2 (`.sort({ priority: -1, _id: 1 })`), and flag it clearly in code comments as pending product approval
- **Note**: If publish logic sorts other entities (menu items, combos, etc.) by different fields (e.g., `displayOrder`), that would be a separate instance of the same class of bug — investigate and document as a new finding rather than conflating it with the resolved MenuGroup issue

### Branch-Groups Legacy Debt
- Routes 1 and 2 worked around branch-groups by not directly depending on them
- If Route 3's publish logic is tightly coupled to branch-groups, you may need to:
  - Option A: Keep branch-groups logic isolated in a separate layer (not in MenuService)
  - Option B: Migrate branch-groups logic into the new architecture (larger scope)
  - Option C: Document as technical debt and plan for future refactor
- **Action**: Choose the option with the smallest blast radius that preserves existing behavior

## Success Criteria

Route 3 migration is complete when:

1. ✅ Investigation report documents all touchpoints and dependencies
2. ✅ Migration plan is reviewed and approved
3. ✅ Implementation routes through MenuService (consistent with Routes 1 and 2)
4. ✅ All existing validations and side effects are preserved
5. ✅ Tests cover all success and failure scenarios
6. ✅ Audit logging captures publish events correctly
7. ✅ RBAC permissions are enforced correctly
8. ✅ No regressions in existing menu functionality
9. ✅ Code remains in feature branch (not merged to main until tie-breaking decision is resolved)
10. ✅ Documentation is updated for frontend integration

## Questions to Resolve During Investigation

1. Does the current system support scheduled publishing, or is it always immediate?
2. Can a menu be "unpublished" (published → draft), or is it a one-way transition?
3. What happens to active orders if a menu is unpublished mid-service?
4. Are there merchant-level or branch-level flags that control publishing permissions?
5. Does publishing trigger any background jobs or async processes?
6. Is there a "publish history" or version control for menus?
7. How does publishing interact with localization (multiple languages)?
8. Are there any rate limits or throttling on publish operations?

---

**Next Step**: Begin Phase A investigation. Read the existing publish route implementation and map out the full flow. Do not write any migration code until the investigation is documented and reviewed.

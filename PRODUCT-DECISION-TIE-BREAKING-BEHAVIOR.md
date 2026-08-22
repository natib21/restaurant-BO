# PRODUCT DECISION REQUIRED: Menu Group Tie-Breaking Behavior

**Date**: August 21, 2026  
**Component**: Menu Management System  
**Priority**: HIGH - Affects User-Facing Behavior  
**Status**: ⚠️ PENDING PRODUCT SIGN-OFF

---

## Summary

A bug fix for non-deterministic menu group sorting has introduced a new **product behavior rule** that requires product/business sign-off before deployment.

---

## The Bug (Fixed)

### What Was Wrong
When multiple MenuGroups have the **same priority** value and contain the same MenuItem:
- **Before**: Sort order was non-deterministic (depended on MongoDB internal storage order)
- **Result**: Item customizations (name, price) could vary unpredictably between page loads
- **Impact**: Inconsistent customer experience, unpredictable pricing

### Technical Fix
Added secondary sort key `_id ASC` to guarantee deterministic ordering:

**Location 1**: `src/modules/menu/service/MenuGroup.service.js` Line 131  
```javascript
.sort({ priority: -1, _id: 1 }) // In getPublicMenu()
```

**Location 2**: `src/modules/menu/service/MenuGroup.service.js` Line 322  
```javascript
.sort({ priority: -1, _id: 1 }) // In getStaffMenu()
```

---

## The New Behavior Rule

### ⚠️ REQUIRES PRODUCT SIGN-OFF

**Rule**: When two MenuGroups have the same priority, the **first-created group wins**.

### What This Means for Merchants

**Scenario:**
1. Merchant creates "Lunch Specials" group with priority 10
   - Contains "Chicken Plate" with custom name "Lunch Chicken" at $8
2. Merchant later creates "Daily Deals" group with priority 10 (same priority)
   - Contains same "Chicken Plate" with custom name "Deal Chicken" at $7

**Current Behavior (After Fix):**
- Customers see: "Lunch Chicken" at $8 (first-created group wins)
- The newer "Daily Deals" customizations are **ignored** unless merchant either:
  - Raises "Daily Deals" priority above 10, OR
  - Lowers "Lunch Specials" priority below 10

**Expected Merchant Understanding:**
- Higher priority always wins (intended)
- **NEW**: When priorities are equal, older group wins (may be surprising)

---

## Alternative Behaviors to Consider

### Option 1: Current Implementation (First-Created Wins)
**Pros:**
- Deterministic and stable
- Older groups are typically more established/trusted
- `_id` sort is efficient (indexed field)

**Cons:**
- Not intuitive - merchants might expect "last wins" or "first wins based on UI order"
- Requires merchants to understand creation timestamp affects behavior

### Option 2: Last-Created Wins (`_id DESC` for ties)
**Pros:**
- More intuitive - "newer overrides older"
- Aligns with many UI patterns (last edit wins)

**Cons:**
- Could surprise merchants who set up groups months ago
- Requires code change: `.sort({ priority: -1, _id: -1 })`

### Option 3: Explicit Tie-Break Field
**Pros:**
- Most explicit - no hidden behavior
- Add `tieBreakOrder` field to MenuGroup model
- Merchants can control directly

**Cons:**
- Requires schema change
- More complex UI
- Migration needed for existing groups

### Option 4: Disallow Same Priority
**Pros:**
- Forces explicit prioritization
- No ambiguity

**Cons:**
- Breaking change for existing data
- Less flexible for merchants

---

## Recommendation

**Proceed with Option 1 (First-Created Wins)** IF:
1. ✅ Product owner confirms this is acceptable merchant behavior
2. ✅ This is documented in merchant-facing help docs
3. ✅ UI shows group creation date (so merchants understand the rule)

**Alternative: Implement Option 2 (Last-Created Wins)** IF:
1. ✅ Product owner prefers "newer overrides older" mental model
2. ✅ Simple code change: Replace `_id: 1` with `_id: -1`

---

## Questions for Product Owner

1. **Is "first-created wins ties" the intended merchant experience?**
   - If NO: Should we implement "last-created wins" instead?

2. **Should we prevent same-priority groups entirely?**
   - Force unique priorities via validation?

3. **Should this be configurable per-merchant?**
   - Let merchants choose tie-break rule?

4. **Do we need UI changes?**
   - Show creation date in group list?
   - Add explicit tie-break ordering field?

5. **What merchant education is needed?**
   - Help docs explaining priority behavior?
   - Warning when creating same-priority group?

---

## Impact Assessment

### High Impact Scenarios
- **Restaurant chains** with complex menu structures and many groups
- **Seasonal menus** where groups are created/archived frequently  
- **A/B testing** where duplicate groups test different customizations

### Low Impact Scenarios
- **Simple menus** with few groups
- **Distinct priorities** (most merchants likely use different priorities)
- **Single-item groups** (no overlap to deduplicate)

---

## Testing Status

✅ **Unit Tests**: Passing - tie-breaking behavior verified  
✅ **Determinism**: Verified across multiple runs  
✅ **Production Code**: Both public and staff menu methods updated  

---

## Deployment Blocker

🚫 **DO NOT DEPLOY to production** until product owner signs off on tie-breaking rule.

**Migration ≠ Deployment**: Route 3 migration work can proceed (development, testing, staging), but the tie-breaking behavior change (Routes 1 & 2) must remain in a feature branch or staging environment until product decision is finalized.

**Required Actions Before Production Deployment:**
1. [ ] Product owner reviews this document
2. [ ] Product owner approves "first-created wins" rule OR requests alternative
3. [ ] Help documentation updated with priority/tie-break explanation
4. [ ] UI reviewed for creation date visibility (if needed)
5. [ ] Merchant communication plan (if high-impact change)
6. [ ] **Explicit sign-off email/ticket** from product owner confirming deployment approval

**Safe to Deploy (Staging/Dev)**: ✅ YES - For testing and validation  
**Safe to Deploy (Production)**: ❌ NO - Blocked pending product sign-off

---

## Contact

**Technical Owner**: Backend Team  
**Product Owner**: [TO BE ASSIGNED]  
**Decision Needed By**: Before Route 3 deployment  

---

**Current Status**: ⚠️ PENDING PRODUCT DECISION  
**Code Ready**: ✅ YES  
**Tests Passing**: ✅ YES  
**Deployed**: ❌ NO (blocked pending decision)


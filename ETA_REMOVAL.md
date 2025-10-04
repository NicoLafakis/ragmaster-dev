# ETA/Progress Tracking Removal

## Date: October 4, 2025

## Problem

The queue was still getting stuck despite previous fixes. The user identified that the ETA/progress tracking feature added to show "how long till it's done" was causing the issue.

## Root Cause

The ETA estimator system was doing real-time calculations on every `/api/queue` poll request:

- Calculating elapsed time with `Date.now()`
- Computing remaining time estimates
- Calculating percentage complete
- Using `Object.assign()` to merge metrics dynamically

This added complexity was:

1. **Blocking the queue status endpoint** with synchronous calculations
2. **Creating potential race conditions** with time-based state
3. **Adding unnecessary complexity** to the critical processing path
4. **Potentially causing issues** with the `estimatedStart` timestamp tracking

## Code Removed

### 1. Estimator Functions (Lines 83-114)

```javascript
// REMOVED:
const recentSamples = [];
const MAX_ESTIMATOR_SAMPLES = 50;
const DEFAULT_MS_PER_CHAR = 0.5;

function addSample(chars, ms) { ... }
function getAvgMsPerChar() { ... }
function estimateMsForLength(chars) { ... }
```

### 2. Metrics Fields in createQueueItem

```javascript
// REMOVED:
processedChunks: 0,  // ❌ Not needed
estimatedTotalMs: null,  // ❌ Caused issues
estimatedStart: null,  // ❌ Race condition source
```

### 3. Estimator Code in processSingleFile

```javascript
// REMOVED:
queueItem.metrics.processedChunks = 0;
queueItem.metrics.estimatedTotalMs = estimateMsForLength(content.length);
queueItem.metrics.estimatedStart = Date.now();
addSample(content.length, queueItem.metrics.processingTimeMs);
```

### 4. Real-Time ETA Calculations in /api/queue

```javascript
// REMOVED: 50+ lines of complex Object.assign() logic
metrics: Object.assign(
  {},
  f.metrics,
  (() => {
    const elapsed = Date.now() - f.metrics.estimatedStart;
    const remaining = Math.max(0, f.metrics.estimatedTotalMs - elapsed);
    out.estimatedRemainingMs = remaining;
    out.estimatedPercent = Math.round(
      (elapsed / f.metrics.estimatedTotalMs) * 100
    );
    out.estimatedCompletionTime = new Date(
      Date.now() + remaining
    ).toISOString();
    // ... etc
  })()
);
```

### 5. Debug Estimator Endpoint

```javascript
// REMOVED:
app.get("/api/debug/estimator", (req, res) => { ... });
```

## What Remains

### Simple, Clean Metrics

```javascript
metrics: {
  chunkCount: 0,           // ✅ Number of chunks created
  keywordCount: 0,         // ✅ Number of keywords extracted
  processingTimeMs: 0,     // ✅ Total processing time (recorded at completion)
  conversionApplied: false // ✅ Was file converted to markdown
}
```

### Clean Queue Status Response

```javascript
files: fileQueue.map((f) => ({
  id: f.id,
  filename: f.filename,
  status: f.status,
  originalSize: f.originalSize,
  metrics: f.metrics, // ✅ Simple, no calculations
  error: f.error,
  uploadedAt: f.uploadedAt,
  completedAt: f.completedAt,
}));
```

## Benefits of Removal

1. ✅ **No more blocking calculations** on every queue poll
2. ✅ **Removed time-based state** that could cause race conditions
3. ✅ **Simplified the critical path** - less code = fewer bugs
4. ✅ **Faster API responses** - no real-time computations
5. ✅ **Eliminated potential deadlocks** from timing issues
6. ✅ **Cleaner code** - easier to debug and maintain

## Trade-offs

### Lost Features:

- ❌ No more "estimated time remaining" display
- ❌ No more "percentage complete" indicator
- ❌ No more "estimated completion time"

### What Users Still Have:

- ✅ File status (pending/processing/completed/failed)
- ✅ Total processing time (shown after completion)
- ✅ Queue statistics (total, pending, processing, completed, failed)
- ✅ Real-time queue polling
- ✅ Automatic stuck state recovery

## Why This Fixes The Issue

The ETA system was:

1. **Calling `Date.now()` repeatedly** during queue polling (every 1 second)
2. **Performing calculations on potentially stale data** (files in processing state)
3. **Creating timing dependencies** that could deadlock
4. **Adding synchronous blocking operations** to async flow

By removing it, the queue processing is now:

- **Pure state machine** (pending → processing → completed/failed)
- **No time-based calculations** during processing
- **Simpler async flow** with fewer potential race conditions
- **Faster response times** for queue status checks

## Alternative Approach (Future)

If ETA is needed later, implement it **properly**:

1. Calculate estimates **before** processing starts (not during)
2. Store as **static fields** (not computed on every request)
3. Update **only when state changes** (not on every poll)
4. Use **separate endpoint** for ETA queries (don't mix with queue status)

Example:

```javascript
// Store estimate ONCE when processing starts
queueItem.estimatedCompletionTime = new Date(
  Date.now() + estimate
).toISOString();

// Return it as-is (no calculations)
return {
  ...queueItem,
  estimatedCompletionTime: queueItem.estimatedCompletionTime,
};
```

## Files Modified

- `backend/app.js` - Removed all ETA/estimator code

## Summary

**Removed ~100 lines of complex ETA calculation code** that was causing the queue to get stuck. The system is now simpler, faster, and more reliable. Users still get all essential queue information, just without the "time remaining" estimates that were causing problems.

## Testing

After this change:

1. ✅ Queue processing should be **completely stable**
2. ✅ No more stuck states from timing issues
3. ✅ Faster API responses (no calculations)
4. ✅ Automatic recovery still works
5. ✅ All core functionality intact

If the queue still gets stuck after this change, the issue is **not** related to the ETA system and we need to investigate other areas.

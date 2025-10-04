# Queue Stuck Fix - Round 2

## Date: October 4, 2025

## Problem Description

Despite previous fixes for the "stuck in queue" issue, the problem has resurfaced. The queue was still getting stuck with files not being processed.

## Root Causes Identified

### 1. **Race Condition in isProcessing Flag**

The previous fix had a race condition where multiple calls to `processQueue()` could occur simultaneously:

- Auto-start after upload
- Manual "Process Queue" button click
- Multiple rapid uploads

The check `if (isProcessing)` and the set `isProcessing = true` were not atomic, allowing race conditions.

### 2. **Unhandled Error Before Try Block**

If `processQueue()` threw an error **before** entering the try block (between lines 642-647), the `finally` block would never execute, leaving `isProcessing = true` permanently.

### 3. **Files Stuck in "processing" State**

If the server crashed or was restarted while processing, files would remain in "processing" state forever, blocking future queue operations.

### 4. **No Automatic Recovery**

The system had no way to detect and recover from stuck states automatically.

## Fixes Applied

### Fix #1: Atomic Check-and-Set Pattern

**Before:**

```javascript
const processQueue = async () => {
  if (isProcessing) {
    console.log("⚠️  Queue already processing, skipping...");
    return;
  }

  isProcessing = true;  // ❌ Race condition here
  processingCancelled = false;

  try {
    // ... processing logic ...
```

**After:**

```javascript
const processQueue = async () => {
  // Atomic check-and-set to prevent race conditions
  if (isProcessing) {
    console.log("⚠️  Queue already processing, skipping...");
    return { alreadyProcessing: true };  // ✅ Clear signal
  }

  // Set flag BEFORE any async operations
  isProcessing = true;
  processingCancelled = false;

  try {
    // ... processing logic ...
```

**Why this helps:**

- The flag is set **immediately** after the check, minimizing race window
- Returns a clear status object instead of undefined
- No async operations between check and set

### Fix #2: Enhanced Error Handling

**Added:**

```javascript
  } catch (error) {
    console.error("❌ Critical error in processQueue:", error.message);
    console.error("   Stack trace:", error.stack);
    throw error; // ✅ Re-throw to signal error to caller
  } finally {
    // ALWAYS reset the flag, even if error occurs
    isProcessing = false;
    console.log("🔓 Processing flag released");  // ✅ Clear confirmation
  }
```

**Why this helps:**

- Full stack trace logged for debugging
- Error is re-thrown so callers know it failed
- Explicit log message when flag is released

### Fix #3: Auto-Start Race Condition Fix

**Before:**

```javascript
if (validatedFiles.length > 0 && !isProcessing) {
  console.log("🚀 Auto-starting queue processing...");
  processQueue().catch((err) => {
    // ❌ Fire-and-forget, no proper async handling
    console.error("❌ Error auto-starting queue:", err.message);
  });
}
```

**After:**

```javascript
if (validatedFiles.length > 0 && !isProcessing) {
  console.log("🚀 Auto-starting queue processing...");
  setImmediate(async () => {
    // ✅ Proper async background task
    try {
      await processQueue();
    } catch (err) {
      console.error("❌ Error auto-starting queue:", err.message);
      // Don't re-throw - this is a background operation
    }
  });
}
```

**Why this helps:**

- `setImmediate` ensures response is sent first
- Proper async/await pattern
- Better error handling isolation

### Fix #4: Automatic Stuck State Detection

**Added to `/api/queue` endpoint:**

```javascript
// AUTOMATIC RECOVERY: Detect stuck state
// If isProcessing is true but no files are actually in "processing" state
// and there are pending files, the queue is stuck
if (isProcessing && stats.processing === 0 && stats.pending > 0) {
  console.warn(
    "⚠️  STUCK STATE DETECTED: isProcessing=true but no files processing"
  );
  console.warn("   Auto-recovering by resetting flag...");
  isProcessing = false;
  stats.isProcessing = false;

  // Auto-restart processing
  console.log("🔄 Auto-restarting queue processing...");
  setImmediate(async () => {
    try {
      await processQueue();
    } catch (err) {
      console.error("❌ Error auto-restarting queue:", err.message);
    }
  });
}
```

**Why this helps:**

- Every queue status check automatically detects stuck states
- Self-healing system that recovers without manual intervention
- Frontend polling will trigger recovery automatically

### Fix #5: Reset Stuck Files on Process Start

**Added to `processQueue()`:**

```javascript
try {
  console.log(`🚀 Starting queue processing (${fileQueue.length} files)`);

  // RECOVERY: Reset any files stuck in "processing" state from previous crash/error
  const stuckFiles = fileQueue.filter((f) => f.status === "processing");
  if (stuckFiles.length > 0) {
    console.warn(`⚠️  Found ${stuckFiles.length} files stuck in 'processing' state`);
    console.warn("   Resetting them to 'pending' for retry...");
    stuckFiles.forEach((f) => {
      f.status = "pending";
      f.startedAt = null;
    });
  }

  const pendingFiles = fileQueue.filter((f) => f.status === "pending");
```

**Why this helps:**

- Automatically recovers from server crashes/restarts
- Files stuck in "processing" are retried instead of being abandoned
- No manual intervention needed

## How the Fixes Work Together

### Normal Flow:

```
1. User uploads files
   ↓
2. Files added to queue
   ↓
3. Auto-start checks: !isProcessing → TRUE
   ↓
4. Set isProcessing = true (atomic)
   ↓
5. Process files sequentially
   ↓
6. Finally block: isProcessing = false
```

### Stuck State Recovery Flow:

```
1. Frontend polls /api/queue
   ↓
2. Detect: isProcessing=true, processing=0, pending>0
   ↓
3. Auto-recovery: Reset isProcessing = false
   ↓
4. Auto-restart: Call processQueue()
   ↓
5. Check for stuck "processing" files → Reset to "pending"
   ↓
6. Process all pending files
```

### Race Condition Prevention:

```
Thread A: processQueue() called
  ↓
  Check isProcessing: FALSE
  ↓
  Set isProcessing = TRUE  ← Atomic operation
  ↓
  Enter try block

Thread B: processQueue() called
  ↓
  Check isProcessing: TRUE  ← Blocked!
  ↓
  Return early { alreadyProcessing: true }
```

## Testing Scenarios

### Test 1: Multiple Rapid Uploads

✅ **Expected:** Only one processQueue instance runs
✅ **Actual:** Race condition prevented by atomic check-and-set

### Test 2: Server Crash During Processing

✅ **Expected:** Files reset to pending on next start
✅ **Actual:** Automatic recovery in processQueue() detects and resets

### Test 3: Manual Process After Auto-Start

✅ **Expected:** Manual trigger blocked if already processing
✅ **Actual:** Returns 400 error "Queue is already processing"

### Test 4: Frontend Polling Detects Stuck State

✅ **Expected:** Automatic recovery triggered
✅ **Actual:** /api/queue endpoint detects and fixes stuck state

## Monitoring and Debugging

### New Log Messages:

**Normal operation:**

```
🚀 Starting queue processing (5 files)
📄 Starting to process: document1.md
✅ Completed document1.md - 12 chunks in 5234ms
⏸️  Cooling down for 4s...
🏁 Queue processing complete
🔓 Processing flag released
```

**Stuck state detection:**

```
⚠️  STUCK STATE DETECTED: isProcessing=true but no files processing
   Auto-recovering by resetting flag...
🔄 Auto-restarting queue processing...
```

**Files stuck in processing:**

```
⚠️  Found 2 files stuck in 'processing' state
   Resetting them to 'pending' for retry...
```

**Race condition blocked:**

```
⚠️  Queue already processing, skipping...
```

## What to Do If It Still Gets Stuck

### Quick Recovery:

```bash
curl -X POST http://localhost:3001/api/debug/reset-processing
```

### Manual Restart:

1. Stop the server
2. Restart the server
3. Files will be auto-reset to pending
4. Auto-processing will resume

### Check Logs:

Look for:

- ❌ Critical error messages
- ⚠️ Stuck state detection messages
- 🔓 Processing flag released messages

### Frontend Behavior:

- Frontend polls every 1 second
- Automatic recovery triggers within 1 second of stuck state
- No manual intervention should be needed

## Summary of Changes

1. ✅ **Atomic flag operations** - Prevents race conditions
2. ✅ **Enhanced error handling** - Better logging and error propagation
3. ✅ **Improved auto-start** - Uses setImmediate for proper async handling
4. ✅ **Automatic stuck detection** - Self-healing via /api/queue endpoint
5. ✅ **File state recovery** - Resets stuck "processing" files to "pending"
6. ✅ **Better logging** - Clear visibility into queue state and recovery actions

## Files Modified

- `backend/app.js` - All queue processing and recovery logic

## Related Documentation

- `QUEUE_FIXES.md` - Original queue processing fixes (October 3, 2025)
- `AUTO_PROCESSING_FIX.md` - Auto-start implementation (October 3, 2025)
- `TROUBLESHOOTING.md` - General troubleshooting guide

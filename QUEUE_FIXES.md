# Queue Processing Fixes

## Date: October 3, 2025

## Problem

The queue was getting stuck and not releasing files for processing. The `isProcessing` flag was not being properly reset in error conditions.

## Fixes Applied

### 1. **Added Try-Catch-Finally to `processQueue()`**

**Before:**

```javascript
const processQueue = async () => {
  if (isProcessing) return;

  isProcessing = true;
  // ... processing logic ...
  isProcessing = false; // ❌ Never reached if error occurs
};
```

**After:**

```javascript
const processQueue = async () => {
  if (isProcessing) {
    console.log("⚠️  Queue already processing, skipping...");
    return;
  }

  isProcessing = true;

  try {
    // ... processing logic ...
  } catch (error) {
    console.error("❌ Critical error in processQueue:", error.message);
  } finally {
    isProcessing = false; // ✅ ALWAYS resets, even on error
  }
};
```

### 2. **Enhanced Logging in `processSingleFile()`**

Added detailed logging to track processing steps:

- File name and start time
- Markdown conversion status
- Doc ID generation
- Content length
- LLM processing progress
- Completion time with metrics
- Full error stack traces

### 3. **Added Debug Endpoint**

New endpoint to manually reset the processing flag if needed:

```
POST /api/debug/reset-processing
```

**Response:**

```json
{
  "success": true,
  "message": "Processing flag reset (was: true)",
  "queueStats": {
    "totalFiles": 5,
    "pending": 2,
    "processing": 0,
    "completed": 3,
    "failed": 0,
    "isProcessing": false
  }
}
```

## How to Debug Queue Issues

### 1. Check Queue Status

```bash
curl http://localhost:3001/api/queue
```

Look for:

- `isProcessing: true` - Queue is currently processing
- `isProcessing: false` - Queue is idle
- Files stuck in `"processing"` status
- Number of `"pending"` files

### 2. Check Server Logs

The enhanced logging will show:

```
📄 Starting to process: example.md
🔄 Converting example.md to Markdown...
✓ Conversion complete
🤖 Processing example.md with comprehensive conversion...
   Doc ID: doc_1728123456789_ABC123
   Content length: 5432 characters
✓ LLM processing complete
✅ Completed example.md - 15 chunks in 3245ms
```

### 3. If Queue is Stuck

**Option A: Use Debug Endpoint**

```bash
curl -X POST http://localhost:3001/api/debug/reset-processing
```

**Option B: Clear Queue**

```bash
curl -X POST http://localhost:3001/api/clear-queue
```

**Option C: Restart Server**

```bash
npm run kill-all
npm start
```

### 4. Common Issues

#### Issue: `isProcessing` stuck at `true`

**Cause:** An error occurred in the processing loop before the fix
**Solution:** Use the debug endpoint or restart server

#### Issue: File stuck in "processing" status

**Cause:** LLM call timed out or crashed
**Solution:**

1. Check server logs for error details
2. Use debug endpoint to reset flag
3. Delete the stuck file: `DELETE /api/queue/:fileId`
4. Re-upload the file

#### Issue: "Queue already processing" message

**Cause:** Normal - another request tried to start processing while queue was already running
**Solution:** This is expected behavior, not an error

## Testing the Fixes

1. **Start the server:**

   ```bash
   npm start
   ```

2. **Upload a test file:**

   ```bash
   curl -X POST -F "files=@sample.md" http://localhost:3001/api/upload
   ```

3. **Trigger processing:**

   ```bash
   curl -X POST http://localhost:3001/api/process-queue
   ```

4. **Monitor progress:**

   ```bash
   watch -n 1 "curl -s http://localhost:3001/api/queue | jq '.stats'"
   ```

5. **Download results:**
   ```bash
   curl http://localhost:3001/api/download/:fileId > output.json
   ```

## Technical Details

### Error Handling Flow

```
processQueue()
├── try {
│   ├── Get pending files
│   ├── For each file:
│   │   ├── processSingleFile() [has own try-catch]
│   │   └── Delay
│   └── Log completion
├── } catch (error) {
│   └── Log critical error
└── } finally {
    └── isProcessing = false  ← ALWAYS RUNS
```

### Processing State Machine

```
File Status Flow:
pending → processing → completed
    ↓         ↓
    └─────→ failed

Queue State:
isProcessing = false → idle
isProcessing = true → actively processing
```

## Improvements Made

1. ✅ **Guaranteed flag reset** - `finally` block ensures `isProcessing` is always reset
2. ✅ **Better error visibility** - Full stack traces logged
3. ✅ **Debug tools** - Manual reset endpoint for emergency situations
4. ✅ **Process tracking** - Detailed logs show exactly where processing is
5. ✅ **Error isolation** - Individual file errors don't crash entire queue

## Next Steps (Optional Enhancements)

- [ ] Add timeout protection (kill processing after X minutes)
- [ ] Add retry logic for failed files
- [ ] Add processing progress percentage per file
- [ ] Add websocket support for real-time status updates
- [ ] Add processing history/audit log

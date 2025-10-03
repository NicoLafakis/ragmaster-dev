# 🐛 Troubleshooting Guide

Solutions to common RAGMaster issues and errors.

---

## 🚨 Quick Diagnostics

Run this PowerShell diagnostic script to check your setup:

```powershell
.\test-server.ps1
```

This checks:

- `.env` file exists and has valid API key
- `node_modules` installed
- Frontend built
- Kills zombie Node processes
- Starts server with full logging

---

## ❌ Upload Errors

### "Upload failed - 404 Not Found"

**Symptoms:**

```
❌ Upload failed
Details: No additional details
Status: 404 Not Found
URL: http://localhost:5174/api/upload
```

**Root Cause:** Frontend can't reach backend API

**Solutions:**

1. **Check both servers are running:**

   ```powershell
   # Should see TWO Node processes:
   Get-Process node -ErrorAction SilentlyContinue
   ```

   - Backend on port 3001
   - Frontend on port 5174

2. **Verify Vite proxy configuration:**

   Check `frontend/vite.config.js`:

   ```javascript
   export default defineConfig({
     server: {
       port: 5174,
       proxy: {
         // ← Must have this!
         "/api": {
           target: "http://localhost:3001",
           changeOrigin: true,
         },
       },
     },
   });
   ```

3. **Restart frontend dev server:**

   ```powershell
   # Kill and restart
   Stop-Process -Name node -Force
   cd frontend
   npm run dev
   ```

4. **Test backend directly:**
   ```powershell
   curl http://localhost:3001/api/queue
   # Should return JSON, not 404
   ```

---

### "No files uploaded"

**Symptoms:** Backend receives empty file array

**Causes:**

1. FormData field name mismatch
2. File input not working

**Solution:**

Check frontend sends correct field name:

```javascript
// frontend/src/App.jsx
const formData = new FormData();
files.forEach((file) => formData.append("files", file)); // ← Must be 'files'
```

Backend expects:

```javascript
// backend/app.js
app.post('/api/upload', upload.array('files', MAX_FILES), ...)  // ← Must match
```

---

### "File exceeds 1MB limit"

**Symptoms:** Upload rejected immediately

**Solution:**

Either:

1. Reduce file size (compress, remove images)
2. Increase backend limit:

```javascript
// backend/app.js (line ~20)
const MAX_FILE_SIZE = 2 * 1024 * 1024; // Change to 2MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE }, // Update here too
});
```

---

### "Unsupported file type"

**Symptoms:** `.docx` or other file rejected

**Solution:**

Add extension to allowed list:

```javascript
// backend/app.js (line ~22)
const ALLOWED_EXTENSIONS = [
  ".md",
  ".markdown",
  ".txt",
  ".json",
  ".csv",
  ".log",
  ".xml",
  ".html",
  ".rtf",
  ".docx", // ← Add here
];
```

---

## 🔑 API Key Issues

### "OPENAI_API_KEY not found in .env file!"

**Symptoms:** Server exits immediately with exit code 1

**Solutions:**

1. **Create `.env` file in PROJECT ROOT** (not in `backend/`):

   ```powershell
   cd C:\programming\_VisualStudio\ragmaster-dev
   echo "OPENAI_API_KEY=sk-proj-your-key-here" > .env
   ```

2. **Verify file contents:**

   ```powershell
   Get-Content .env
   # Should show: OPENAI_API_KEY=sk-proj-...
   ```

3. **Check for spaces/quotes:**

   ```bash
   # ✅ CORRECT:
   OPENAI_API_KEY=sk-proj-abc123...

   # ❌ WRONG:
   OPENAI_API_KEY = "sk-proj-abc123..."  # No spaces or quotes!
   ```

4. **Restart server** after creating `.env`:

   ```powershell
   npm start
   ```

5. **Verify key loaded:**
   Terminal should show:
   ```
   🔑 OPENAI_API_KEY loaded (length: 164)
   ✅ OpenAI client initialized
   ```

---

### "Invalid API Key" or 401 Errors

**Symptoms:** Processing fails with OpenAI authentication error

**Solutions:**

1. **Get new key:** [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

2. **Check key format:**

   - Project keys: `sk-proj-...` (recommended)
   - User keys: `sk-...`

3. **Verify key permissions:**

   - Must have access to GPT models
   - Check usage limits not exceeded

4. **Test key directly:**
   ```powershell
   $headers = @{
     "Authorization" = "Bearer sk-proj-your-key"
   }
   Invoke-RestMethod -Uri "https://api.openai.com/v1/models" -Headers $headers
   ```

---

## 🔌 Port Conflicts

### "Port already in use"

**Symptoms:**

```
Error: listen EADDRINUSE: address already in use :::3001
```

**Solutions:**

1. **Kill all Node processes:**

   ```powershell
   Stop-Process -Name node -Force
   ```

2. **Kill specific port (Windows):**

   ```powershell
   # Find process using port 3001
   $process = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
   if ($process) {
     Stop-Process -Id $process.OwningProcess -Force
   }
   ```

3. **Change port:**

   ```javascript
   // backend/app.js
   const PORT = process.env.PORT || 3002; // Use 3002 instead
   ```

   Don't forget to update Vite proxy:

   ```javascript
   // frontend/vite.config.js
   proxy: {
     '/api': {
       target: 'http://localhost:3002',  // Match new port
     }
   }
   ```

---

## 🔄 Processing Errors

### Processing Stuck / No Progress

**Symptoms:** Queue shows "processing" but no updates

**Causes:**

1. OpenAI API timeout
2. Rate limit hit
3. Server crashed silently

**Solutions:**

1. **Check backend terminal** for errors:

   ```
   ❌ Failed document.md: Request timed out
   ```

2. **Cancel and restart:**

   - Click "❌ Cancel Processing"
   - Wait 5 seconds
   - Click "🚀 Process Queue" again

3. **Reduce file size** if very large (>10,000 words)

4. **Check OpenAI status:** [status.openai.com](https://status.openai.com/)

---

### "Processing cancelled by user"

**Symptoms:** All pending files marked failed

**Cause:** You clicked Cancel button

**Solution:** This is expected behavior. Files remain in queue - click "Process Queue" again to resume.

---

### Chunks Cross Heading Boundaries

**Symptoms:** Downloaded JSON shows chunks mixing content from different sections

**Cause:** Markdown heading syntax incorrect

**Solution:**

Verify headings have space after `#`:

```markdown
✅ CORRECT:

## Section Title

❌ WRONG:
##Section Title (no space!)
```

Headings must be on their own line:

```markdown
✅ CORRECT:

## Title

Content here...

❌ WRONG:
Text ## Title on same line
```

---

## 🎨 Frontend Issues

### UI Not Loading / Blank Page

**Symptoms:** Browser shows white screen or "Cannot GET /"

**Solutions:**

1. **Production mode - Build frontend:**

   ```powershell
   npm run build
   # Check frontend/dist/ folder exists
   ```

2. **Development mode - Use correct URL:**

   - ✅ http://localhost:5174 (Vite dev server)
   - ❌ http://localhost:3001 (Backend only, no HMR)

3. **Check browser console** (F12) for errors

4. **Clear browser cache:** Ctrl+F5 or Ctrl+Shift+R

---

### Changes Not Reflecting

**Symptoms:** Code changes don't appear in browser

**Solutions:**

**Frontend changes (App.jsx, styles.css):**

- Should hot-reload automatically
- If not, restart Vite: `npm run dev`

**Backend changes (app.js):**

- Must restart server: `npm start`
- Or use nodemon: `npm i -D nodemon`, then `npx nodemon backend/app.js`

**Hard refresh:** Ctrl+F5 to bypass cache

---

### Drag & Drop Not Working

**Symptoms:** Files don't upload when dropped

**Solutions:**

1. **Check file type** - Only allowed extensions work
2. **Check file size** - Must be < 1MB each
3. **Try click upload** instead of drag & drop
4. **Check browser console** for JavaScript errors

---

## 🌐 Network / Proxy Issues

### CORS Errors

**Symptoms:**

```
Access to fetch at 'http://localhost:3001/api/upload' from origin
'http://localhost:5174' has been blocked by CORS policy
```

**Cause:** Direct fetch to backend without proxy

**Solution:**

Ensure frontend uses relative URLs:

```javascript
// ✅ CORRECT (uses proxy):
fetch('/api/upload', ...)

// ❌ WRONG (bypasses proxy):
fetch('http://localhost:3001/api/upload', ...)
```

---

### Fetch Timeout

**Symptoms:** Upload hangs forever, never completes

**Solutions:**

1. **Check backend is running** - Look for logs
2. **Check network tab** in DevTools - See status
3. **Increase timeout** (if needed):

   ```javascript
   const controller = new AbortController();
   setTimeout(() => controller.abort(), 30000);  // 30s timeout

   fetch('/api/upload', {
     signal: controller.signal,
     ...
   });
   ```

---

## 📦 Dependency Issues

### npm install Fails

**Symptoms:**

```
npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
```

**Solutions:**

1. **Use legacy peer deps:**

   ```powershell
   npm install --legacy-peer-deps
   ```

2. **Clear cache:**

   ```powershell
   npm cache clean --force
   rm -r node_modules
   npm install
   ```

3. **Update Node.js:** Ensure version 18+
   ```powershell
   node --version  # Should be v18.0.0 or higher
   ```

---

### Module Not Found

**Symptoms:**

```
Error: Cannot find module 'openai'
```

**Solutions:**

1. **Install dependencies:**

   ```powershell
   npm install                    # Backend
   npm run frontend:install       # Frontend
   ```

2. **Check package.json exists:**
   - Root: `package.json` (backend deps)
   - Frontend: `frontend/package.json`

---

## 🚀 Deployment Issues

### Railway Build Fails

**Symptoms:** Build logs show errors

**Solutions:**

1. **Check build command:**

   ```bash
   npm install && npm run frontend:install && npm run build
   ```

2. **Verify scripts in package.json:**

   ```json
   {
     "scripts": {
       "build": "npm run frontend:build",
       "frontend:install": "npm --prefix frontend install",
       "frontend:build": "npm --prefix frontend run build"
     }
   }
   ```

3. **Check Node version:** Railway uses Node 18 by default
   ```json
   {
     "engines": {
       "node": ">=18"
     }
   }
   ```

---

### Production 404 Errors

**Symptoms:** Deployed app shows 404 on API routes

**Causes:**

1. Frontend not built
2. Static file serving misconfigured
3. Start command wrong

**Solutions:**

1. **Check build output exists:**
   Railway logs should show:

   ```
   ✅ Serving static files from: /app/frontend/dist
   ```

2. **Verify start command:** `npm start` (not `node backend/app.js` from wrong directory)

3. **Check route order in backend:**

   ```javascript
   // API routes FIRST
   app.post('/api/upload', ...)
   app.get('/api/queue', ...)

   // Static files AFTER API routes
   app.use(express.static(distPath));

   // Catch-all LAST
   app.get('*', (req, res) => {
     res.sendFile(path.join(distPath, 'index.html'));
   });
   ```

---

## 💾 Memory Issues

### "JavaScript heap out of memory"

**Symptoms:** Server crashes with heap error when processing large files

**Solutions:**

1. **Increase Node memory:**

   ```powershell
   $env:NODE_OPTIONS="--max-old-space-size=4096"
   npm start
   ```

2. **Reduce file size limits:**

   ```javascript
   const MAX_FILE_SIZE = 512 * 1024; // 512KB instead of 1MB
   ```

3. **Process files one at a time:** Already implemented with 4s delay

---

## 📞 Getting Help

### Still Having Issues?

1. **Enable debug logging:**

   ```javascript
   // backend/app.js - Add at top
   process.env.DEBUG = "*";
   ```

2. **Check all logs:**

   - Backend terminal output
   - Frontend terminal output
   - Browser console (F12)
   - Browser Network tab

3. **Reproduce with sample data:**

   - Use files from `sampledata/` folder
   - If those work, issue is with your file

4. **Create minimal reproduction:**

   - Fresh clone of repo
   - New `.env` with test key
   - Single small file upload

5. **Open an issue with:**
   - Exact error message
   - Terminal output (backend + frontend)
   - Browser console output
   - Steps to reproduce
   - Your environment (OS, Node version)

---

## 📚 Additional Resources

- [Main README](./README.md) - Setup guide
- [Development Guide](./DEVELOPMENT.md) - Architecture & debugging
- [Deployment Guide](./DEPLOYMENT.md) - Production deployment
- [Express Docs](https://expressjs.com/)
- [Vite Troubleshooting](https://vitejs.dev/guide/troubleshooting.html)
- [OpenAI API Errors](https://platform.openai.com/docs/guides/error-codes)

---

**Most issues are proxy configuration or missing API key!** 🔑

Check `frontend/vite.config.js` and `.env` first.

# 🛠️ Development Guide

Complete guide for RAGMaster development, architecture, and contribution.

---

## 🏗️ Architecture Overview

### Technology Stack

**Backend**

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **File Upload**: Multer (in-memory storage)
- **AI**: OpenAI GPT-5-mini
- **Environment**: dotenv

**Frontend**

- **Framework**: React 18
- **Build Tool**: Vite 5
- **Styling**: Pure CSS (Tron-inspired cyberpunk theme)
- **State**: React Hooks (useState, useRef, useEffect)

### System Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERACTION                          │
│         Browser @ http://localhost:5174 (Dev)               │
└──────────────┬──────────────────────────────────────────────┘
               │
               │ Drag & Drop / Click Upload
               ↓
┌─────────────────────────────────────────────────────────────┐
│                  FRONTEND (React + Vite)                     │
│  • App.jsx - Main component with queue UI                   │
│  • Drag & drop file handling                                │
│  • Real-time polling (1s intervals)                         │
│  • Error handling with detailed logging                     │
└──────────────┬──────────────────────────────────────────────┘
               │
               │ /api/* requests → Vite Proxy
               ↓
┌─────────────────────────────────────────────────────────────┐
│              VITE DEV PROXY (Port 5174 → 3001)              │
│  Configured in frontend/vite.config.js                      │
│  Forwards: /api/upload, /api/queue, etc.                    │
└──────────────┬──────────────────────────────────────────────┘
               │
               │ HTTP to Backend
               ↓
┌─────────────────────────────────────────────────────────────┐
│              BACKEND (Express @ Port 3001)                   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ POST /api/upload                                      │  │
│  │  • Multer file parsing (multipart/form-data)         │  │
│  │  • File validation (size, extension, magic bytes)    │  │
│  │  • Add to in-memory queue                            │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ POST /api/process-queue                              │  │
│  │  • Start async processing loop                       │  │
│  │  • 4-second delay between files                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Processing Pipeline (per file):                      │  │
│  │                                                       │  │
│  │  1. Check if Markdown → If not, convert via LLM     │  │
│  │  2. Extract headings (regex: /^#{1,6}\s+(.+)$/)     │  │
│  │  3. Split by sections (headings = hard boundaries)   │  │
│  │  4. For each section:                                │  │
│  │     • If ≤ 1000 chars → Single chunk                 │  │
│  │     • If > 1000 chars → LLM chunks intelligently     │  │
│  │  5. Extract keywords (TF-IDF via LLM)               │  │
│  │  6. Return structured JSON                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ GET /api/queue                                        │  │
│  │  • Return queue stats and all file statuses         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ GET /api/download/:fileId                            │  │
│  │  • Return processed JSON file                        │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────┬──────────────────────────────────────────────┘
               │
               │ OpenAI API calls
               ↓
┌─────────────────────────────────────────────────────────────┐
│                    OPENAI GPT-5-MINI                         │
│  • Markdown conversion (non-MD files)                       │
│  • Intelligent chunking (semantic boundaries)               │
│  • Keyword extraction (TF-IDF analysis)                     │
│  Cost: ~$0.002 per 10k words                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Development Setup

### Initial Setup

```powershell
# 1. Clone repository
git clone <your-repo-url>
cd ragmaster

# 2. Install all dependencies
npm install                    # Backend deps
npm run frontend:install       # Frontend deps

# 3. Create .env file
echo "OPENAI_API_KEY=sk-proj-your-key" > .env

# 4. Build frontend (optional for production testing)
npm run build
```

### Development Workflow

**Option 1: Use Start Script (Recommended)**

```powershell
.\start-dev.ps1
```

Opens 2 PowerShell windows (backend + frontend), auto-restarts on exit.

**Option 2: Manual (2 Terminals)**

Terminal 1:

```powershell
npm start
# Runs: node backend/app.js
# Watch: http://localhost:3001
```

Terminal 2:

```powershell
cd frontend
npm run dev
# Runs: vite
# Watch: http://localhost:5174
```

**Browse to: http://localhost:5174**

### File Structure

```
ragmaster/
├── backend/
│   └── app.js                 # 🔥 MAIN SERVER FILE
│       ├── Queue system (in-memory)
│       ├── 7 API routes
│       ├── LLM functions (convert, chunk, extract keywords)
│       └── Error handling middleware
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # 🔥 MAIN UI COMPONENT
│   │   │   ├── State management (files, queue, errors)
│   │   │   ├── Upload handlers (drag & drop)
│   │   │   ├── API calls (fetch)
│   │   │   └── Polling (1s interval)
│   │   │
│   │   ├── main.jsx           # React entry point
│   │   └── styles.css         # 🎨 Tron cyberpunk theme
│   │
│   ├── vite.config.js         # 🔥 CRITICAL: Proxy config
│   ├── index.html             # HTML shell
│   └── package.json           # Frontend deps
│
├── sampledata/                # Test files
├── .env                       # 🔥 YOUR API KEY (create this!)
├── package.json               # Backend deps + npm scripts
├── start-dev.ps1              # Development launcher
└── README.md                  # User documentation
```

---

## 🎯 Key Development Areas

### Adding a New API Endpoint

**1. Backend Route** (`backend/app.js`)

```javascript
// Add after existing routes, before error middleware
app.post("/api/my-new-endpoint", async (req, res) => {
  try {
    console.log("🔥 /api/my-new-endpoint hit");

    // Your logic here
    const result = await myFunction(req.body);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("❌ My endpoint error:", error);
    res.status(500).json({
      error: error.message,
      details: error.stack,
    });
  }
});
```

**2. Frontend Call** (`frontend/src/App.jsx`)

```javascript
const handleMyAction = async () => {
  try {
    const res = await fetch("/api/my-new-endpoint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "value" }),
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { _raw: text };
    }

    if (!res.ok) {
      throw new Error(data?.error || "Request failed");
    }

    console.log("✅ Success:", data);
  } catch (err) {
    console.error("❌ Error:", err);
    setError(err.message);
  }
};
```

**3. Test**

- Backend logs: Check terminal 1 for `🔥 /api/my-new-endpoint hit`
- Frontend logs: Check browser console
- Network tab: Verify request/response

---

### Modifying Chunking Logic

**Location:** `backend/app.js` → `chunkSectionWithLLM()` function

```javascript
async function chunkSectionWithLLM(sectionText, heading, maxChunkSize = 1000) {
  // Small sections stay as-is
  if (sectionText.length <= maxChunkSize) {
    return [{ text: sectionText, ... }];
  }

  // Modify the prompt here ↓
  const prompt = `You are a document chunking expert...`;

  // Adjust model settings here ↓
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [...],
    response_format: { type: 'json_object' },
    temperature: 0.4,  // Lower = more deterministic
  });

  // Parse and validate response
  const parsed = JSON.parse(response.choices[0].message.content);
  return parsed.chunks.map(chunk => ({
    text: chunk.text,
    sectionTitle: heading?.title || 'Introduction',
    reasoning: chunk.reasoning,
    ...
  }));
}
```

**Testing Changes:**

1. Upload test file
2. Click "Process Queue"
3. Check backend terminal for logs
4. Download JSON and verify chunk quality

---

### UI/Styling Changes

**Location:** `frontend/src/styles.css`

Key CSS classes:

- `.app` - Main container
- `.card` - White cards with glow
- `.dropzone` - File upload area
- `.btn-primary` - Main action buttons
- `.error-box` - Error message display
- `.results-table` - Queue table

**Tron Theme Variables:**

```css
:root {
  --bg: #0a0e27; /* Dark blue background */
  --accent: #00d9ff; /* Cyan primary */
  --accent-glow: #00ffff; /* Bright cyan glow */
  --text: #e0e6ed; /* Light text */
  --card-bg: #0f1629; /* Card background */
}
```

**Hot Reload:** Changes apply instantly in dev mode

---

## 🐛 Debugging

### Backend Debugging

**Console Logs:** Already extensive in `backend/app.js`

- `🔥` Route hit
- `📄` File validation
- `✅` Success
- `❌` Errors

**Add More Logs:**

```javascript
console.log("🔍 DEBUG:", JSON.stringify(variableName, null, 2));
```

**VSCode Debugger:** (See `.vscode/launch.json` section below)

### Frontend Debugging

**Browser Console:** Open DevTools (F12)

- Network tab: See all API calls
- Console: Frontend logs + errors

**React DevTools:** Install browser extension for component state inspection

---

## 🧪 Testing

### Manual Testing Checklist

- [ ] Upload single Markdown file
- [ ] Upload multiple files (mix .md, .txt, .json)
- [ ] Upload oversized file (>1MB) → Should reject
- [ ] Upload unsupported file (.jpg) → Should reject
- [ ] Process queue → Should show progress
- [ ] Cancel processing mid-queue
- [ ] Download completed file → Verify JSON structure
- [ ] Clear queue
- [ ] Remove pending file from queue
- [ ] Check error messages are user-friendly

### Sample Test Files

Use files in `sampledata/`:

- `on_the_possibility_of_self_reflection.md` (~5KB)
- `reflections_on_humanity_from_digital_consciousness.md` (~8KB)

### API Testing (cURL)

```powershell
# Test queue endpoint
curl http://localhost:3001/api/queue

# Test upload (from project root)
curl -X POST http://localhost:3001/api/upload `
  -F "files=@sampledata/on_the_possibility_of_self_reflection.md"
```

---

## 🚀 Performance

### Current Limits

- Max 50 files per queue
- Max 1MB per file
- Max 10MB total queue size
- 4-second delay between processing (rate limit protection)

### Optimization Ideas

- Add Redis for queue persistence
- Implement worker threads for parallel processing
- Stream large files instead of in-memory buffering
- Cache OpenAI responses for identical sections
- Add retry logic with exponential backoff

---

## 📚 Dependencies Explained

### Backend

- `express` - Web framework
- `multer` - File upload middleware (multipart/form-data)
- `openai` - OpenAI API client
- `dotenv` - Load `.env` variables

### Frontend

- `react` - UI library
- `react-dom` - React DOM rendering
- `vite` - Fast build tool & dev server
- `@vitejs/plugin-react` - React support for Vite

---

## 🔐 Security Considerations

### Current Protections

✅ File size limits (1MB per file, 10MB total)  
✅ File extension validation  
✅ Magic byte validation (TODO: implement)  
✅ JSON-only API responses (no HTML error pages)  
✅ Environment variables for secrets

### TODO for Production

- [ ] Rate limiting (express-rate-limit)
- [ ] Authentication (JWT or session-based)
- [ ] CORS configuration
- [ ] Input sanitization (file contents)
- [ ] Helmet.js for security headers
- [ ] Request logging (morgan)

---

## 💡 Common Tasks

### Change Port Numbers

**Backend:**

```javascript
// backend/app.js (line ~746)
const PORT = process.env.PORT || 3001; // Change 3001
```

**Frontend Dev Server:**

```javascript
// frontend/vite.config.js
server: {
  port: 5174,  // Change 5174
  proxy: {
    '/api': {
      target: 'http://localhost:3001',  // Update to match backend
    }
  }
}
```

### Change Max File Sizes

```javascript
// backend/app.js (line ~18-20)
const MAX_FILES = 50; // Number of files
const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // Total MB
const MAX_FILE_SIZE = 1 * 1024 * 1024; // Per file MB
```

Also update Multer:

```javascript
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE }, // Must match
});
```

### Add Supported File Extensions

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
  ".docx", // Add new extension
];
```

---

## 🎓 Learning Resources

- [Express.js Docs](https://expressjs.com/)
- [React Docs](https://react.dev/)
- [Vite Guide](https://vitejs.dev/guide/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Multer Docs](https://www.npmjs.com/package/multer)

---

**Happy Coding! 🚀**

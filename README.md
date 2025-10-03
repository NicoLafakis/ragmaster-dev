# 🚀 RAGMaster

**LLM-Powered Intelligent Document Chunking for RAG Systems**

Upload documents → GPT-5-mini chunks intelligently → Download JSON for your RAG pipeline.

Perfect for preparing documents for Retrieval Augmented Generation (RAG) systems.

---

## ✨ Features

### Document Processing

- 📄 **Multi-format Support**: Markdown, TXT, JSON, CSV, XML, HTML, RTF
- 🧠 **LLM-Powered Chunking**: GPT-5-mini analyzes semantic boundaries
- 🎯 **Perfect Section Boundaries**: Never splits across headings
- 🔍 **Auto Markdown Conversion**: Non-Markdown files converted with proper structure
- 📊 **Keyword Extraction**: Automatic key term identification
- 📝 **Smart Reasoning**: Each chunk explains why it was split there

### Queue System

- 📦 **Batch Processing**: Upload up to 50 files (10MB total)
- ⚡ **Sequential Processing**: 4-second cooling delay between files
- 🔄 **Live Status**: Real-time progress tracking
- ❌ **Cancellable**: Stop processing mid-queue
- 🎨 **Modern UI**: Tron-inspired cyberpunk interface

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+
- **OpenAI API Key** ([Get one here](https://platform.openai.com/api-keys))

### 1. Clone & Install

```powershell
# Clone the project from your preferred remote or copy the files locally
# For example, if you have a private repo, use your repository URL here.
# git clone <your-repo-url>
cd ragmaster
npm install
npm run frontend:install
```

### 2. Configure Environment

Create a `.env` file in the project root:

```bash
OPENAI_API_KEY=sk-proj-your-actual-key-here
```

### 3. Development Mode (RECOMMENDED)

**Option A: Use Start Script** (Opens 2 windows)

```powershell
.\start-dev.ps1
```

**Option B: Manual Start** (Run in 2 separate terminals)

Terminal 1 - Backend:

```powershell
npm start
# Backend runs at http://localhost:3001
```

Terminal 2 - Frontend:

```powershell
cd frontend
npm run dev
# Frontend runs at http://localhost:5174
# Vite proxy forwards /api/* → localhost:3001
```

**Open http://localhost:5174 in your browser**

### 4. Production Build

```powershell
npm run build
npm start
# Serves frontend + backend at http://localhost:3001
```

---

## 🎯 How to Use

1. **Upload Files**

   - Drag & drop or click to browse
   - Supported: `.md`, `.txt`, `.json`, `.csv`, `.xml`, `.html`, `.rtf`
   - Max: 1MB per file, 50 files total, 10MB combined

2. **Process Queue**

   - Click "🚀 Process Queue" button
   - Watch real-time progress (4s delay between files)
   - LLM converts non-Markdown files automatically

3. **Download Results**
   - Click "⬇️ Download" next to completed files
   - Get JSON with chunks, keywords, and metrics

---

## 📊 Output Format

```json
{
  "filename": "your_document.md",
  "processedAt": "2025-10-03T12:34:56.789Z",
  "keywords": ["RAG", "chunking", "semantic", "LLM"],
  "metrics": {
    "chunkCount": 15,
    "keywordCount": 10,
    "processingTimeMs": 8234,
    "conversionApplied": false
  },
  "totalChunks": 15,
  "chunks": [
    {
      "id": 1,
      "text": "Exact chunk text preserving all content...",
      "sectionTitle": "Introduction",
      "sectionLevel": 2,
      "charCount": 487,
      "wordCount": 72,
      "position": 1,
      "totalChunks": 15,
      "reasoning": "Complete introductory concept; natural paragraph break"
    }
  ]
}
```

---

## 🧠 How It Works

1. **Format Detection** - Checks file extension
2. **Markdown Conversion** - If not `.md`, GPT-5-mini converts with proper headings
3. **Heading Extraction** - Identifies all Markdown headings (`#`, `##`, `###`)
4. **Section Splitting** - Headings are HARD BOUNDARIES (never crossed)
5. **LLM Chunking** - GPT-5-mini analyzes each section:
   - If ≤ 1000 chars → Single chunk
   - If > 1000 chars → Split at natural semantic boundaries
6. **Never Splits** - Mid-sentence or across headings
7. **Reasoning** - Each chunk explains why boundary was chosen
8. **Keywords** - TF-IDF extraction of key terms

---

## 💰 Cost

- **Model**: `gpt-5-mini-2025-08-07`
- **Cost**: ~$0.002 per 10,000-word document
- **Example**: 5,000-word document ≈ $0.001
- Very affordable for production use

---

├── backend/

│ └── app.js # Express server (329 lines)### Run Backend in Dev Mode (with auto-restart)

├── frontend/```powershell

│ └── src/npm run dev

│ ├── App.jsx # React UI (3-step workflow)```

│ ├── main.jsx # Entry point

│ └── styles.css # Tron-inspired dark theme### Run Frontend Dev Server (with hot reload)

├── sampledata/ # Example .md files```powershell

├── .env # Your API key (git-ignored)# Terminal 1: Backend

├── .env.example # Template for .envnpm run dev

└── package.json # Dependencies

````# Terminal 2: Frontend (runs on port 5174)

npm run frontend:dev

## 🔧 Dependencies```



**Production**:### Linting

- `express` - Web server```powershell

- `multer` - File upload handling# Lint backend

- `openai` - GPT-5-mini APInpm run lint

## 📁 Project Structure

````

ragmaster/
├── backend/
│ └── app.js # Express server + API routes
├── frontend/
│ ├── src/
│ │ ├── App.jsx # Main React component
│ │ ├── main.jsx # React entry point
│ │ └── styles.css # Tron-inspired UI
│ ├── vite.config.js # Vite config + dev proxy
│ └── package.json # Frontend dependencies
├── sampledata/
│ ├── on_the_possibility_of_self_reflection.md
│ └── reflections_on_humanity_from_digital_consciousness.md
├── .env # Environment variables (YOU CREATE THIS)
├── package.json # Backend dependencies + scripts
├── start-dev.ps1 # Development server launcher
├── test-server.ps1 # Diagnostic script
└── README.md # This file

````

---

## �️ Development

### Available Scripts

```powershell
# Backend only (port 3001)
npm start

# Frontend dev server only (port 5174)
cd frontend
npm run dev

# Build frontend for production
npm run build

# Lint frontend code
npm run frontend:lint

# Start both servers (recommended)
.\start-dev.ps1
````

### Development Workflow

1. **Make changes** to `backend/app.js` or `frontend/src/App.jsx`
2. **Backend auto-restarts** if you use `nodemon` (optional: `npm i -D nodemon`)
3. **Frontend hot-reloads** automatically (Vite HMR)
4. **Check logs** in both terminal windows
5. **Test in browser** at http://localhost:5174

### Adding Features

- **New API endpoint**: Add route in `backend/app.js`
- **UI changes**: Edit `frontend/src/App.jsx` and `styles.css`
- **Environment vars**: Add to `.env` and update `.env.example`

---

## 📡 API Reference

### POST `/api/upload`

Upload files to processing queue.

**Request:** `multipart/form-data` with field name `files` (max 50 files)

**Response:**

```json
{
  "success": true,
  "filesAdded": 2,
  "queueSize": 2,
  "files": [
    {
      "id": "file_1696342800000_abc123",
      "filename": "document.md",
      "size": 5242
    }
  ],
  "errors": ["image.png: images not allowed"]
}
```

### POST `/api/process-queue`

Start processing all pending files.

**Response:**

```json
{
  "success": true,
  "message": "Started processing 5 files",
  "queueSize": 5
}
```

### GET `/api/queue`

Get current queue status.

**Response:**

```json
{
  "stats": {
    "totalFiles": 5,
    "pending": 2,
    "processing": 1,
    "completed": 2,
    "failed": 0,
    "isProcessing": true
  },
  "files": [
    {
      "id": "file_1696342800000_abc123",
      "filename": "document.md",
      "status": "completed",
      "originalSize": 5242,
      "metrics": {
        "chunkCount": 15,
        "keywordCount": 10,
        "processingTimeMs": 8234,
        "conversionApplied": false
      },
      "uploadedAt": "2025-10-03T12:00:00.000Z",
      "completedAt": "2025-10-03T12:00:08.234Z"
    }
  ]
}
```

### GET `/api/download/:fileId`

Download processed file as JSON.

**Response:** JSON file download with chunks and metadata

### POST `/api/cancel-queue`

Stop processing after current file completes.

### POST `/api/clear-queue`

Remove all files from queue.

### DELETE `/api/queue/:fileId`

Remove specific file from queue (not currently processing).

---

## 🐛 Troubleshooting

### ❌ "Upload failed - 404 Not Found"

**Cause:** Frontend can't reach backend API

**Solutions:**

1. Verify both servers are running:

   - Backend: http://localhost:3001 (check terminal)
   - Frontend: http://localhost:5174 (check terminal)

2. Check `frontend/vite.config.js` has proxy:

   ```javascript
   server: {
     proxy: {
       '/api': {
         target: 'http://localhost:3001',
         changeOrigin: true,
       }
     }
   }
   ```

3. Restart frontend dev server after proxy changes

### ❌ "OPENAI_API_KEY not found"

**Solutions:**

1. Create `.env` file in project root (not in `backend/`)
2. Format: `OPENAI_API_KEY=sk-proj-...` (no quotes, no spaces)
3. Restart backend server: `npm start`
4. Verify key loaded: Check terminal shows "🔑 OPENAI_API_KEY loaded"

### ❌ "Port already in use"

**Solutions:**

```powershell
# Kill all Node processes
Stop-Process -Name node -Force

# Or kill specific port (3001 example)
$port = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($port) { Stop-Process -Id $port.OwningProcess -Force }
```

### ⚠️ Frontend shows HTML error page

**Cause:** Backend returned error as HTML instead of JSON

**Already Fixed:** Error middleware ensures JSON responses

**Verify:** Check browser console for detailed error with status code

### 🔄 Changes not reflecting

**Solutions:**

- **Backend**: Restart `npm start` (or use nodemon for auto-restart)
- **Frontend**: Vite should hot-reload automatically
- **Hard refresh**: Ctrl+F5 or clear browser cache

---

## � Deployment

### Railway / Heroku / Render

1. **Environment Variables:**

   ```
   OPENAI_API_KEY=sk-proj-...
   ```

   (Don't set PORT manually - platforms auto-assign)

2. **Build Command:**

   ```bash
   npm install && npm run frontend:install && npm run build
   ```

3. **Start Command:**

   ```bash
   npm start
   ```

4. **Root Directory:** Project root (not `backend/`)

### Vercel / Netlify (Serverless)

Not recommended - this app needs persistent server for queue management. Use Railway instead.

---

## 💡 Tips

- **Sample files** in `sampledata/` folder - try these first!
- **Max 1MB per file** - chunk very large docs before upload
- **4-second delay** between files prevents rate limiting
- **Queue persists** until server restart (in-memory only)
- **Cost-effective**: ~$0.001 per 5,000-word document

---

## � License

MIT

---

**Built with ❤️ using Express, React, and GPT-5-mini**

_Perfect chunk boundaries. Every time. 🎯_

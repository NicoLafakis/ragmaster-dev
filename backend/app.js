/**
 * RAGMaster - Queue-Based LLM-Powered Chunking Server
 * Upload multiple files → Queue → Process sequentially → Download results
 */

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Load .env from parent directory (project root)
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const OpenAI = require("openai");

const app = express();

// Queue configuration
const MAX_FILES = 50;
const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB per file
const PROCESSING_DELAY = 4000; // 4 seconds between files
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
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

app.use(express.json());

// Request logging middleware (BEFORE routes)
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Serve frontend
const distPath = path.join(__dirname, "..", "frontend", "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  console.log(`✅ Serving static files from: ${distPath}`);
} else {
  console.log(`⚠️  Frontend dist not found at: ${distPath}`);
}

// Initialize OpenAI
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY not found in .env file!");
  process.exit(1);
}

console.log(
  `🔑 OPENAI_API_KEY loaded (length: ${process.env.OPENAI_API_KEY.length})`
);

let openai;
try {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log("✅ OpenAI client initialized");
} catch (error) {
  console.error("❌ Failed to initialize OpenAI client:", error.message);
  process.exit(1);
}

const MODEL = "gpt-5-mini-2025-08-07";

// Queue system
const fileQueue = [];
let isProcessing = false;
let processingCancelled = false;

/**
 * File queue item structure
 */
const createQueueItem = (file, content) => ({
  id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  filename: file.originalname,
  originalSize: file.size,
  content,
  status: "pending", // pending | processing | completed | failed
  uploadedAt: new Date().toISOString(),
  startedAt: null,
  completedAt: null,
  chunks: null,
  keywords: null,
  error: null,
  metrics: {
    chunkCount: 0,
    keywordCount: 0,
    processingTimeMs: 0,
    conversionApplied: false,
  },
});

/**
 * LEGACY FUNCTIONS - Kept for reference but no longer used
 * The new processDocumentWithLLM function replaces these
 */

/**
 * Extract Markdown headings (LEGACY)
 */
/*
function extractHeadings(text) {
  const lines = text.split('\n');
  const headings = [];
  
  lines.forEach((line, index) => {
    const match = line.trim().match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        level: match[1].length,
        title: match[2].trim(),
        lineIndex: index,
      });
    }
  });
  
  return headings;
}
*/

/**
 * Split text into sections by headings (LEGACY)
 */
/*
function splitBySections(text, headings) {
  if (!headings.length) {
    return [{ heading: null, text, startLine: 0 }];
  }
  
  const lines = text.split('\n');
  const sections = [];
  
  // Text before first heading
  if (headings[0].lineIndex > 0) {
    const intro = lines.slice(0, headings[0].lineIndex).join('\n').trim();
    if (intro) {
      sections.push({
        heading: null,
        text: intro,
        startLine: 0,
      });
    }
  }
  
  // Each heading section
  for (let i = 0; i < headings.length; i++) {
    const current = headings[i];
    const next = headings[i + 1];
    const startLine = current.lineIndex;
    const endLine = next ? next.lineIndex : lines.length;
    
    const sectionText = lines.slice(startLine, endLine).join('\n').trim();
    if (sectionText) {
      sections.push({
        heading: current,
        text: sectionText,
        startLine,
      });
    }
  }
  
  return sections;
}
*/

/**
 * Extract keywords from text using LLM (LEGACY)
 */
/*
const extractKeywords = async (text, maxKeywords = 10) => {
  const prompt = `Extract the ${maxKeywords} most important keywords or key phrases from this document.

**Requirements:**
1. Return single words or short phrases (1-3 words max)
2. Focus on domain-specific terms, concepts, and topics
3. Avoid generic words like "the", "and", "is"
4. Return ONLY a JSON array of strings

**Text:**
${text.slice(0, 3000)}...

**Output format:** ["keyword1", "keyword2", ...]`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a keyword extraction expert. Return ONLY valid JSON array of strings.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
    });
    
    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);
    return parsed.keywords || [];
  } catch (error) {
    console.error('Error extracting keywords:', error.message);
    return [];
  }
};
*/

/**
 * Process entire document with LLM (LEGACY)
 */
/*
async function processDocument(text, headings, maxChunkSize = 1000, onProgress) {
  const sections = splitBySections(text, headings);
  const allChunks = [];
  let processed = 0;
  
  for (const section of sections) {
    // Check for cancellation
    if (processingCancelled) {
      console.log('Processing cancelled by user');
      throw new Error('Processing cancelled by user');
    }
    
    const sectionTitle = section.heading?.title || 'Introduction';
    const progressData = { 
      current: processed + 1, 
      total: sections.length,
      section: sectionTitle,
      status: 'processing'
    };
    
    onProgress(progressData);
    
    const sectionChunks = await chunkSectionWithLLM(
      section.text, 
      section.heading, 
      maxChunkSize
    );
    
    allChunks.push(...sectionChunks);
    processed++;
  }
  
  // Add global IDs
  return allChunks.map((chunk, idx) => ({
    id: idx + 1,
    ...chunk,
    position: idx + 1,
    totalChunks: allChunks.length,
    wordCount: chunk.text.split(/\s+/).length,
  }));
}
*/

/**
 * Convert any file format to Markdown using LLM
 */
async function convertToMarkdown(content, filename) {
  // If already markdown, return as-is
  if (filename.endsWith(".md") || filename.endsWith(".markdown")) {
    return content;
  }

  const prompt = `Convert this document to well-structured Markdown format.

**Requirements:**
1. Identify main sections and create ## headings for them
2. Identify subsections and create ### headings for them  
3. Preserve all content but format it as clean Markdown
4. Use proper Markdown syntax (headings, lists, bold, italic, code blocks)
5. Create a logical heading hierarchy based on document structure
6. Return ONLY the converted Markdown, no explanations

**Document to convert:**
${content}`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a document formatting expert. Convert documents to well-structured Markdown with proper headings.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error("Error converting to Markdown:", error.message);
    throw new Error(`Failed to convert document: ${error.message}`);
  }
}

/**
 * LEGACY - Generate SHA256 checksum for content (not used - LLM handles this)
 */
/*
function generateChecksum(content) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex');
}
*/

/**
 * Process document using new comprehensive conversion prompt
 *
 * Expected output structure (example):
 * {
 *   "doc": {
 *     "doc_id": "doc_01HZY3D9V7QG",
 *     "canonical_id": "aligned-query-expansion-rewrite",
 *     "created_at": "2025-10-03T00:00:00Z",
 *     "updated_at": "2025-10-03T00:00:00Z",
 *     "checksum_sha256": "<sha256-of-markdown>",
 *     "source_type": "markdown",
 *     "source_uri": "filename.md",
 *     "visibility": "internal",
 *     "language": "en",
 *     "title": "Document Title",
 *     "toc": [...]
 *   },
 *   "content": {
 *     "text_plain": "...",
 *     "token_count": 4200
 *   },
 *   "chunks": [...],
 *   "augment": {
 *     "summary": "...",
 *     "highlights": [...],
 *     "qa": [...]
 *   },
 *   "retrieval_hints": {
 *     "domain_tags": [...],
 *     "audience": "...",
 *     "freshness": {...},
 *     "routing": [...]
 *   },
 *   "security": {
 *     "pii_flags": [],
 *     "policy_tags": []
 *   },
 *   "embeddings_meta": {...}
 * }
 */
async function processDocumentWithLLM(markdown, docId, sourceUri) {
  const prompt = `You are a converter. Input: (1) full markdown, (2) doc_id, (3) source_uri. Output: a single MINIFIED JSON object with fields exactly: doc, content, chunks, augment, retrieval_hints, security, embeddings_meta.
Rules:
- In doc, include only: doc_id, canonical_id, created_at, updated_at, checksum_sha256, source_type, source_uri, visibility, language, title, toc.
- Generate toc from headings with anchors and char_range.
- Produce chunks of ~200–300 tokens, ~20% overlap; never split code/table blocks. Include: chunk_id, position, char_range, section_path, heading, heading_level, type, markdown, text, tokens, overlap_tokens, embedding.vector_id, sparse_terms, keywords, entities, citations.
- Populate augment.summary, three highlights, and 1–3 QA items with span_refs pointing to chunk_id+char_range.
- Do NOT include version, license, or authors anywhere.
- Do NOT include embedding vectors; only placeholders or ids.
- Return only minified JSON (no comments).

**Input:**
doc_id: ${docId}
source_uri: ${sourceUri}

**Markdown:**
${markdown}`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a document converter. Return ONLY valid minified JSON, no markdown code blocks, no explanations.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);

    if (!parsed.doc || !parsed.chunks) {
      throw new Error(
        "LLM returned invalid structure - missing required fields"
      );
    }

    return parsed;
  } catch (error) {
    console.error(`Error processing document:`, error.message);
    throw error;
  }
}

/**
 * LEGACY - Kept for backwards compatibility but not used
 */
// Old generateChecksum was here - now integrated into processDocumentWithLLM

/**
 * LEGACY - Extract keywords from text using LLM (not used with new approach)
 */
/*
const extractKeywords = async (text, maxKeywords = 10) => {
  const prompt = `Extract the ${maxKeywords} most important keywords or key phrases from this document.

**Requirements:**
1. Return single words or short phrases (1-3 words max)
2. Focus on domain-specific terms, concepts, and topics
3. Avoid generic words like "the", "and", "is"
4. Return ONLY a JSON array of strings

**Text:**
${text.slice(0, 3000)}...

**Output format:** ["keyword1", "keyword2", ...]`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a keyword extraction expert. Return ONLY valid JSON array of strings.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
    });
    
    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);
    return parsed.keywords || [];
  } catch (error) {
    console.error('Error extracting keywords:', error.message);
    return [];
  }
};
*/

/**
 * LEGACY - Process entire document with LLM (not used with new approach)
 */
/*
async function processDocument(text, headings, maxChunkSize = 1000, onProgress) {
  const sections = splitBySections(text, headings);
  const allChunks = [];
  let processed = 0;
  
  for (const section of sections) {
    // Check for cancellation
    if (processingCancelled) {
      console.log('Processing cancelled by user');
      throw new Error('Processing cancelled by user');
    }
    
    const sectionTitle = section.heading?.title || 'Introduction';
    const progressData = { 
      current: processed + 1, 
      total: sections.length,
      section: sectionTitle,
      status: 'processing'
    };
    
    onProgress(progressData);
    
    const sectionChunks = await chunkSectionWithLLM(
      section.text, 
      section.heading, 
      maxChunkSize
    );
    
    allChunks.push(...sectionChunks);
    processed++;
  }
  
  // Add global IDs
  return allChunks.map((chunk, idx) => ({
    id: idx + 1,
    ...chunk,
    position: idx + 1,
    totalChunks: allChunks.length,
    wordCount: chunk.text.split(/\s+/).length,
  }));
}
*/

/**
 * Process a single file from the queue
 */
const processSingleFile = async (queueItem) => {
  const startTime = Date.now();

  try {
    console.log(`\n📄 Starting to process: ${queueItem.filename}`);
    queueItem.status = "processing";
    queueItem.startedAt = new Date().toISOString();

    let content = queueItem.content;
    let conversionApplied = false;

    // Convert to Markdown if not already
    if (
      !queueItem.filename.endsWith(".md") &&
      !queueItem.filename.endsWith(".markdown")
    ) {
      console.log(`🔄 Converting ${queueItem.filename} to Markdown...`);
      conversionApplied = true;
      content = await convertToMarkdown(content, queueItem.filename);
      queueItem.content = content;
      console.log(`✓ Conversion complete`);
    }

    // Generate doc_id and process with new LLM approach
    const docId = `doc_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)
      .toUpperCase()}`;

    console.log(
      `🤖 Processing ${queueItem.filename} with comprehensive conversion...`
    );
    console.log(`   Doc ID: ${docId}`);
    console.log(`   Content length: ${content.length} characters`);

    const result = await processDocumentWithLLM(
      content,
      docId,
      queueItem.filename
    );

    console.log(`✓ LLM processing complete`);

    // Store the complete result structure
    queueItem.result = result;
    queueItem.chunks = result.chunks || [];
    queueItem.keywords = result.retrieval_hints?.domain_tags || [];
    queueItem.status = "completed";
    queueItem.completedAt = new Date().toISOString();
    queueItem.metrics = {
      chunkCount: result.chunks?.length || 0,
      keywordCount: queueItem.keywords.length,
      processingTimeMs: Date.now() - startTime,
      conversionApplied,
    };

    console.log(
      `✅ Completed ${queueItem.filename} - ${queueItem.chunks.length} chunks in ${queueItem.metrics.processingTimeMs}ms\n`
    );
  } catch (error) {
    queueItem.status = "failed";
    queueItem.error = error.message;
    queueItem.completedAt = new Date().toISOString();
    queueItem.metrics.processingTimeMs = Date.now() - startTime;
    console.error(`❌ Failed ${queueItem.filename}:`, error.message);
    console.error(`   Stack trace:`, error.stack);
  }
};

/**
 * Process queue sequentially with delays
 * CRITICAL: Use atomic check-and-set pattern to prevent race conditions
 */
const processQueue = async () => {
  // Atomic check-and-set to prevent race conditions
  if (isProcessing) {
    console.log("⚠️  Queue already processing, skipping...");
    return { alreadyProcessing: true };
  }

  // Set flag BEFORE any async operations
  isProcessing = true;
  processingCancelled = false;

  try {
    console.log(`🚀 Starting queue processing (${fileQueue.length} files)`);

    // RECOVERY: Reset any files stuck in "processing" state from previous crash/error
    const stuckFiles = fileQueue.filter((f) => f.status === "processing");
    if (stuckFiles.length > 0) {
      console.warn(
        `⚠️  Found ${stuckFiles.length} files stuck in 'processing' state`
      );
      console.warn("   Resetting them to 'pending' for retry...");
      stuckFiles.forEach((f) => {
        f.status = "pending";
        f.startedAt = null;
      });
    }

    const pendingFiles = fileQueue.filter((f) => f.status === "pending");

    if (pendingFiles.length === 0) {
      console.log("ℹ️  No pending files to process");
      return { processed: 0 };
    }

    for (const queueItem of pendingFiles) {
      if (processingCancelled) {
        console.log("⛔ Queue processing cancelled");
        break;
      }

      await processSingleFile(queueItem);

      // Delay before next file (unless it's the last one)
      const remainingPending = fileQueue.filter(
        (f) => f.status === "pending"
      ).length;
      if (remainingPending > 0) {
        console.log(`⏸️  Cooling down for ${PROCESSING_DELAY / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, PROCESSING_DELAY));
      }
    }

    console.log("🏁 Queue processing complete");
    return { processed: pendingFiles.length };
  } catch (error) {
    console.error("❌ Critical error in processQueue:", error.message);
    console.error("   Stack trace:", error.stack);
    throw error; // Re-throw to signal error to caller
  } finally {
    // ALWAYS reset the flag, even if error occurs
    isProcessing = false;
    console.log("🔓 Processing flag released");
  }
};

// =============================================================================
// API ENDPOINTS
// =============================================================================

/**
 * 1. Upload files (multiple)
 */
app.post("/api/upload", upload.array("files", MAX_FILES), async (req, res) => {
  console.log(`🔥 /api/upload hit - Files: ${req.files?.length || 0}`);

  try {
    if (!req.files || req.files.length === 0) {
      console.log("❌ No files in request");
      return res.status(400).json({
        error: "No files uploaded",
        details:
          'Request contained no files. Check FormData and field name "files".',
      });
    }

    // Validate file count
    const currentQueueSize = fileQueue.length;
    if (currentQueueSize + req.files.length > MAX_FILES) {
      console.log(
        `❌ Queue limit exceeded: ${currentQueueSize} + ${req.files.length} > ${MAX_FILES}`
      );
      return res.status(400).json({
        error: `Queue limit exceeded. Maximum ${MAX_FILES} files allowed. Current: ${currentQueueSize}`,
        details: `You tried to upload ${req.files.length} files but queue already has ${currentQueueSize}.`,
      });
    }

    // Calculate total size
    const currentTotalSize = fileQueue.reduce(
      (sum, f) => sum + f.originalSize,
      0
    );
    const newTotalSize = req.files.reduce((sum, f) => sum + f.size, 0);

    if (currentTotalSize + newTotalSize > MAX_TOTAL_SIZE) {
      console.log(
        `❌ Size limit exceeded: ${currentTotalSize} + ${newTotalSize} > ${MAX_TOTAL_SIZE}`
      );
      return res.status(400).json({
        error: `Total size limit exceeded. Maximum ${(
          MAX_TOTAL_SIZE /
          1024 /
          1024
        ).toFixed(1)}MB allowed.`,
        details: `Current queue: ${(currentTotalSize / 1024 / 1024).toFixed(
          2
        )}MB, New upload: ${(newTotalSize / 1024 / 1024).toFixed(2)}MB`,
      });
    }

    // Validate each file
    const validatedFiles = [];
    const errors = [];

    for (const file of req.files) {
      console.log(`  📄 Validating: ${file.originalname} (${file.size} bytes)`);

      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        const errMsg = `${file.originalname}: exceeds 1MB limit (${(
          file.size / 1024
        ).toFixed(0)}KB)`;
        console.log(`  ❌ ${errMsg}`);
        errors.push(errMsg);
        continue;
      }

      // Check file extension
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        const errMsg = `${file.originalname}: unsupported file type "${ext}"`;
        console.log(`  ❌ ${errMsg}`);
        errors.push(errMsg);
        continue;
      }

      // Check if it's an image
      const imageExtensions = [
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".bmp",
        ".webp",
        ".svg",
      ];
      if (imageExtensions.includes(ext)) {
        const errMsg = `${file.originalname}: images not allowed`;
        console.log(`  ❌ ${errMsg}`);
        errors.push(errMsg);
        continue;
      }

      const content = file.buffer.toString("utf8");
      const queueItem = createQueueItem(file, content);
      fileQueue.push(queueItem);
      validatedFiles.push({
        id: queueItem.id,
        filename: queueItem.filename,
        size: queueItem.originalSize,
      });
      console.log(`  ✅ Added to queue: ${file.originalname}`);
    }

    const response = {
      success: true,
      filesAdded: validatedFiles.length,
      queueSize: fileQueue.length,
      files: validatedFiles,
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log(
      `✅ Upload complete: ${validatedFiles.length} files added, ${errors.length} errors`
    );
    res.json(response);

    // Auto-start processing if files were added and queue is not already processing
    // Use setImmediate to avoid blocking the response, but still handle errors
    if (validatedFiles.length > 0 && !isProcessing) {
      console.log("🚀 Auto-starting queue processing...");
      setImmediate(async () => {
        try {
          await processQueue();
        } catch (err) {
          console.error("❌ Error auto-starting queue:", err.message);
          // Don't re-throw - this is a background operation
        }
      });
    }
  } catch (error) {
    console.error("❌ Upload error:", error);
    res.status(500).json({
      error: error.message,
      details: error.stack,
      type: error.name,
    });
  }
});

// -----------------------------------------------------------------------------
// Centralized error handling (ensures JSON instead of HTML error pages)
// -----------------------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error("🔴 Error middleware triggered:", err);

  // Multer file size or other upload errors
  if (err && err.name === "MulterError") {
    console.error("🔴 Multer error:", err.code, err.message);
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: `File exceeds 1MB limit (MAX_FILE_SIZE).`,
        details: err.message,
        code: err.code,
      });
    }
    return res.status(400).json({
      error: err.message,
      details: "Multer upload error",
      code: err.code,
    });
  }

  if (err) {
    console.error("🔴 Unhandled server error:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
  next();
});

/**
 * 2. Start queue processing
 */
app.post("/api/process-queue", async (req, res) => {
  try {
    const pendingCount = fileQueue.filter((f) => f.status === "pending").length;

    if (pendingCount === 0) {
      return res.status(400).json({ error: "No pending files in queue" });
    }

    if (isProcessing) {
      return res.status(400).json({ error: "Queue is already processing" });
    }

    // Start processing asynchronously
    processQueue();

    res.json({
      success: true,
      message: `Started processing ${pendingCount} files`,
      queueSize: fileQueue.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 3. Get queue status
 */
app.get("/api/queue", (req, res) => {
  const stats = {
    totalFiles: fileQueue.length,
    pending: fileQueue.filter((f) => f.status === "pending").length,
    processing: fileQueue.filter((f) => f.status === "processing").length,
    completed: fileQueue.filter((f) => f.status === "completed").length,
    failed: fileQueue.filter((f) => f.status === "failed").length,
    isProcessing,
  };

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

  res.json({
    stats,
    files: fileQueue.map((f) => ({
      id: f.id,
      filename: f.filename,
      status: f.status,
      originalSize: f.originalSize,
      metrics: f.metrics,
      error: f.error,
      uploadedAt: f.uploadedAt,
      completedAt: f.completedAt,
    })),
  });
});

/**
 * 4. Download individual file result
 */
app.get("/api/download/:fileId", (req, res) => {
  const { fileId } = req.params;
  const queueItem = fileQueue.find((f) => f.id === fileId);

  if (!queueItem) {
    return res.status(404).json({ error: "File not found" });
  }

  if (queueItem.status !== "completed") {
    return res.status(400).json({ error: "File not yet processed" });
  }

  // Return the full comprehensive result structure if available,
  // otherwise fall back to legacy format for backwards compatibility
  let output;

  if (queueItem.result) {
    // New comprehensive format
    output = {
      filename: queueItem.filename,
      processedAt: queueItem.completedAt,
      metrics: queueItem.metrics,
      result: queueItem.result, // Full doc/content/chunks/augment/retrieval_hints/security/embeddings_meta
    };
  } else {
    // Legacy format (fallback)
    output = {
      filename: queueItem.filename,
      processedAt: queueItem.completedAt,
      keywords: queueItem.keywords,
      metrics: queueItem.metrics,
      totalChunks: queueItem.chunks.length,
      chunks: queueItem.chunks,
    };
  }

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${queueItem.filename}.chunks.json"`
  );
  res.send(JSON.stringify(output, null, 2));
});

/**
 * 5. Cancel queue processing
 */
app.post("/api/cancel-queue", (req, res) => {
  processingCancelled = true;
  res.json({
    success: true,
    message: "Queue processing will stop after current file",
  });
});

/**
 * 6. Clear queue
 */
app.post("/api/clear-queue", (req, res) => {
  const clearedCount = fileQueue.length;
  fileQueue.length = 0;
  isProcessing = false;
  processingCancelled = false;

  res.json({
    success: true,
    message: `Cleared ${clearedCount} files from queue`,
  });
});

/**
 * 6a. Debug endpoint - Force reset processing flag
 */
app.post("/api/debug/reset-processing", (req, res) => {
  const wasProcessing = isProcessing;
  isProcessing = false;
  processingCancelled = false;

  console.log(`🔧 Debug: Reset processing flag (was: ${wasProcessing})`);

  res.json({
    success: true,
    message: `Processing flag reset (was: ${wasProcessing})`,
    queueStats: {
      totalFiles: fileQueue.length,
      pending: fileQueue.filter((f) => f.status === "pending").length,
      processing: fileQueue.filter((f) => f.status === "processing").length,
      completed: fileQueue.filter((f) => f.status === "completed").length,
      failed: fileQueue.filter((f) => f.status === "failed").length,
      isProcessing: false,
    },
  });
});

/**
 * 7. Remove specific file from queue
 */
app.delete("/api/queue/:fileId", (req, res) => {
  const { fileId } = req.params;
  const index = fileQueue.findIndex((f) => f.id === fileId);

  if (index === -1) {
    return res.status(404).json({ error: "File not found" });
  }

  const file = fileQueue[index];

  if (file.status === "processing") {
    return res
      .status(400)
      .json({ error: "Cannot remove file currently being processed" });
  }

  fileQueue.splice(index, 1);
  res.json({ success: true, message: `Removed ${file.filename}` });
});

// Serve frontend for all other routes
app.get("*", (req, res) => {
  const indexPath = path.join(distPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Frontend not built. Run: npm run build");
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("🚀 RAGMaster - Queue-Based LLM Chunking Server");
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`🤖 Model: ${MODEL}`);
  console.log(
    `📊 Limits: ${MAX_FILES} files, ${(MAX_TOTAL_SIZE / 1024 / 1024).toFixed(
      1
    )}MB total, ${(MAX_FILE_SIZE / 1024).toFixed(0)}KB per file`
  );
  console.log("✅ Ready for uploads");
  console.log("\n📋 Registered routes:");
  console.log("  POST   /api/upload");
  console.log("  POST   /api/process-queue");
  console.log("  GET    /api/queue");
  console.log("  GET    /api/download/:fileId");
  console.log("  POST   /api/cancel-queue");
  console.log("  POST   /api/clear-queue");
  console.log("  DELETE /api/queue/:fileId");
  console.log("");
});

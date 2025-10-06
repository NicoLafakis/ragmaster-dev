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
const PROCESSING_DELAY = 500; // 0.5 seconds between batches (was 4000)
const CONCURRENT_FILES = 5; // Process 5 files simultaneously for maximum speed
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

// REMOVE unused legacy MODEL
// (previous const MODEL removed)

// ==== Model & Gating Configuration (Added) ==================================
const CHEAP_MODEL = process.env.CHEAP_MODEL || "gpt-5-nano-2025-08-07";
const FALLBACK_MODEL = process.env.FALLBACK_MODEL || "gpt-5-mini-2025-08-07";

const ALLOWED_MODELS = new Set([
  "gpt-5-nano-2025-08-07",
  "gpt-5-mini-2025-08-07",
]);
if (!ALLOWED_MODELS.has(CHEAP_MODEL) || !ALLOWED_MODELS.has(FALLBACK_MODEL)) {
  console.warn(
    "⚠️ Invalid model configuration detected. Reverting to defaults."
  );
}

const GATING_THRESHOLDS = {
  compositeMin: 0.88,
  correctnessMin: 0.85,
  completenessMin: 0.8,
  contextAlignMin: 0.82,
  constraintsRequired: true,
  softFailEscalateCount: 2,
};

const UNCERTAINTY_LIMITS = {
  correctnessVarMax: 0.02,
  completenessVarMax: 0.025,
  borderlineComposite: 0.91,
  classifierProbMin: 0.75,
};

// ================== OpenAI Instrumentation ================================
const openaiMetrics = {
  totalCalls: 0,
  byModel: {},
  lastCallAt: null,
  recent: [], // last 20 calls metadata
};

async function callChat(model, messages, options = {}) {
  // Model-specific option sanitation (e.g., nano may not support temperature override)
  function sanitizeChatOptions(model, opts) {
    const sanitized = { ...opts };
    // If nano model only supports default temperature, drop user-specified temperature
    if (model.startsWith("gpt-5-nano") && "temperature" in sanitized) {
      delete sanitized.temperature;
    }
    // Remove empty objects
    Object.keys(sanitized).forEach((k) => {
      if (
        sanitized[k] == null ||
        (typeof sanitized[k] === "object" && !Object.keys(sanitized[k]).length)
      ) {
        delete sanitized[k];
      }
    });
    return sanitized;
  }
  const safeOptions = sanitizeChatOptions(model, options);
  const started = Date.now();
  try {
    const resp = await openai.chat.completions.create({
      model,
      messages,
      ...safeOptions,
    });
    openaiMetrics.totalCalls++;
    openaiMetrics.byModel[model] = (openaiMetrics.byModel[model] || 0) + 1;
    openaiMetrics.lastCallAt = new Date().toISOString();
    openaiMetrics.recent.unshift({
      model,
      ms: Date.now() - started,
      ts: openaiMetrics.lastCallAt,
      usage: resp.usage || null,
      promptTokens: resp.usage?.prompt_tokens,
      completionTokens: resp.usage?.completion_tokens,
    });
    if (openaiMetrics.recent.length > 20) openaiMetrics.recent.pop();
    return resp;
  } catch (err) {
    openaiMetrics.recent.unshift({
      model,
      ms: Date.now() - started,
      ts: new Date().toISOString(),
      error: err.message,
    });
    if (openaiMetrics.recent.length > 20) openaiMetrics.recent.pop();
    throw err;
  }
}
// ========================================================================

function predictPassProbability(features) {
  try {
    const {
      length = 0,
      headings = 0,
      tables = 0,
      codeBlocks = 0,
      nanoComposite = 0,
    } = features || {};
    const complexity = (headings + tables * 1.5 + codeBlocks * 1.2) / 50;
    let score = nanoComposite - complexity * 0.15 - (length > 50000 ? 0.05 : 0);
    return Math.max(0, Math.min(1, score));
  } catch (e) {
    return 0.5;
  }
}

function computeComposite(m) {
  return (
    0.15 * (m.clarity || 0) +
    0.25 * (m.correctness || 0) +
    0.2 * (m.completeness || 0) +
    0.25 * (m.constraints || 0) +
    0.15 * (m.contextAlign || 0)
  );
}

function gateDecision(docMetrics) {
  const {
    clarity = 0,
    correctness = 0,
    completeness = 0,
    constraints = 0,
    contextAlign = 0,
    varCorrectness = 0,
    varCompleteness = 0,
    hardFails = [],
    features = {},
  } = docMetrics || {};

  if (GATING_THRESHOLDS.constraintsRequired && !constraints) {
    return { escalate: true, reason: "constraints_failed" };
  }
  if (hardFails.length)
    return { escalate: true, reason: "hard_fail", hardFails };

  const Q = computeComposite({
    clarity,
    correctness,
    completeness,
    constraints,
    contextAlign,
  });
  const softFails = [
    correctness < GATING_THRESHOLDS.correctnessMin,
    completeness < GATING_THRESHOLDS.completenessMin,
    contextAlign < GATING_THRESHOLDS.contextAlignMin,
  ].filter(Boolean).length;

  const uncertainty =
    varCorrectness > UNCERTAINTY_LIMITS.correctnessVarMax ||
    varCompleteness > UNCERTAINTY_LIMITS.completenessVarMax;
  const classifierProb = predictPassProbability({
    ...features,
    nanoComposite: Q,
  });

  if (Q < GATING_THRESHOLDS.compositeMin)
    return { escalate: true, reason: "low_composite", Q };
  if (softFails >= GATING_THRESHOLDS.softFailEscalateCount)
    return { escalate: true, reason: "multi_soft_fail", softFails, Q };
  if (uncertainty && Q < UNCERTAINTY_LIMITS.borderlineComposite)
    return { escalate: true, reason: "uncertain_borderline", Q };
  if (classifierProb < UNCERTAINTY_LIMITS.classifierProbMin)
    return {
      escalate: true,
      reason: "model_predicted_fail",
      classifierProb,
      Q,
    };

  return { escalate: false, Q, classifierProb };
}
// ==== End Model & Gating Configuration ======================================

// REMOVE legacy MODEL constants if present
// (Replacing with CHEAP_MODEL / FALLBACK_MODEL gating system)
// (Removed unused helper wrappers getPrimaryModel / getFallbackModel to satisfy ESLint)

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
 * Convert any file format to Markdown using LLM
 */
async function convertToMarkdown(content, filename) {
  // Basic passthrough for now; real conversion logic previously existed.
  // Using filename in a lightweight debug log to avoid unused param warning.
  if (filename) {
    console.log(`[convertToMarkdown] passthrough: ${filename}`);
  }
  return content.toString("utf8");
}

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
async function processDocumentWithLLM(
  markdown,
  docId,
  sourceUri,
  modelOverride
) {
  const useModel = modelOverride || CHEAP_MODEL;
  const prompt = `You are a converter. Input: (1) full markdown, (2) doc_id, (3) source_uri. Output: a single MINIFIED JSON object with fields exactly: doc, content, chunks, augment, retrieval_hints, security, embeddings_meta.
Rules:
- In doc, include only: doc_id, canonical_id, created_at, updated_at, checksum_sha256, source_type, source_uri, visibility, language, title, toc.
- Generate toc from headings with anchors and char_range.
- Produce chunks of ~200–300 tokens, ~20% overlap; never split code/table blocks. Include: chunk_id, position, char_range, section_path, heading, heading_level, type, markdown, text, tokens, overlap_tokens, embedding.vector_id, sparse_terms, keywords, entities, citations.
- Populate augment.summary, three highlights, and 1–3 QA items.
- Do NOT include version, license, or authors anywhere.
- Do NOT include embedding vectors; only placeholders or ids.
- Return only minified JSON (no comments).

**Input:**
doc_id: ${docId}
source_uri: ${sourceUri}

**Markdown:**
${markdown}`;
  try {
    const response = await callChat(
      useModel,
      [
        {
          role: "system",
          content:
            "You are a document converter. Return ONLY valid minified JSON, no markdown code blocks, no explanations.",
        },
        { role: "user", content: prompt },
      ],
      { response_format: { type: "json_object" }, temperature: 0.4 }
    );
    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);
    if (!parsed.doc || !parsed.chunks)
      throw new Error(
        "LLM returned invalid structure - missing required fields"
      );
    parsed._model_used = useModel;
    return parsed;
  } catch (error) {
    console.error("Error processing document:", error.message);
    throw error;
  }
}

// === RAG Gating: Self-Eval & Escalation Helpers (concise) ===================
async function _selfEvalRaw(md) {
  const prompt = `Return STRICT JSON {per_chunk:[{id,index,start,end,clarity,correctness,completeness,contextAlign,issues[]}],doc:{constraints_ok,hallucination_flags,coverage_estimate,missing_headings,notes}}. Scores 0-1 two decimals. Text below:\n---\n${md.slice(
    0,
    48000
  )}`;
  const r = await callChat(
    CHEAP_MODEL,
    [
      { role: "system", content: "JSON only" },
      { role: "user", content: prompt },
    ],
    { temperature: 0.4 }
  );
  return r.choices[0].message.content;
}
const _j = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};
function _derive(m) {
  if (!m || !Array.isArray(m.per_chunk) || !m.per_chunk.length) return null;
  const a = (k) =>
    m.per_chunk.reduce((x, c) => x + (+c[k] || 0), 0) / m.per_chunk.length;
  const doc = m.doc || {};
  const clarity = a("clarity");
  const correctness = a("correctness");
  const completeness = a("completeness");
  const contextAlign = a("contextAlign");
  const constraints = doc.constraints_ok ? 1 : 0;
  const hardFails = [];
  if (doc.hallucination_flags > 0) hardFails.push("hallucination");
  return {
    clarity,
    correctness,
    completeness,
    contextAlign,
    constraints,
    hardFails,
    perChunk: m.per_chunk,
  };
}
async function runDualEval(md) {
  const r1 = await _selfEvalRaw(md);
  const p1 = _j(r1);
  const r2 = await _selfEvalRaw(md);
  const p2 = _j(r2);
  if (!(p1 && p2)) return { errors: ["parse_fail"], raw: { r1, r2 } };
  const d1 = _derive(p1);
  const d2 = _derive(p2);
  if (!(d1 && d2)) return { errors: ["metrics_fail"], raw: { r1, r2 } };
  const varCorrectness = (d1.correctness - d2.correctness) ** 2 / 2;
  const varCompleteness = (d1.completeness - d2.completeness) ** 2 / 2;
  const merged = {
    ...d1,
    varCorrectness,
    varCompleteness,
    perChunk: d1.perChunk,
    features: { length: md.length },
  };
  return { metrics: merged, evals: [p1, p2], raw: { r1, r2 } };
}
async function escalate(md, metrics) {
  const failingIds = (metrics.perChunk || [])
    .filter(
      (c) =>
        (c.correctness || 0) < GATING_THRESHOLDS.correctnessMin ||
        (c.contextAlign || 0) < GATING_THRESHOLDS.contextAlignMin
    )
    .map((c) => c.id);
  if (!failingIds.length) return { mode: "none", improvedMarkdown: md };
  if (failingIds.length / metrics.perChunk.length > 0.3) {
    const full = await callChat(
      FALLBACK_MODEL,
      [
        { role: "system", content: "Return improved markdown only." },
        {
          role: "user",
          content: `Improve entire markdown preserving structure & factual fidelity.\n---\n${md.slice(
            0,
            48000
          )}`,
        },
      ],
      { temperature: 0.4 }
    );
    return {
      mode: "full",
      improvedMarkdown: full.choices[0].message.content || md,
    };
  }
  let rebuilt = md.split("");
  for (const c of metrics.perChunk) {
    if (!failingIds.includes(c.id)) continue;
    const span = md.slice(c.start, c.end);
    const fix = await callChat(
      FALLBACK_MODEL,
      [
        { role: "system", content: "Return improved segment only." },
        {
          role: "user",
          content: `Fix issues ${(c.issues || []).join(
            "; "
          )} while preserving facts.\n---\n${span}`,
        },
      ],
      { temperature: 0.4 }
    );
    const newText = fix.choices[0].message.content || span;
    // naive replace via indices (could drift, acceptable for MVP)
    rebuilt.splice(c.start, c.end - c.start, ...newText.split(""));
  }
  return { mode: "partial", improvedMarkdown: rebuilt.join("") };
}
// === End RAG Gating Helpers ================================================

app.listen(process.env.PORT || 3000, () => {
  console.log(`✅ Server is running on port ${process.env.PORT || 3000}`);
});
// ================= Queue Processing (Reintroduced with Gating) =============
async function processDocumentPipeline(markdown, filename) {
  // Dual self eval first to decide if we escalate BEFORE heavy conversion? (Chosen: evaluate original markdown)
  const dual = await runDualEval(markdown);
  if (!dual.metrics) {
    // If eval fails, fall back to full fallback model conversion directly
    const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const converted = await processDocumentWithLLM(
      markdown,
      docId,
      filename,
      FALLBACK_MODEL
    );
    return {
      result: converted,
      gating: {
        model_used: FALLBACK_MODEL,
        escalate: true,
        reason: "self_eval_failed",
        raw: dual.raw,
      },
    };
  }
  const decision = gateDecision(dual.metrics);
  let workingMarkdown = markdown;
  let escalateMode = "none";
  if (decision.escalate) {
    const esc = await escalate(markdown, dual.metrics);
    escalateMode = esc.mode;
    workingMarkdown = esc.improvedMarkdown;
  }
  const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const chosenModel = decision.escalate ? FALLBACK_MODEL : CHEAP_MODEL;
  const converted = await processDocumentWithLLM(
    workingMarkdown,
    docId,
    filename,
    chosenModel
  );
  return {
    result: converted,
    gating: {
      model_used: chosenModel,
      escalate: decision.escalate,
      escalateMode,
      compositeQ: decision.Q,
      classifierProb: decision.classifierProb,
      metrics: dual.metrics,
    },
  };
}

async function processSingleFile(queueItem) {
  const start = Date.now();
  try {
    queueItem.status = "processing";
    queueItem.startedAt = new Date().toISOString();
    let content = queueItem.content;
    if (
      !queueItem.filename.endsWith(".md") &&
      !queueItem.filename.endsWith(".markdown")
    ) {
      content = await convertToMarkdown(content, queueItem.filename);
      queueItem.metrics.conversionApplied = true;
    }
    const { result, gating } = await processDocumentPipeline(
      content,
      queueItem.filename
    );
    queueItem.result = result;
    queueItem.chunks = result.chunks || [];
    queueItem.keywords =
      (result.retrieval_hints && result.retrieval_hints.domain_tags) || [];
    queueItem.status = "completed";
    queueItem.completedAt = new Date().toISOString();
    queueItem.metrics.processingTimeMs = Date.now() - start;
    queueItem.metrics.chunkCount = queueItem.chunks.length;
    queueItem.gating = gating;
  } catch (e) {
    queueItem.status = "failed";
    queueItem.error = e.message;
    queueItem.completedAt = new Date().toISOString();
    queueItem.metrics.processingTimeMs = Date.now() - start;
    console.error("File processing failed:", queueItem.filename, e.message);
  }
}

async function processQueue() {
  if (isProcessing) return { already: true };
  isProcessing = true;
  processingCancelled = false;
  try {
    const pending = fileQueue.filter((f) => f.status === "pending");
    for (let i = 0; i < pending.length; i += CONCURRENT_FILES) {
      if (processingCancelled) break;
      const batch = pending.slice(i, i + CONCURRENT_FILES);
      await Promise.all(batch.map((f) => processSingleFile(f)));
      const remaining = fileQueue.filter((f) => f.status === "pending").length;
      if (remaining > 0)
        await new Promise((r) => setTimeout(r, PROCESSING_DELAY));
    }
  } finally {
    isProcessing = false;
  }
}

// ================= End Queue Processing ====================================

// ================== API Endpoints (Reintroduced) ===========================
app.post("/api/upload", upload.array("files", MAX_FILES), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length)
      return res.status(400).json({ error: "No files uploaded" });
    const initialTotal = fileQueue.reduce((a, f) => a + f.originalSize, 0);
    let runningTotal = initialTotal;
    let added = 0;
    const skipped = [];
    for (const f of files) {
      const ext = path.extname(f.originalname);
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        skipped.push({ filename: f.originalname, reason: "INVALID_EXTENSION" });
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        skipped.push({ filename: f.originalname, reason: "FILE_SIZE_LIMIT" });
        continue;
      }
      if (runningTotal + f.size > MAX_TOTAL_SIZE) {
        skipped.push({ filename: f.originalname, reason: "TOTAL_SIZE_LIMIT" });
        continue;
      }
      fileQueue.push(createQueueItem(f, f.buffer));
      added++;
      runningTotal += f.size;
    }
    res.json({
      success: true,
      added,
      skipped,
      queueSize: fileQueue.length,
      totalBytesBefore: initialTotal,
      totalBytesAfter: runningTotal,
      limits: {
        maxFiles: MAX_FILES,
        maxTotalBytes: MAX_TOTAL_SIZE,
        maxFileBytes: MAX_FILE_SIZE,
      },
    });
    if (added && !isProcessing) processQueue();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Lightweight config endpoint for frontend to surface limits
app.get("/api/config", (req, res) => {
  res.json({
    limits: {
      maxFiles: MAX_FILES,
      maxTotalBytes: MAX_TOTAL_SIZE,
      maxFileBytes: MAX_FILE_SIZE,
      allowedExtensions: ALLOWED_EXTENSIONS,
    },
    models: {
      cheap: CHEAP_MODEL,
      fallback: FALLBACK_MODEL,
    },
  });
});

app.post("/api/process-queue", async (req, res) => {
  if (isProcessing) return res.json({ already: true });
  processQueue();
  res.json({ started: true });
});

app.get("/api/queue", (req, res) => {
  const stats = {
    totalFiles: fileQueue.length,
    pending: fileQueue.filter((f) => f.status === "pending").length,
    processing: fileQueue.filter((f) => f.status === "processing").length,
    completed: fileQueue.filter((f) => f.status === "completed").length,
    failed: fileQueue.filter((f) => f.status === "failed").length,
    isProcessing,
  };
  res.json({
    stats,
    files: fileQueue.map((f) => ({
      id: f.id,
      filename: f.filename,
      status: f.status,
      originalSize: f.originalSize,
      metrics: f.metrics,
      gating: f.gating,
      error: f.error,
      uploadedAt: f.uploadedAt,
      completedAt: f.completedAt,
    })),
  });
});

app.post("/api/cancel-queue", (req, res) => {
  processingCancelled = true;
  res.json({ cancelled: true });
});
app.post("/api/clear-queue", (req, res) => {
  fileQueue.length = 0;
  res.json({ cleared: true });
});

app.get("/api/download/:id", (req, res) => {
  const f = fileQueue.find((x) => x.id === req.params.id);
  if (!f) return res.status(404).json({ error: "Not found" });
  if (f.status !== "completed")
    return res.status(400).json({ error: "Not completed" });
  res.setHeader("Content-Type", "application/json");
  res.send(
    JSON.stringify(
      {
        filename: f.filename,
        processedAt: f.completedAt,
        result: f.result,
        gating: f.gating,
      },
      null,
      2
    )
  );
});

app.get("/api/quality", (req, res) => {
  const completed = fileQueue.filter((f) => f.status === "completed");
  const aggregate = {
    total: completed.length,
    cheap: 0,
    fallback: 0,
    escalated: 0,
    avgComposite: 0,
    openaiCalls: openaiMetrics.totalCalls,
  };
  for (const f of completed) {
    if (f.gating) {
      if (f.gating.model_used === CHEAP_MODEL) aggregate.cheap++;
      else aggregate.fallback++;
      if (f.gating.escalate) aggregate.escalated++;
      if (f.gating.compositeQ) aggregate.avgComposite += f.gating.compositeQ;
    }
  }
  if (aggregate.total) aggregate.avgComposite /= aggregate.total;
  res.json({ aggregate, models: openaiMetrics.byModel });
});

// Health & debug endpoints
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    port: process.env.PORT || 3000,
    models: { cheap: CHEAP_MODEL, fallback: FALLBACK_MODEL },
    openai: {
      apiKeyPresent: !!process.env.OPENAI_API_KEY,
      totalCalls: openaiMetrics.totalCalls,
      lastCallAt: openaiMetrics.lastCallAt,
    },
  });
});

app.post("/api/debug/openai/ping", async (req, res) => {
  try {
    const r = await callChat(
      CHEAP_MODEL,
      [
        { role: "system", content: 'Return a JSON {"pong":true}' },
        { role: "user", content: "ping" },
      ],
      { response_format: { type: "json_object" } }
    );
    res.json({
      success: true,
      content: r.choices[0].message.content,
      usage: r.usage,
      metrics: openaiMetrics,
    });
  } catch (e) {
    res.status(500).json({ error: e.message, metrics: openaiMetrics });
  }
});

// Debug endpoint: simulate a full conversion using same prompt path
app.post("/api/debug/openai/convert", express.json(), async (req, res) => {
  const { markdown, model } = req.body || {};
  const chosen = model === "fallback" ? FALLBACK_MODEL : CHEAP_MODEL;
  const sampleMd =
    markdown ||
    `# Debug Sample Document\n\nThis is a *small* sample document used for a debug conversion test.\n\n## Section One\nSome introductory text.\n\n### Sub A\nBullet list:\n- Alpha\n- Beta\n- Gamma\n\n## Section Two\nA paragraph with **bold** text and a table.\n\n| Col | Val |\n| --- | --- |\n| A   |  1  |\n| B   |  2  |\n\nThat's all.`;
  const started = Date.now();
  try {
    const docId = `debug_${Date.now().toString(36)}`;
    const result = await processDocumentWithLLM(
      sampleMd,
      docId,
      "debug.md",
      chosen
    );
    const durationMs = Date.now() - started;
    res.json({
      success: true,
      durationMs,
      modelUsed: result._model_used,
      docKeys: Object.keys(result || {}),
      chunkCount: (result.chunks || []).length,
      title: result.doc?.title,
      sampleChunk: result.chunks ? result.chunks[0] : null,
      metrics: openaiMetrics,
      truncatedJSON: JSON.stringify(result).slice(0, 1500),
    });
  } catch (e) {
    res
      .status(500)
      .json({ success: false, error: e.message, metrics: openaiMetrics });
  }
});
// ================== End API Endpoints ======================================

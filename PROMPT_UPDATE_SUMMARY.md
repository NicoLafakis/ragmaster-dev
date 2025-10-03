# RAGMaster Prompt Update Summary

## Date: October 3, 2025

## Overview

Updated the AI model prompt to implement a comprehensive document conversion approach that produces a structured JSON output with all necessary fields for RAG system integration.

## Key Changes

### 1. New Conversion Approach

**Previous:** The system used multiple separate LLM calls:

- Section-by-section chunking
- Separate keyword extraction
- Manual heading extraction

**New:** Single comprehensive LLM call that processes the entire document and returns:

- Document metadata
- Table of contents
- Intelligent chunking with overlap
- Augmented data (summary, highlights, Q&A)
- Retrieval hints
- Security metadata
- Embedding metadata placeholders

### 2. Updated Prompt

The new prompt instructs the AI to:

```
You are a converter. Input: (1) full markdown, (2) doc_id, (3) source_uri.
Output: a single MINIFIED JSON object with fields exactly:
doc, content, chunks, augment, retrieval_hints, security, embeddings_meta.

Rules:
- In doc, include only: doc_id, canonical_id, created_at, updated_at,
  checksum_sha256, source_type, source_uri, visibility, language, title, toc.
- Generate toc from headings with anchors and char_range.
- Produce chunks of ~200–300 tokens, ~20% overlap; never split code/table blocks.
  Include: chunk_id, position, char_range, section_path, heading, heading_level,
  type, markdown, text, tokens, overlap_tokens, embedding.vector_id, sparse_terms,
  keywords, entities, citations.
- Populate augment.summary, three highlights, and 1–3 QA items with span_refs
  pointing to chunk_id+char_range.
- Do NOT include version, license, or authors anywhere.
- Do NOT include embedding vectors; only placeholders or ids.
- Return only minified JSON (no comments).
```

### 3. Output Structure

The new system returns a comprehensive JSON structure:

```json
{
  "doc": {
    "doc_id": "doc_...",
    "canonical_id": "...",
    "created_at": "...",
    "updated_at": "...",
    "checksum_sha256": "...",
    "source_type": "markdown",
    "source_uri": "filename.md",
    "visibility": "internal",
    "language": "en",
    "title": "...",
    "toc": [...]
  },
  "content": {
    "text_plain": "...",
    "token_count": 4200
  },
  "chunks": [
    {
      "chunk_id": "c1",
      "position": 1,
      "char_range": [116, 534],
      "section_path": ["Title", "Section"],
      "heading": "Section Name",
      "heading_level": 2,
      "type": "paragraph",
      "markdown": "...",
      "text": "...",
      "tokens": 220,
      "overlap_tokens": 40,
      "embedding": {
        "model": "text-embedding-3-large",
        "vector_id": "emb_c1"
      },
      "sparse_terms": {
        "model": "bm25",
        "terms": [["keyword", 8], ...]
      },
      "keywords": [...],
      "entities": [],
      "citations": [...],
      "score_boost": 1.0
    }
  ],
  "augment": {
    "summary": "...",
    "highlights": [...],
    "qa": [
      {
        "q": "Question?",
        "a": "Answer",
        "span_refs": [...],
        "confidence": 0.86
      }
    ]
  },
  "retrieval_hints": {
    "domain_tags": ["RAG", "IR", "alignment"],
    "audience": "...",
    "freshness": {...},
    "routing": [...]
  },
  "security": {
    "pii_flags": [],
    "policy_tags": []
  },
  "embeddings_meta": {
    "dense": {...},
    "sparse": {...}
  }
}
```

### 4. Code Changes

#### Modified Functions:

1. **`processDocumentWithLLM(markdown, docId, sourceUri)`** - NEW

   - Replaces the old multi-step processing
   - Single LLM call with comprehensive prompt
   - Returns full structured JSON

2. **`processSingleFile(queueItem)`** - UPDATED

   - Generates unique `doc_id` for each file
   - Calls new `processDocumentWithLLM` function
   - Stores full result in `queueItem.result`
   - Maintains backwards compatibility with `chunks` and `keywords`

3. **Download endpoint (`/api/download/:id`)** - UPDATED
   - Returns full `result` structure when available
   - Falls back to legacy format for backwards compatibility

#### Deprecated/Commented Functions:

- `extractHeadings()` - Legacy
- `splitBySections()` - Legacy
- `chunkSectionWithLLM()` - Legacy
- `extractKeywords()` - Legacy
- `processDocument()` - Legacy
- `generateChecksum()` - Legacy (LLM handles this now)

### 5. Benefits

1. **Single LLM Call**: More efficient processing with one comprehensive call
2. **Richer Metadata**: Enhanced with summaries, highlights, Q&A, and retrieval hints
3. **Better Chunking**: AI-driven with token-based sizing and intelligent overlap
4. **RAG-Ready**: Output format designed for direct integration with RAG systems
5. **Structured Citations**: Includes span references for traceability
6. **Security Aware**: PII flags and policy tags included
7. **Embedding Ready**: Placeholder structure for vector storage

### 6. Testing Recommendations

1. Upload a sample markdown file through the web interface
2. Download the processed JSON
3. Verify all required fields are present:
   - `doc`, `content`, `chunks`, `augment`, `retrieval_hints`, `security`, `embeddings_meta`
4. Check chunk quality:
   - Token counts (~200-300)
   - Overlap (~20%)
   - No split code blocks
5. Verify augmentation data:
   - Summary present
   - 3 highlights
   - 1-3 Q&A items with span references

### 7. Backwards Compatibility

The system maintains backwards compatibility:

- Old processed files still work (legacy format)
- Download endpoint handles both old and new formats
- Queue system unchanged
- Upload and status endpoints unchanged

## Files Modified

- `backend/app.js` - Main backend logic updated

## Migration Notes

No database migration needed. New processing format will be used for all newly uploaded files. Previously processed files remain in their original format.

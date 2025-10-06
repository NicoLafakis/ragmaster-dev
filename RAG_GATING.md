# RAG Gating Pipeline

This document explains the adaptive model gating + self‑evaluation pipeline implemented in `backend/app.js`.

## Goals

- Minimize cost by defaulting to the cheap model (`gpt-5-nano-2025-08-07`).
- Preserve quality and factual alignment by escalating narrowly (partial rewrite) or fully to (`gpt-5-mini-2025-08-07`) only when signals justify it.
- Provide transparent, inspectable metrics that drive every escalation decision.

## High-Level Flow

1. Raw (or markdown‑converted) file content enters the queue.
2. Dual self‑evaluation (two passes with the cheap model) produces structured JSON: per‑chunk scores + doc summary.
3. Metrics are derived (averages, hard-fail flags, variance between passes → uncertainty proxy).
4. `gateDecision()` runs heuristic gating thresholds and a lightweight classifier probability approximation.
5. If escalation criteria met → escalate:
   - Partial: regenerate only failing spans/chunks.
   - Full: regenerate entire markdown if failure ratio > 30%.
6. Final (possibly improved) markdown is converted into the standardized structured JSON representation using the chosen model.
7. Gating metadata stored on each queue item (`queueItem.gating`).

## Models

- Cheap / Primary: `gpt-5-nano-2025-08-07`
- Fallback / Secondary: `gpt-5-mini-2025-08-07`
  Only these two models are allowed; configuration mismatch triggers a warning and reverts to defaults.

## Self‑Evaluation Schema (Internal)

The self‑eval prompt requests STRICT JSON:

```jsonc
{
  "per_chunk": [
    {"id": "c1", "index":0, "start":0, "end":1234,
     "clarity":0.94, "correctness":0.90, "completeness":0.88, "contextAlign":0.93,
     "issues":["minor phrasing"]},
     ...
  ],
  "doc": {
    "constraints_ok": true,
    "hallucination_flags": 0,
    "coverage_estimate": 0.92,
    "missing_headings": [],
    "notes": "..."
  }
}
```

Scores are 0–1 (two decimals). Any parsing failure = immediate fallback to full conversion with the fallback model (fail‑safe quality bias).

## Derived Metrics

From the raw JSON we derive:

- clarity, correctness, completeness, contextAlign (averages across chunks)
- constraints (binary: `doc.constraints_ok ? 1 : 0`)
- hardFails: currently detects hallucination flags (`hallucination_flags > 0`)
- varCorrectness, varCompleteness: (Δ between dual passes)^2 / 2 as a light variance estimator
- features: simple structural features (length, etc.) for pass probability heuristic
- compositeQ: weighted score (clarity 0.15, correctness 0.25, completeness 0.20, constraints 0.25, contextAlign 0.15)

## Thresholds (`GATING_THRESHOLDS`)

| Metric                | Threshold | Rationale                               |
| --------------------- | --------- | --------------------------------------- |
| compositeMin          | 0.88      | Baseline doc fitness bar                |
| correctnessMin        | 0.85      | Accuracy emphasis                       |
| completenessMin       | 0.80      | Coverage not too low                    |
| contextAlignMin       | 0.82      | Domain alignment floor                  |
| softFailEscalateCount | 2         | Allow one soft fail, escalate if ≥2     |
| constraintsRequired   | true      | Must pass structural / constraints gate |

## Uncertainty Limits (`UNCERTAINTY_LIMITS`)

| Metric              | Threshold | Purpose                                          |
| ------------------- | --------- | ------------------------------------------------ |
| correctnessVarMax   | 0.02      | Detect instability across passes                 |
| completenessVarMax  | 0.025     | Detect coverage ambiguity                        |
| borderlineComposite | 0.91      | Higher bar when uncertain                        |
| classifierProbMin   | 0.75      | Heuristic classifier (complexity vs score) floor |

## Gating Logic (`gateDecision()`)

Pseudocode logic (simplified):

```
if constraints missing -> escalate
if any hard fail -> escalate
if compositeQ < compositeMin -> escalate
count soft fails among [correctness, completeness, contextAlign]
if softFails >= softFailEscalateCount -> escalate
if (uncertain variance) and compositeQ < borderlineComposite -> escalate
if classifierProb < classifierProbMin -> escalate
else accept
```

Returned object includes `{ escalate, reason, Q, classifierProb }`.

## Escalation Strategy

1. Identify failing chunks: correctness < correctnessMin OR contextAlign < contextAlignMin.
2. If failing ratio > 30% → full rewrite with fallback model.
3. Else perform partial span rewrites for each failing chunk using fallback model.
4. Reconstructed markdown (naive index-based splice) used for final conversion.
5. Mode recorded as `escalateMode`: `none | partial | full`.

Partial rewrite notes:

- Index-based replacement can drift if tokenization shifts; acceptable for MVP.
- Future improvement: hold structured chunk boundaries and reassemble via map.

## Fail-Safe Behavior

- Any self-eval parse failure → immediate fallback full conversion (reason: `self_eval_failed`).
- Any unexpected error in gating still allows queue processing to continue (error captured per file).

## Data Stored per Queue Item

`queueItem.gating` structure:

```jsonc
{
  "model_used": "gpt-5-nano-2025-08-07" | "gpt-5-mini-2025-08-07",
  "escalate": true|false,
  "escalateMode": "none" | "partial" | "full",
  "compositeQ": 0.91,
  "classifierProb": 0.82,
  "metrics": {
    "clarity": 0.93,
    "correctness": 0.87,
    "completeness": 0.84,
    "contextAlign": 0.90,
    "constraints": 1,
    "hardFails": [],
    "varCorrectness": 0.001,
    "varCompleteness": 0.002,
    "perChunk": [ ... ],
    "features": { "length": 12345 }
  }
}
```

## Quality Aggregation Endpoint

`GET /api/quality` returns aggregate gating stats:

```json
{
  "aggregate": {
    "total": 5,
    "cheap": 4,
    "fallback": 1,
    "escalated": 1,
    "avgComposite": 0.905
  }
}
```

## Operational Tuning

Environment overrides (optional):

- `CHEAP_MODEL`, `FALLBACK_MODEL` (must be in allowed set)
- Future: thresholds via env for experimentation.

## Future Improvements

- Structured diff-based partial rewriting to avoid index drift.
- Train a lightweight local classifier for pass probability vs heuristic.
- Persist artifacts & metrics (currently in-memory only).
- Add embedding generation & retrieval rehearsal tests.
- Introduce rate limiting / concurrency shaping (per model) if needed.

## Summary

The gating pipeline ensures speed + cost savings by defaulting to the cheapest model while maintaining robust guardrails for correctness, completeness, and context alignment. Escalations are data-driven, minimal, and observable.

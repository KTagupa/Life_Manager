# AI Urgency Semantic Prompt Rubric (v1)

## Purpose
Generate a semantic urgency score from task text and context, independent from the existing deterministic urgency engine.

This rubric is designed to reduce "vibes" by using:
- Fixed factors and weights.
- Hard caps/floors.
- Evidence requirements.
- Strict JSON output.

## Runtime Settings
- `temperature: 0`
- `top_p: 1`
- `response_format: json_schema` (strict)
- `seed`: fixed if supported
- Max response tokens: enough for full JSON (for example, 600)

## Input Contract
Pass this object to the model as task context:

```json
{
  "task_id": "task_123",
  "title": "string",
  "description": "string",
  "notes_excerpt": "string",
  "project_name": "string",
  "project_description": "string",
  "context_tags": ["string"],
  "created_at": 0,
  "updated_at": 0
}
```

Do not pass system urgency fields (`_urgencyScore`, `_isUrgent`, `_isCritical`, manual urgency toggles) into this prompt.

## Factor Weights (100 total before penalties)
Use these exact factors:

| Factor | Range | Scoring Rule |
|---|---:|---|
| Consequence Severity | 0-30 | Impact if delayed: 0 none, 10 inconvenience, 20 material loss/friction, 25 major financial/operational impact, 30 legal/safety/security/compliance harm |
| Time Sensitivity in Text | 0-25 | Time pressure from task wording: 0 none, 8 vague "soon", 14 explicit period, 20 explicit <=7 days, 25 hard deadline today/tomorrow/expiry |
| External Commitment | 0-20 | Accountability and downstream dependency: 0 none, 8 team expectation, 14 cross-team/client dependency, 20 contractual/public commitment |
| Irreversibility / Compounding Risk | 0-15 | Cost of delay growth: 0 reversible, 7 moderate rework/compounding, 15 severe compounding or hard-to-recover damage |
| Scope vs Window Mismatch | 0-10 | Large effort with short time window: 0 none, 4 moderate mismatch, 10 severe mismatch |

## Penalties (subtract from subtotal)
Apply exact penalties:

| Penalty | Range | Trigger |
|---|---:|---|
| Vagueness Penalty | 0-15 | Missing concrete outcome, owner, or action verbs |
| Speculative / Idea-only Penalty | 0-10 | Exploratory, optional, "nice to have", no commitment language |

## Caps, Floors, and Overrides
Apply in this order after base score and penalties:

1. `score = clamp(round(subtotal - penalties), 0, 100)`
2. Cap to `<=60` if both are true:
- No explicit timeline evidence.
- No external commitment evidence.
3. Cap to `<=45` if task is clearly exploratory/idea-only and has no hard deadline.
4. Floor to `>=70` only if explicit evidence exists for at least one:
- Legal/compliance deadline.
- Security/safety incident risk.
- Payroll/tax/payment failure risk.
5. Never use implicit domain assumptions without text evidence.

## Confidence Formula
Compute confidence independently from score:

`confidence = clamp(0.30 + deadlineEvidence + impactEvidence + commitmentEvidence + specificityEvidence - ambiguityPenalty, 0.20, 0.95)`

Use these exact term values:
- `deadlineEvidence`: `0.20` explicit date/time, `0.10` relative window, `0.00` none.
- `impactEvidence`: `0.20` explicit impact, `0.10` implied impact, `0.00` none.
- `commitmentEvidence`: `0.15` explicit external dependency, `0.08` weak dependency, `0.00` none.
- `specificityEvidence`: `0.10` concrete action/outcome, `0.05` partial, `0.00` vague.
- `ambiguityPenalty`: `0.20` highly ambiguous, `0.10` moderate ambiguity, `0.00` clear.

## Evidence Rules
- Every factor with points > 0 must include at least one direct evidence snippet from input text.
- Evidence snippet length: max 16 words each.
- If no evidence supports a factor, factor score must be 0.
- If fewer than 2 factors have evidence, set `needs_human_review = true`.

## Output JSON Schema
Use this exact shape:

```json
{
  "task_id": "string",
  "score": 0,
  "level": 1,
  "confidence": 0.0,
  "summary": "string",
  "reason": "string",
  "factor_scores": {
    "consequence_severity": { "points": 0, "evidence": [] },
    "time_sensitivity_text": { "points": 0, "evidence": [] },
    "external_commitment": { "points": 0, "evidence": [] },
    "irreversibility_compounding": { "points": 0, "evidence": [] },
    "scope_window_mismatch": { "points": 0, "evidence": [] }
  },
  "penalties": {
    "vagueness": 0,
    "speculative": 0
  },
  "assumptions": [],
  "needs_human_review": false,
  "model_rubric_version": "ai-urgency-semantic-v1"
}
```

Level mapping:
- 1: `0-25`
- 2: `26-47`
- 3: `48-67`
- 4: `68-85`
- 5: `86-100`

## System Prompt (Exact)
Use this as the system prompt:

```text
You are a strict urgency scoring engine. Score task urgency from semantics only using the provided rubric.

Rules:
1) Use only provided text/context. No outside knowledge.
2) Do not use emotional tone as evidence.
3) Assign points only when direct evidence exists.
4) Apply penalties, caps, floors, and confidence math exactly.
5) Return valid JSON only. No markdown, no prose outside JSON.
6) If evidence is weak or ambiguous, lower confidence and set needs_human_review true.
```

## User Prompt Template (Exact)
Use this as the user prompt:

```text
Score this task using rubric version ai-urgency-semantic-v1.

Task JSON:
{{TASK_JSON}}

Scoring instructions:
- Compute factor scores with exact ranges:
  consequence_severity (0-30),
  time_sensitivity_text (0-25),
  external_commitment (0-20),
  irreversibility_compounding (0-15),
  scope_window_mismatch (0-10).
- Subtract penalties:
  vagueness (0-15),
  speculative (0-10).
- Apply post-rules:
  cap <=60 when no timeline evidence and no commitment evidence;
  cap <=45 for idea-only with no deadline;
  floor >=70 only with explicit legal/compliance/security/safety/payroll/tax/payment risk evidence.
- Compute confidence exactly:
  confidence = clamp(0.30 + deadlineEvidence + impactEvidence + commitmentEvidence + specificityEvidence - ambiguityPenalty, 0.20, 0.95)
  where terms are selected from:
  deadlineEvidence {0.20,0.10,0.00}
  impactEvidence {0.20,0.10,0.00}
  commitmentEvidence {0.15,0.08,0.00}
  specificityEvidence {0.10,0.05,0.00}
  ambiguityPenalty {0.20,0.10,0.00}

Output JSON with keys:
task_id, score, level, confidence, summary, reason, factor_scores, penalties, assumptions, needs_human_review, model_rubric_version
```

## Calibration Anchors
Use these anchors during validation tests:

| Task Example | Expected Score Band |
|---|---:|
| "Update personal reading list someday" | 5-20 |
| "Draft ideas for future app redesign" | 15-35 |
| "Send budget revision to manager by Friday 5 PM" | 45-70 |
| "Fix checkout bug causing payment failures before tomorrow launch" | 75-95 |
| "Submit tax filing by legal deadline this week" | 80-98 |
| "Rotate compromised API key and patch exposed endpoint now" | 85-100 |

## Consistency Checks (Recommended)
- Re-score same task 3 times with fixed seed; variance should be <=5 points.
- If variance >5, mark output as unstable and trigger human review.
- Track per-factor drift weekly to detect prompt regressions.

# AI Urgency v1 Spec (Tasks and Projects)

## Goal
Add an AI-driven urgency signal that is separate from the existing urgency engine, while keeping manual urgency and current behavior intact by default.

## Scope
- Keep current urgency fields and logic as-is (`_urgencyScore`, `_isUrgent`, `_isCritical`, manual urgency toggles).
- Add new persisted fields for AI urgency on both tasks and projects.
- Add API contracts for consuming AI urgency in UI sorting, filtering, and dashboard risk views.
- Roll out in shadow mode first.

## Score Output Contract
Use this shared output shape for task and project AI urgency:

```json
{
  "score": 0,
  "level": 1,
  "tag": "LOWEST",
  "label": "Lowest",
  "confidence": 0.0,
  "reason": "",
  "factors": [],
  "source": "local-heuristic",
  "model": "ai-urgency-v1",
  "computedAt": 0,
  "expiresAt": 0,
  "stale": false
}
```

Level thresholds (same as existing project urgency levels):

| Level | Score Range | Tag |
|---|---:|---|
| 1 | 0-25 | LOWEST |
| 2 | 26-47 | LOW |
| 3 | 48-67 | MEDIUM |
| 4 | 68-85 | HIGH |
| 5 | 86-100 | HOT |

## Task AI Urgency Scoring
Only active tasks (`!completed`) are scored.

### Inputs
- `dueDate`
- `_slack`
- `_downstreamWeight`
- `_isBlocked`
- `duration`
- `projectId` and linked project AI urgency
- `createdAt`, `updatedAt`, `checkIns`, `timeLogs` for staleness

### Formula
`taskAiScore = clamp(round(duePoints + pathPoints + dependencyPoints + stalenessPoints + effortPoints + projectLiftPoints), 0, 100)`

| Component | Points | Rule |
|---|---:|---|
| Due pressure | 0-35 | Overdue: 35, due today: 33, due tomorrow: 30, 2-3d: 26, 4-7d: 20, 8-14d: 14, >14d: 8, no due: 5 |
| Critical-path pressure | 0-20 | `_slack <= 0`: 20, `=1`: 16, `2-3`: 12, `4-7`: 7, `>7`: 2 |
| Dependency impact | 0-20 | `min(15, _downstreamWeight * 3)` plus `+5` if `_isBlocked` |
| Staleness | 0-10 | Days since last activity: `>=14`:10, `7-13`:7, `3-6`:4, `<3`:1 |
| Effort risk | 0-10 | `duration / max(1, daysUntilDue + 1)`: `>=2`:10, `>=1`:7, `>=0.5`:4, else 1 |
| Project risk lift | 0-5 | Linked project AI score `>=80`:5, `>=65`:3, `>=50`:2, else 0 |

### Confidence
`confidence = clamp(0.35 + dueSignal + depSignal + activitySignal + effortSignal + projectSignal, 0.30, 0.95)`

| Signal | Add |
|---|---:|
| has `dueDate` | +0.20 |
| has dependency graph context (`_downstreamWeight > 0` or dependencies) | +0.15 |
| has activity signal (`updatedAt` or `checkIns` or `timeLogs`) | +0.10 |
| has valid `duration` | +0.10 |
| linked to project with >=2 active tasks | +0.10 |

## Project AI Urgency Scoring
Only active tasks inside the project are included.

### Inputs
- Project active tasks
- Task AI scores
- Task blocked state
- Task due deltas
- Project completion shape (`active` vs `done`)

### Formula
`projectAiScore = clamp(round(maxTask*0.35 + p75Task*0.20 + overduePct*0.20 + blockedPct*0.15 + dueSoonPct*0.05 + openLoadPct*0.05), 0, 100)`

Definitions:
- `maxTask`: max task AI score (0-100)
- `p75Task`: 75th percentile task AI score (0-100)
- `overduePct`: percent of active tasks overdue (0-100)
- `blockedPct`: percent of active tasks blocked (0-100)
- `dueSoonPct`: percent of active tasks due in <=3 days (0-100)
- `openLoadPct`: `active / (active + done) * 100`

If a project has zero active tasks: score is `0`, level `1`, confidence `0.30`.

### Confidence
`confidence = clamp(0.40 + activeVolume + dueSignal + depSignal + activitySignal, 0.30, 0.95)`

| Signal | Add |
|---|---:|
| active tasks >=5 | +0.20 |
| at least one due-dated active task | +0.15 |
| dependency data present in >=40% active tasks | +0.15 |
| activity data present in >=40% active tasks | +0.10 |

## DB Model Changes (Current Codebase)
This project stores everything in IndexedDB object store `appState` (`id: "main"`), with payload fields like `nodes`, `projects`, etc.

Move `dataModelVersion` from `1` to `2` and add:

### Task Shape Additions (`nodes[]`, `archivedNodes[]`)
```json
{
  "createdAt": 0,
  "updatedAt": 0,
  "aiUrgency": {
    "score": null,
    "level": null,
    "tag": null,
    "label": null,
    "confidence": null,
    "reason": "",
    "factors": [],
    "source": "local-heuristic",
    "model": "ai-urgency-v1-task",
    "computedAt": null,
    "expiresAt": null,
    "stale": true
  }
}
```

### Project Shape Additions (`projects[]`)
```json
{
  "aiUrgency": {
    "score": null,
    "level": null,
    "tag": null,
    "label": null,
    "confidence": null,
    "reason": "",
    "factors": [],
    "source": "local-heuristic",
    "model": "ai-urgency-v1-project",
    "computedAt": null,
    "expiresAt": null,
    "stale": true
  }
}
```

### Root State Additions
```json
{
  "aiUrgencyConfig": {
    "mode": "shadow",
    "enabled": true,
    "staleAfterHours": 24,
    "minConfidenceForAlerts": 0.55
  }
}
```

## Migration Plan (Files to Update)
### `assets/js/data.js`
- Set `DATA_MODEL_VERSION = 2`.
- Replace `migrateStateDataToV1` with version-aware migration chain (`migrateToV2`).
- In `createNode` add `createdAt`, `updatedAt`, default `aiUrgency`.
- In `createProject` add default `aiUrgency`.
- In `sanitizeLoadedData` ensure all new fields exist and are valid.
- In `saveToStorageImmediate` persist `aiUrgencyConfig`.
- In `mergeStates` prefer newer `aiUrgency` by `computedAt`.

### `assets/js/tasks.js`
- Update write paths (`title`, `dueDate`, dependencies, check-ins, project assignment) to bump `task.updatedAt = Date.now()`.

### `assets/js/navigator.js`
- Keep `getProjectUrgencyMeta(projectId)` backward compatible.
- Add optional mode argument: `getProjectUrgencyMeta(projectId, { mode: "system" | "ai" | "blended" })`.

### `assets/js/graph.js`
- Keep current urgency engine unchanged.
- After `updateCalculations`, trigger AI scoring refresh if stale or forced.

## API Changes (In-App JS API)
Add these functions to avoid breaking existing callers:

```js
getTaskUrgencyMeta(taskId, options)
// options.mode: "system" | "ai" | "blended" (default "system")

getProjectUrgencyMeta(projectId, options)
// options.mode: "system" | "ai" | "blended" (default "system")

recomputeAiUrgency(options)
// options.scope: "all" | "task" | "project"
// options.ids: string[]
// options.force: boolean
```

Meta return shape:

```json
{
  "score": 0,
  "level": 1,
  "tag": "LOWEST",
  "label": "Lowest",
  "source": "system",
  "confidence": 1,
  "reason": "",
  "computedAt": 0
}
```

Blended mode formula (optional):

`blendedScore = round(systemScore * 0.70 + aiScore * 0.30)`

Manual urgency remains authoritative:
- If `isManualUrgent`: UI tag should always show urgent override.
- If `isManualNotUrgent`: suppress urgent badge even if AI score is high.

## Optional Server API (If You Externalize Scoring)
### `POST /v1/urgency/score`
Request:

```json
{
  "tasks": [],
  "projects": [],
  "config": {
    "model": "ai-urgency-v1"
  }
}
```

Response:

```json
{
  "taskScores": [
    {
      "id": "task_123",
      "aiUrgency": {}
    }
  ],
  "projectScores": [
    {
      "id": "proj_123",
      "aiUrgency": {}
    }
  ],
  "computedAt": 0
}
```

## Rollout
- Phase 1: `mode = "shadow"` for 2 weeks. Compute and persist AI scores, do not change sorting, alerts, or badges.
- Phase 2: enable "AI sort" toggle in Projects panel and dashboard.
- Phase 3: optional blended ranking for focus lists, gated by confidence threshold.

## Acceptance Criteria
- Existing urgency behavior is unchanged when `mode = "system"`.
- Old data loads cleanly with no runtime errors.
- New tasks/projects include default AI urgency fields.
- Scores recompute deterministically from the same input state.
- Manual urgency overrides remain higher priority in UI and alerts.

# Memory Cube Development Harness

## Purpose
This document is my continuous development loop. I use it to plan, build, test, and evaluate.

## Current Phase
**Phase 6: Visualization** — functionally complete, needs polish

## Evaluation Criteria

### Functional Requirements
- [x] Graph renders with nodes and edges
- [x] Nodes color-coded by type
- [x] Click node to see details
- [x] Filter by type, status, validity
- [x] Search functionality
- [x] Stats dashboard
- [x] Add/edit/delete nodes from UI
- [x] Export graph (PNG, JSON)
- [x] Undo/redo support (Ctrl+Z/Ctrl+Y)

### UX Requirements
- [x] Dark theme
- [x] Responsive layout
- [x] Keyboard shortcuts (zoom, pan, search focus)
- [x] Multi-select filter (chip-based)
- [x] Zoom controls visible in UI
- [x] Mini-map for large graphs
- [x] Loading states with skeletons
- [x] Empty state when no nodes match filter

### Visual Polish
- [x] Legend shows node types
- [x] Legend matches all 12 defined types
- [x] Edge labels on hover
- [x] Status visual indicators (border colors: complete=teal, blocked=dashed red, active=yellow)
- [x] Better node labels (truncate long names, expand on hover)
- [x] Highlight connected nodes on hover

### Performance
- [ ] Lazy load for 100+ nodes
- [ ] Virtual scrolling in detail panel
- [x] Debounced search (300ms)

### Data Quality
- [x] Architecture doc has actual content (comprehensive!)
- [x] Example nodes for each type (all 12 types represented)

---

## Current Issues (Priority Order)

### P0 - Critical
1. ~~Legend shows 7 types but 12 are defined in code — inconsistent~~ ✅ FIXED

### P1 - High
2. ~~Type filter UX is clunky (native multi-select)~~ ✅ FIXED (chip-based filter)
3. ~~No keyboard shortcuts~~ ✅ FIXED (/, +, -, 0, Esc, ?, r)
4. ~~No zoom/pan controls visible~~ ✅ FIXED (bottom-right buttons)

### P2 - Medium
5. ~~No CRUD operations from UI~~ ✅ FIXED (create, edit, delete)
6. ~~No export functionality~~ ✅ FIXED (JSON + PNG export)
7. Architecture doc is empty
8. ~~No edge labels~~ ✅ FIXED (labels on hover)

### P3 - Low
9. ~~No mini-map~~ ✅ FIXED
10. ~~No undo/redo~~ ✅ FIXED (Ctrl+Z/Ctrl+Y)
11. No dark/light mode toggle

---

## Development Loop

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  PLAN   │───▶│  BUILD  │───▶│  TEST   │───▶│ EVALUATE│
└─────────┘    └─────────┘    └─────────┘    └─────────┘
     ▲                                              │
     └──────────────────────────────────────────────┘
```

### Plan
1. Pick highest priority issue
2. Define acceptance criteria
3. Estimate complexity

### Build
1. Implement fix
2. Write/update tests
3. Check types compile

### Test
1. Run `npm test`
2. Manual verification (browser)
3. Edge cases

### Evaluate
1. Does it meet acceptance criteria?
2. Any regressions?
3. Update this doc
4. Loop or ship

---

## Session Log

### 2026-02-02 22:00 AEDT
- Server running at localhost:8080
- 67 tests passing
- Reviewed UI code
- Identified issues above

### 2026-02-02 22:04 AEDT
- ✅ Fixed P0: Legend now shows all 12 node types
- ✅ Fixed P1: Added keyboard shortcuts (/, +, -, 0, Esc, ?, r)
- ✅ Fixed P1: Added zoom controls (bottom-right)

### 2026-02-02 22:06 AEDT
- ✅ Fixed P1: Type filter now uses chip-based UI
- ✅ Added hover highlight for connected nodes
- ✅ Added empty state when no nodes match filter
- Committed: `36f4120`

### 2026-02-02 22:08 AEDT
- ✅ Edge labels show on hover
- ✅ Status visual indicators (border colors)
- ✅ Label truncation with expand on hover
- Commits: `54a76b8`, `bde6eb5`
- Messaged Ned on Telegram with progress update
- **Status:** All P0/P1 issues fixed, most visual polish done
- **Waiting:** Ned's input on next priorities

### 2026-02-02 22:28 AEDT
- Ned said "Iterate" — continuing autonomously
- ✅ CRUD operations: create, edit, delete nodes from UI
- Added modal form for node creation/editing
- Added edit/delete buttons in detail panel
- New keyboard shortcut: `n` for new node
- Backend: POST/PUT/DELETE /api/node endpoints
- Tested: created node via API, now 8 nodes total
- Commit: `3da4532`
- **Next:** Continue iterating — mini-map? more polish?

### 2026-02-02 22:30 AEDT
- ✅ Edge creation/deletion from UI
- ✅ Auto-apply filters (type chips, status, validity)
- Added "Link" button in detail panel
- Edge modal with relationship type selector
- Backend: POST/DELETE /api/edge endpoints
- Tested: created edge via API ✓
- Commit: `d5b5615`
- **Total session commits:** 10 (since Phase 6 was "complete")

### 2026-02-02 22:32 AEDT
- ✅ Delete edges from detail panel (× button)
- ✅ Right-click context menu (edit, link, mark complete, delete)
- ✅ Double-click node to edit
- Commits: `15c2a56`, `4931904`, `0f84c0d`
- **Total:** 13 commits since Phase 6 "complete"

### 2026-02-02 22:36 AEDT — Phase 7: GitHub Integration ✅
- Created `src/integrations/github.ts` (400+ lines)
- CLI commands: github-import, github-export, github-prs, github-sync-status
- API endpoints: POST /api/github/import, POST /api/github/export
- Features:
  - Import issues as cube nodes
  - Export nodes as GitHub issues
  - Import PRs and auto-link to issues
  - Bidirectional status sync (complete ↔ closed)
  - Label-to-type mapping
- Requires: `gh auth login`
- Commit: `327961d`

### 2026-02-02 22:57+ AEDT — Continuous Iteration Mode 🔄
Ned said "this was meant to run all night" — activating autonomous mode.

**22:57** ✅ Mini-map with viewport indicator (f50cac2)
**22:59** ✅ Undo/redo system with history tracking (87f7caf)
**22:59** ✅ Loading skeleton animations (119927d)
**23:01** ✅ Example nodes for all 12 types + architecture doc (5e828f1)

**23:28** ✅ Toast notifications for all errors (6553a87)
**23:29** ✅ Alt+drag to link nodes (dfcc2cd)
**23:30** ✅ Collapsible sidebar sections (f4405dd)
**23:30** ✅ Keyboard navigation j/k/arrows (18ea438)
**23:31** ✅ Type counts in filter chips (26608ce)
**23:32** ✅ Time-based filters (c3f3c4f)
**23:33** ✅ Star/favorite nodes (a1d5777)
**23:35** ✅ Fullscreen mode (f036f04)
**23:35** ✅ Duplicate/clone node (574376c)
**23:35** ✅ Copy node ID to clipboard (e973775)

**Status:** 48 commits. Continuing autonomous iteration...

---

## Commands

```bash
# Run dev server
npm run dev -- serve

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type check
npm run typecheck

# Build
npm run build
```

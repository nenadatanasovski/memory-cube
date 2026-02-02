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
- [ ] Undo/redo support

### UX Requirements
- [x] Dark theme
- [x] Responsive layout
- [x] Keyboard shortcuts (zoom, pan, search focus)
- [x] Multi-select filter (chip-based)
- [x] Zoom controls visible in UI
- [ ] Mini-map for large graphs
- [ ] Loading states with skeletons
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
- [ ] Architecture doc has actual content
- [ ] Example nodes for each type

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
9. No mini-map
10. No undo/redo
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

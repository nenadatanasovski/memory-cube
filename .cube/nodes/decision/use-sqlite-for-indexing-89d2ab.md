---
id: decision/use-sqlite-for-indexing-89d2ab
type: decision
version: 2
status: pending
validity: current
confidence: 1
priority: high
tags: ["architecture", "database", "decision"]
created_by: null
assigned_to: null
locked_by: null
created_at: "2026-02-02T11:59:49.065Z"
modified_at: "2026-02-02T12:55:14.026Z"
due_at: null
ordering:
  superseded_by: null
  semantic_hash: 99e30d781828ac81
  source_freshness: 2026-02-02
edges:
  - {"type":"depends-on","target":"task/add-sqlite-index-layer-55f13b"}
actions: []
---

# Use SQLite for indexing

Decision: Use SQLite with FTS5 for fast full-text search indexing of the knowledge graph. Rationale: Embedded, no external dependencies, excellent performance for our scale, FTS5 provides powerful search capabilities.
---
id: doc/architecture-overview-3bc128
type: doc
version: 3
status: complete
validity: current
confidence: 1
priority: high
tags: ["docs", "architecture", "overview"]
created_by: kai
assigned_to: null
locked_by: null
created_at: "2026-02-02T10:07:11.170Z"
modified_at: "2026-02-02T12:01:08.544Z"
due_at: null
ordering:
  superseded_by: null
  semantic_hash: e6a98f88eefbf497
  source_freshness: 2026-02-02
edges:
  - {"type":"documents","target":"project/memory-cube-575a9d"}
actions: []
---

# Architecture Overview

Memory Cube is a graph-based knowledge synthesis system designed for multi-agent workflows.

## Core Concepts

### Nodes
Nodes are the fundamental units of knowledge. Each node has:
- **Type**: task, doc, code, decision, ideation, brainfart, research, conversation, concept, event, agent, project
- **Status**: pending, claimed, active, blocked, complete, archived
- **Validity**: current, stale, superseded, archived
- **Priority**: critical, high, normal, low

### Edges
Edges represent relationships between nodes:
- `depends-on` / `blocks` - dependency relationships
- `implements` - code implementing a task/decision
- `documents` - documentation relationships
- `relates-to` - general associations
- `spawns` / `becomes` - derivation relationships
- `supersedes` / `invalidates` - versioning relationships

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Memory Cube                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Web UI    │  │     CLI     │  │   Integrations      │ │
│  │  (Cytoscape)│  │  (Commander)│  │  (GitHub, etc.)     │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
│         │                │                     │            │
│  ┌──────┴────────────────┴─────────────────────┴──────────┐│
│  │                    REST API                             ││
│  │         /api/graph, /api/node, /api/edge               ││
│  └─────────────────────────┬───────────────────────────────┘│
│                            │                                │
│  ┌─────────────────────────┴───────────────────────────────┐│
│  │                      Cube Core                          ││
│  │  ┌─────────┐  ┌──────────┐  ┌────────────┐            ││
│  │  │  Graph  │  │  Events  │  │ Orchestrator│            ││
│  │  │ (CRUD)  │  │  (Bus)   │  │  (Agents)   │            ││
│  │  └────┬────┘  └────┬─────┘  └──────┬─────┘            ││
│  │       │            │               │                   ││
│  │  ┌────┴────────────┴───────────────┴─────────────────┐ ││
│  │  │              SQLite Index (FTS5)                  │ ││
│  │  └───────────────────────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────┘│
│                            │                                │
│  ┌─────────────────────────┴───────────────────────────────┐│
│  │                  File System (.cube/)                   ││
│  │     nodes/*.md   |   cube.json   |   events.jsonl      ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Key Features

### 1. Graph Operations
- Create, read, update, delete nodes
- Link/unlink nodes with typed edges
- Query with filters (type, status, tags, search)
- Traverse graph relationships

### 2. Event System
- All mutations emit events
- Event log for audit trail
- Triggers for automation
- Real-time subscriptions

### 3. Agent Orchestration
- Register agents with capabilities
- Work queue with priority scheduling
- Task claiming and release
- Dispatch algorithm matching agents to tasks

### 4. Synthesis Pipeline
- Extract nodes from text/code/conversations
- Code analysis (functions, classes, dependencies)
- Automatic relationship detection

### 5. Web Visualization
- Interactive Cytoscape.js graph
- Full CRUD operations
- Filtering, search, export
- Mini-map, undo/redo

### 6. GitHub Integration
- Import issues as nodes
- Export nodes as issues
- PR tracking with auto-linking
- Bidirectional status sync

## File Structure

```
.cube/
├── cube.json          # Cube metadata and config
├── nodes/             # Node files (markdown with YAML frontmatter)
│   ├── task/
│   ├── doc/
│   ├── code/
│   └── ...
├── events.jsonl       # Event log
└── index.db           # SQLite index
```

## Technology Stack

- **Language**: TypeScript
- **Runtime**: Node.js 20+
- **Database**: SQLite (better-sqlite3) with FTS5
- **Web UI**: Vanilla JS + Cytoscape.js
- **CLI**: Commander.js
- **Testing**: Vitest

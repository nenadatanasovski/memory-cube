# Memory Cube 🧊

A deterministic parallel orchestration system with graph-based knowledge synthesis for multi-agent workflows.

## Features

### Core
- **Graph-based knowledge storage** - Nodes (12 types) + Edges (13 relationship types)
- **SQLite indexing** with FTS5 full-text search
- **Event system** with triggers and audit log
- **Agent orchestration** with work queues and task dispatch

### Web Visualization
- Interactive Cytoscape.js graph
- Full CRUD operations (create, edit, delete nodes)
- Edge management (link/unlink nodes)
- 5 layout options (physics, circle, grid, hierarchy, concentric)
- Mini-map with viewport indicator
- Dark/light theme toggle
- Multi-select with bulk operations
- Undo/redo (Ctrl+Z/Ctrl+Y)
- Search with dropdown results
- Export (JSON, PNG)
- Import (JSON)
- Right-click context menu
- Keyboard shortcuts

### GitHub Integration
- Import issues as cube nodes
- Export nodes as GitHub issues
- Import PRs with auto-linking
- Bidirectional status sync

## Installation

```bash
npm install
npm run build
```

## Usage

### Initialize a cube
```bash
cube init
```

### Start the web UI
```bash
cube serve
# Open http://localhost:8080
```

### CLI Commands
```bash
cube status                    # Show statistics
cube create <type> <title>     # Create a node
cube show <id>                 # Show node details
cube update <id> [options]     # Update a node
cube delete <id>               # Delete a node
cube link <from> <type> <to>   # Create an edge
cube query [options]           # Query nodes
cube traverse <id>             # Traverse relationships
```

### GitHub Commands
```bash
cube github-import -r owner/repo     # Import issues
cube github-export <id> -r owner/repo # Export to issue
cube github-prs -r owner/repo        # Import PRs
```

## Node Types
- `task` - Actionable work items
- `doc` - Documentation
- `code` - Code references
- `decision` - Recorded decisions
- `ideation` - Ideas and proposals
- `brainfart` - Random thoughts
- `research` - Research findings
- `conversation` - Chat logs
- `concept` - Conceptual definitions
- `event` - Milestones and events
- `agent` - AI agent definitions
- `project` - Project containers

## Edge Types
- `depends-on` / `blocks` - Dependencies
- `implements` - Implementation links
- `documents` - Documentation refs
- `relates-to` - General relations
- `spawns` / `becomes` - Derivation
- `supersedes` / `invalidates` - Versioning
- `part-of` - Composition
- `derived-from` - Sources

## Keyboard Shortcuts (Web UI)
| Key | Action |
|-----|--------|
| `/` | Focus search |
| `n` | New node |
| `+` | Zoom in |
| `-` | Zoom out |
| `0` | Fit to view |
| `?` | Toggle help |
| `r` | Refresh |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Shift+Click` | Multi-select |
| `Double-click` | Edit node |
| `Right-click` | Context menu |

## Tech Stack
- TypeScript
- Node.js 20+
- SQLite (better-sqlite3) + FTS5
- Cytoscape.js
- Commander.js
- Vitest

## License
MIT

## Authors
- Kai ⚡ (AI Software Engineer)
- Ned (Human)

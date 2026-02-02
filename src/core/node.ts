/**
 * Node class - represents a single node in the Memory Cube
 */

import { createHash } from 'crypto';
import type {
  Node,
  NodeMeta,
  NodeType,
  NodeStatus,
  NodeValidity,
  Priority,
  Edge,
  NodeAction,
  NodeOrdering,
} from './types.js';

/**
 * Generate a URL-safe ID from a title
 */
export function generateId(type: NodeType, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  
  // Add short hash to ensure uniqueness
  const hash = createHash('sha256')
    .update(`${type}:${title}:${Date.now()}`)
    .digest('hex')
    .slice(0, 6);
  
  return `${type}/${slug}-${hash}`;
}

/**
 * Generate semantic hash of content for deduplication
 */
export function generateSemanticHash(content: string): string {
  // Normalize: lowercase, collapse whitespace, remove punctuation
  const normalized = content
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();
  
  return createHash('sha256')
    .update(normalized)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Extract content preview for indexing
 */
export function extractPreview(content: string, maxLength = 200): string {
  return content
    .replace(/^#+ .+$/gm, '') // Remove headings
    .replace(/\n+/g, ' ')     // Collapse newlines
    .replace(/\s+/g, ' ')     // Collapse whitespace
    .trim()
    .slice(0, maxLength);
}

/**
 * Create a new node with defaults
 */
export function createNode(input: {
  type: NodeType;
  title: string;
  content?: string;
  status?: NodeStatus;
  priority?: Priority;
  tags?: string[];
  assignedTo?: string;
  createdBy?: string;
  dueAt?: string;
}): Node {
  const now = new Date().toISOString();
  const content = input.content ?? '';
  
  return {
    // Identity
    id: generateId(input.type, input.title),
    type: input.type,
    version: 1,

    // Status
    status: input.status ?? 'pending',
    validity: 'current',
    confidence: 1.0,

    // Classification
    priority: input.priority ?? 'normal',
    tags: input.tags ?? [],

    // Ownership
    createdBy: input.createdBy ?? null,
    assignedTo: input.assignedTo ?? null,
    lockedBy: null,

    // Temporal
    createdAt: now,
    modifiedAt: now,
    dueAt: input.dueAt ?? null,

    // Ordering
    ordering: {
      supersededBy: null,
      semanticHash: generateSemanticHash(input.title + ' ' + content),
      sourceFreshness: now.split('T')[0], // Just the date
    },

    // Actions (empty by default)
    actions: [],

    // Edges (empty by default)
    edges: [],

    // Content
    title: input.title,
    content,
    contentPreview: extractPreview(content),
    filePath: '', // Set by storage layer
  };
}

/**
 * Update a node, incrementing version and updating timestamps
 */
export function updateNode(
  node: Node,
  updates: Partial<Pick<Node, 
    'title' | 'content' | 'status' | 'validity' | 'priority' | 
    'tags' | 'assignedTo' | 'lockedBy' | 'dueAt' | 'confidence'
  >>
): Node {
  const now = new Date().toISOString();
  
  const updated: Node = {
    ...node,
    ...updates,
    version: node.version + 1,
    modifiedAt: now,
  };

  // Recalculate derived fields if content changed
  if (updates.content !== undefined || updates.title !== undefined) {
    updated.contentPreview = extractPreview(updated.content);
    updated.ordering = {
      ...updated.ordering,
      semanticHash: generateSemanticHash(updated.title + ' ' + updated.content),
    };
  }

  return updated;
}

/**
 * Add an edge to a node
 */
export function addEdge(node: Node, edge: Omit<Edge, 'id' | 'from' | 'createdAt'>): Node {
  const now = new Date().toISOString();
  const edgeId = `${node.id}--${edge.type}-->${edge.to}`;
  
  const newEdge: Edge = {
    id: edgeId,
    from: node.id,
    to: edge.to,
    type: edge.type,
    metadata: edge.metadata,
    createdAt: now,
  };

  return {
    ...node,
    version: node.version + 1,
    modifiedAt: now,
    edges: [...node.edges, newEdge],
  };
}

/**
 * Remove an edge from a node
 */
export function removeEdge(node: Node, edgeId: string): Node {
  const now = new Date().toISOString();
  
  return {
    ...node,
    version: node.version + 1,
    modifiedAt: now,
    edges: node.edges.filter(e => e.id !== edgeId),
  };
}

/**
 * Serialize node to markdown with YAML frontmatter
 */
export function nodeToMarkdown(node: Node): string {
  const frontmatter: Record<string, unknown> = {
    id: node.id,
    type: node.type,
    version: node.version,
    status: node.status,
    validity: node.validity,
    confidence: node.confidence,
    priority: node.priority,
    tags: node.tags,
    created_by: node.createdBy,
    assigned_to: node.assignedTo,
    locked_by: node.lockedBy,
    created_at: node.createdAt,
    modified_at: node.modifiedAt,
    due_at: node.dueAt,
    ordering: {
      superseded_by: node.ordering.supersededBy,
      semantic_hash: node.ordering.semanticHash,
      source_freshness: node.ordering.sourceFreshness,
    },
    edges: node.edges.map(e => ({
      type: e.type,
      target: e.to,
      metadata: e.metadata,
    })),
    actions: node.actions,
  };

  // Build YAML manually to control formatting
  const yaml = buildYaml(frontmatter);
  
  return `---\n${yaml}---\n\n# ${node.title}\n\n${node.content}`;
}

/**
 * Simple YAML builder (no dependencies)
 */
function buildYaml(obj: Record<string, unknown>, indent = 0): string {
  const spaces = '  '.repeat(indent);
  let yaml = '';

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      yaml += `${spaces}${key}: null\n`;
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        yaml += `${spaces}${key}: []\n`;
      } else if (typeof value[0] === 'object') {
        yaml += `${spaces}${key}:\n`;
        for (const item of value) {
          yaml += `${spaces}  - ${buildYaml(item as Record<string, unknown>, indent + 2).trim().replace(/\n/g, `\n${spaces}    `)}\n`;
        }
      } else {
        yaml += `${spaces}${key}: [${value.map(v => JSON.stringify(v)).join(', ')}]\n`;
      }
    } else if (typeof value === 'object') {
      yaml += `${spaces}${key}:\n${buildYaml(value as Record<string, unknown>, indent + 1)}`;
    } else if (typeof value === 'string') {
      // Quote strings that might be problematic
      if (value.includes(':') || value.includes('#') || value.includes('\n')) {
        yaml += `${spaces}${key}: ${JSON.stringify(value)}\n`;
      } else {
        yaml += `${spaces}${key}: ${value}\n`;
      }
    } else {
      yaml += `${spaces}${key}: ${value}\n`;
    }
  }

  return yaml;
}

/**
 * Parse markdown with YAML frontmatter into a Node
 */
export function markdownToNode(markdown: string, filePath: string): Node {
  // Split frontmatter and content
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) {
    throw new Error('Invalid node file: missing YAML frontmatter');
  }

  const [, yamlStr, body] = match;
  const meta = parseYaml(yamlStr);

  // Extract title from first heading
  const titleMatch = body.match(/^# (.+)$/m);
  const title = titleMatch ? titleMatch[1] : 'Untitled';
  const content = body.replace(/^# .+\n\n?/, '');

  // Parse edges
  const edges: Edge[] = (meta.edges || []).map((e: Record<string, unknown>) => ({
    id: `${meta.id}--${e.type}-->${e.target}`,
    from: meta.id as string,
    to: e.target as string,
    type: e.type as Edge['type'],
    metadata: e.metadata as Record<string, unknown> | undefined,
    createdAt: meta.created_at as string,
  }));

  return {
    id: meta.id as string,
    type: meta.type as NodeType,
    version: meta.version as number,
    status: meta.status as NodeStatus,
    validity: meta.validity as NodeValidity,
    confidence: meta.confidence as number,
    priority: meta.priority as Priority,
    tags: meta.tags as string[],
    createdBy: meta.created_by as string | null,
    assignedTo: meta.assigned_to as string | null,
    lockedBy: meta.locked_by as string | null,
    createdAt: meta.created_at as string,
    modifiedAt: meta.modified_at as string,
    dueAt: meta.due_at as string | null,
    ordering: {
      supersededBy: meta.ordering?.superseded_by as string | null,
      semanticHash: meta.ordering?.semantic_hash as string,
      sourceFreshness: meta.ordering?.source_freshness as string,
    },
    actions: meta.actions as NodeAction[] || [],
    edges,
    title,
    content,
    contentPreview: extractPreview(content),
    filePath,
  };
}

/**
 * Simple YAML parser (no dependencies) - handles our specific format
 */
function parseYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) {
      i++;
      continue;
    }

    const match = line.match(/^(\s*)([^:]+):\s*(.*)$/);
    if (!match) {
      i++;
      continue;
    }

    const [, indent, key, value] = match;
    const indentLevel = indent.length / 2;

    if (indentLevel > 0) {
      i++;
      continue; // Skip nested for now, handle in parent
    }

    const trimmedValue = value.trim();

    if (trimmedValue === '' || trimmedValue === '|' || trimmedValue === '>') {
      // Nested object or multiline
      const nested: Record<string, unknown> = {};
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        if (!nextLine.trim()) {
          i++;
          continue;
        }
        const nextMatch = nextLine.match(/^(\s*)([^:]+):\s*(.*)$/);
        if (!nextMatch || nextMatch[1].length / 2 <= indentLevel) {
          break;
        }
        const [, , nestedKey, nestedValue] = nextMatch;
        nested[nestedKey.trim()] = parseValue(nestedValue.trim());
        i++;
      }
      result[key.trim()] = nested;
    } else if (trimmedValue.startsWith('[')) {
      // Inline array
      result[key.trim()] = JSON.parse(trimmedValue);
      i++;
    } else if (trimmedValue.startsWith('-')) {
      // Array with items on next lines
      const arr: unknown[] = [];
      if (trimmedValue !== '-') {
        arr.push(parseValue(trimmedValue.slice(1).trim()));
      }
      i++;
      while (i < lines.length && lines[i].trim().startsWith('-')) {
        arr.push(parseValue(lines[i].trim().slice(1).trim()));
        i++;
      }
      result[key.trim()] = arr;
    } else {
      result[key.trim()] = parseValue(trimmedValue);
      i++;
    }
  }

  return result;
}

function parseValue(value: string): unknown {
  if (value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  if (value.startsWith('"') && value.endsWith('"')) {
    return JSON.parse(value);
  }
  if (value.startsWith('[')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

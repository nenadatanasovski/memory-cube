import { describe, it, expect } from 'vitest';
import {
  createNode,
  updateNode,
  addEdge,
  removeEdge,
  generateId,
  generateSemanticHash,
  extractPreview,
  nodeToMarkdown,
  markdownToNode,
} from '../../src/core/node.js';

describe('generateId', () => {
  it('should create a valid ID from type and title', () => {
    const id = generateId('task', 'Implement authentication');
    expect(id).toMatch(/^task\/implement-authentication-[a-f0-9]{6}$/);
  });

  it('should handle special characters', () => {
    const id = generateId('doc', 'API Guide: Auth & Permissions!!!');
    expect(id).toMatch(/^doc\/api-guide-auth-permissions-[a-f0-9]{6}$/);
  });

  it('should truncate long titles', () => {
    const longTitle = 'A'.repeat(100);
    const id = generateId('task', longTitle);
    expect(id.length).toBeLessThan(70);
  });
});

describe('generateSemanticHash', () => {
  it('should create consistent hashes for similar content', () => {
    const hash1 = generateSemanticHash('Hello World');
    const hash2 = generateSemanticHash('hello world');
    const hash3 = generateSemanticHash('  Hello   World  ');
    expect(hash1).toBe(hash2);
    expect(hash1).toBe(hash3);
  });

  it('should create different hashes for different content', () => {
    const hash1 = generateSemanticHash('Hello World');
    const hash2 = generateSemanticHash('Goodbye World');
    expect(hash1).not.toBe(hash2);
  });
});

describe('extractPreview', () => {
  it('should extract plain text from content', () => {
    const content = '# Heading\n\nSome paragraph text here.';
    const preview = extractPreview(content);
    expect(preview).toBe('Some paragraph text here.');
  });

  it('should truncate to maxLength', () => {
    const content = 'A'.repeat(300);
    const preview = extractPreview(content, 100);
    expect(preview.length).toBe(100);
  });
});

describe('createNode', () => {
  it('should create a node with defaults', () => {
    const node = createNode({
      type: 'task',
      title: 'Test task',
    });

    expect(node.type).toBe('task');
    expect(node.title).toBe('Test task');
    expect(node.status).toBe('pending');
    expect(node.validity).toBe('current');
    expect(node.priority).toBe('normal');
    expect(node.confidence).toBe(1.0);
    expect(node.tags).toEqual([]);
    expect(node.edges).toEqual([]);
    expect(node.createdAt).toBeDefined();
    expect(node.modifiedAt).toBeDefined();
  });

  it('should accept custom values', () => {
    const node = createNode({
      type: 'doc',
      title: 'API Guide',
      content: 'Documentation content here',
      status: 'active',
      priority: 'high',
      tags: ['api', 'docs'],
      assignedTo: 'kai',
    });

    expect(node.type).toBe('doc');
    expect(node.status).toBe('active');
    expect(node.priority).toBe('high');
    expect(node.tags).toEqual(['api', 'docs']);
    expect(node.assignedTo).toBe('kai');
    expect(node.content).toBe('Documentation content here');
  });
});

describe('updateNode', () => {
  it('should update fields and increment version', () => {
    const original = createNode({
      type: 'task',
      title: 'Original',
    });

    const updated = updateNode(original, {
      status: 'active',
      priority: 'high',
    });

    expect(updated.status).toBe('active');
    expect(updated.priority).toBe('high');
    expect(updated.version).toBe(2);
    expect(updated.modifiedAt).toBeDefined();
    // Note: modifiedAt might be same as original if update happens in same ms
  });

  it('should recalculate semantic hash when content changes', () => {
    const original = createNode({
      type: 'task',
      title: 'Original',
      content: 'Original content',
    });

    const updated = updateNode(original, {
      content: 'Updated content',
    });

    expect(updated.ordering.semanticHash).not.toBe(original.ordering.semanticHash);
  });
});

describe('addEdge / removeEdge', () => {
  it('should add an edge to a node', () => {
    const node = createNode({
      type: 'task',
      title: 'Task A',
    });

    const withEdge = addEdge(node, {
      type: 'depends-on',
      to: 'task/task-b-123456',
    });

    expect(withEdge.edges.length).toBe(1);
    expect(withEdge.edges[0].type).toBe('depends-on');
    expect(withEdge.edges[0].to).toBe('task/task-b-123456');
    expect(withEdge.version).toBe(2);
  });

  it('should remove an edge from a node', () => {
    let node = createNode({
      type: 'task',
      title: 'Task A',
    });

    node = addEdge(node, {
      type: 'depends-on',
      to: 'task/task-b-123456',
    });

    const edgeId = node.edges[0].id;
    const withoutEdge = removeEdge(node, edgeId);

    expect(withoutEdge.edges.length).toBe(0);
    expect(withoutEdge.version).toBe(3);
  });
});

describe('nodeToMarkdown / markdownToNode', () => {
  it('should round-trip a node', () => {
    const original = createNode({
      type: 'task',
      title: 'Test Task',
      content: 'This is the task description.\n\nWith multiple paragraphs.',
      status: 'active',
      priority: 'high',
      tags: ['test', 'important'],
      assignedTo: 'kai',
    });

    const markdown = nodeToMarkdown(original);
    const parsed = markdownToNode(markdown, 'nodes/task/test-task.md');

    expect(parsed.id).toBe(original.id);
    expect(parsed.type).toBe(original.type);
    expect(parsed.title).toBe(original.title);
    expect(parsed.status).toBe(original.status);
    expect(parsed.priority).toBe(original.priority);
    expect(parsed.tags).toEqual(original.tags);
    expect(parsed.assignedTo).toBe(original.assignedTo);
  });
});

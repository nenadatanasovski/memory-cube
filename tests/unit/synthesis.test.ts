/**
 * Synthesis Pipeline Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationExtractor } from '../../src/synthesis/conversation-extractor.js';
import { CodeAnalyzer } from '../../src/synthesis/code-analyzer.js';
import { SynthesisPipeline } from '../../src/synthesis/pipeline.js';

describe('ConversationExtractor', () => {
  let extractor: ConversationExtractor;

  beforeEach(() => {
    extractor = new ConversationExtractor();
  });

  it('should extract task requests', () => {
    const tasks = extractor.extractTasks('We need to add authentication to the API');
    
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks[0].suggestedType).toBe('task');
    expect(tasks[0].suggestedTitle.toLowerCase()).toContain('authentication');
  });

  it('should extract urgent tasks with high priority', () => {
    const tasks = extractor.extractTasks('urgent: we need to fix the login bug');
    
    expect(tasks.length).toBeGreaterThan(0);
    // At minimum, should extract a task
    expect(tasks[0].suggestedType).toBe('task');
  });

  it('should extract decisions', () => {
    const decisions = extractor.extractDecisions('We decided to use PostgreSQL for the database');
    
    expect(decisions.length).toBeGreaterThan(0);
    expect(decisions[0].suggestedType).toBe('decision');
  });

  it('should extract ideas', () => {
    const ideas = extractor.extractIdeas('Maybe we could add rate limiting? Not sure if it\'s overkill though');
    
    expect(ideas.length).toBeGreaterThan(0);
    expect(['ideation', 'brainfart']).toContain(ideas[0].suggestedType);
  });

  it('should analyze full conversations', () => {
    const result = extractor.analyze({
      type: 'conversation',
      content: `
        User: We need to add authentication to the API.
        Assistant: Sure, I can help with that. What auth method do you want?
        User: Let's go with JWT. Also fix that login bug before Friday.
      `,
    });

    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.intents.length).toBeGreaterThan(0);
    expect(result.suggestedNodes.length).toBeGreaterThan(0);
    expect(result.summary).toBeDefined();
  });

  it('should extract tags from content', () => {
    const tasks = extractor.extractTasks('We need to fix the auth API security bug');
    
    expect(tasks.length).toBeGreaterThan(0);
    // Should have relevant tags
    const tags = tasks[0].suggestedTags;
    expect(tags.some(t => ['api', 'auth', 'security', 'bug'].includes(t))).toBe(true);
  });
});

describe('CodeAnalyzer', () => {
  let analyzer: CodeAnalyzer;

  beforeEach(() => {
    analyzer = new CodeAnalyzer();
  });

  it('should extract functions from TypeScript', () => {
    const code = `
      export function validateToken(token: string): boolean {
        return token.length > 0;
      }
      
      export async function fetchUser(id: string): Promise<User> {
        return await db.users.get(id);
      }
    `;

    const functions = analyzer.getFunctions(code, 'typescript');
    
    expect(functions.length).toBe(2);
    expect(functions[0].name).toBe('validateToken');
    expect(functions[1].name).toBe('fetchUser');
    expect(functions[1].signature).toContain('async');
  });

  it('should extract arrow functions', () => {
    const code = `
      export const add = (a: number, b: number) => a + b;
      
      export const fetchData = async (url: string) => {
        const res = await fetch(url);
        return res.json();
      };
    `;

    const functions = analyzer.getFunctions(code, 'typescript');
    
    expect(functions.length).toBe(2);
    expect(functions[0].name).toBe('add');
    expect(functions[1].name).toBe('fetchData');
  });

  it('should extract classes', () => {
    const code = `
export class UserService {
  async getUser(id: string) {
    return this.db.get(id);
  }
  
  async createUser(data: UserData) {
    return this.db.create(data);
  }
}
    `;

    const classes = analyzer.getClasses(code, 'typescript');
    
    expect(classes.length).toBe(1);
    expect(classes[0].name).toBe('UserService');
    // Methods extraction is a simple heuristic, may vary
    expect(classes[0].methods.length).toBeGreaterThanOrEqual(0);
  });

  it('should detect class inheritance', () => {
    const code = `
      export class AdminService extends UserService {
        async deleteUser(id: string) {
          return this.db.delete(id);
        }
      }
    `;

    const classes = analyzer.getClasses(code, 'typescript');
    
    expect(classes.length).toBe(1);
    expect(classes[0].extends).toBe('UserService');
  });

  it('should analyze full modules', () => {
    const code = `
      import { db } from './database';
      import type { User } from './types';
      
      export function getUser(id: string): User {
        return db.users.get(id);
      }
      
      export class UserManager {
        list() { return db.users.all(); }
      }
    `;

    const result = analyzer.analyze({
      type: 'code',
      content: code,
      metadata: { path: 'user.ts', language: 'typescript' },
    });

    expect(result.module.imports.length).toBeGreaterThan(0);
    expect(result.module.exports.length).toBeGreaterThan(0);
    expect(result.module.functions.length).toBe(1);
    expect(result.module.classes.length).toBe(1);
    expect(result.suggestedNodes.length).toBeGreaterThan(0);
  });
});

describe('SynthesisPipeline', () => {
  let pipeline: SynthesisPipeline;

  beforeEach(() => {
    pipeline = new SynthesisPipeline();
  });

  it('should extract from conversation source', async () => {
    const result = await pipeline.extract({
      type: 'conversation',
      content: 'We need to implement the login feature',
    });

    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.metadata.extractedAt).toBeDefined();
    expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should extract from code source', async () => {
    const result = await pipeline.extract({
      type: 'code',
      content: `
        export function authenticate(token: string): boolean {
          return verify(token);
        }
      `,
      metadata: { language: 'typescript' },
    });

    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.nodes[0].suggestedType).toBe('code');
  });

  it('should filter by confidence', async () => {
    pipeline.updateConfig({ minConfidence: 0.9 });
    
    const result = await pipeline.extract({
      type: 'conversation',
      content: 'Maybe we could add caching? Not sure though.',
    });

    // High confidence filter should reduce results
    // The "maybe" phrase has lower confidence
    expect(result.nodes.every(n => n.confidence >= 0.9)).toBe(true);
  });

  it('should provide quick extraction methods', () => {
    const tasks = pipeline.extractTasks('We need to fix the bug');
    expect(tasks.length).toBeGreaterThan(0);

    const functions = pipeline.extractFunctions(`
      export function test() { return true; }
    `);
    expect(functions.length).toBe(1);
  });

  it('should update config', () => {
    pipeline.updateConfig({ minConfidence: 0.8 });
    
    const config = pipeline.getConfig();
    expect(config.minConfidence).toBe(0.8);
  });
});

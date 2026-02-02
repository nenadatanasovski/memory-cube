/**
 * Conversation Extractor
 * 
 * Extracts structured nodes from conversation text.
 * Uses pattern matching and heuristics for rule-based extraction.
 */

import type {
  Source,
  ExtractedEntity,
  ExtractedNode,
  ExtractedRelation,
  ConversationMessage,
  ConversationIntent,
  ConversationAnalysisResult,
} from './types.js';
import type { NodeType, Priority } from '../core/types.js';

// ============================================================================
// Pattern Definitions
// ============================================================================

interface Pattern {
  regex: RegExp;
  type: ExtractedEntity['type'];
  nodeType?: NodeType;
  priority?: Priority;
  confidence: number;
}

const TASK_PATTERNS: Pattern[] = [
  // Direct requests
  { regex: /(?:we |i |you )(?:need to|should|must|have to|gotta|gonna) (.+?)(?:\.|$)/gi, type: 'task', nodeType: 'task', confidence: 0.8 },
  { regex: /(?:can you|could you|would you|please) (.+?)(?:\?|$)/gi, type: 'task', nodeType: 'task', confidence: 0.7 },
  { regex: /(?:let's|lets) (.+?)(?:\.|$)/gi, type: 'task', nodeType: 'task', confidence: 0.7 },
  { regex: /(?:todo|to-do|to do)[:\s]+(.+?)(?:\.|$)/gi, type: 'task', nodeType: 'task', confidence: 0.9 },
  
  // Urgency indicators
  { regex: /(?:urgent|asap|immediately|right away)[:\s]+(.+?)(?:\.|$)/gi, type: 'task', nodeType: 'task', priority: 'critical', confidence: 0.85 },
  { regex: /(?:before|by) (?:the demo|friday|tomorrow|end of day|eod).*?[,:\s]+(.+?)(?:\.|$)/gi, type: 'task', nodeType: 'task', priority: 'high', confidence: 0.8 },
  
  // Fix/bug patterns
  { regex: /(?:fix|bug|issue|problem)[:\s]+(.+?)(?:\.|$)/gi, type: 'task', nodeType: 'task', confidence: 0.85 },
  { regex: /(.+?) (?:is broken|doesn't work|isn't working|needs fixing)/gi, type: 'task', nodeType: 'task', confidence: 0.8 },
];

const DECISION_PATTERNS: Pattern[] = [
  { regex: /(?:we decided|decided to|decision)[:\s]+(.+?)(?:\.|$)/gi, type: 'decision', nodeType: 'decision', confidence: 0.9 },
  { regex: /(?:let's go with|going with|we'll use|using) (.+?)(?:\.|$)/gi, type: 'decision', nodeType: 'decision', confidence: 0.75 },
  { regex: /(?:the plan is|plan)[:\s]+(.+?)(?:\.|$)/gi, type: 'decision', nodeType: 'decision', confidence: 0.7 },
];

const IDEA_PATTERNS: Pattern[] = [
  { regex: /(?:maybe we could|what if we|idea)[:\s]+(.+?)(?:\.|$)/gi, type: 'idea', nodeType: 'ideation', confidence: 0.7 },
  { regex: /(?:i've been thinking|been thinking about|thinking)[:\s]+(.+?)(?:\.|$)/gi, type: 'idea', nodeType: 'brainfart', confidence: 0.6 },
  { regex: /(?:not sure if|might be|could be) (?:overkill|worth it|good to) (.+?)(?:\.|$)/gi, type: 'idea', nodeType: 'ideation', confidence: 0.5 },
];

const QUESTION_PATTERNS: Pattern[] = [
  { regex: /(?:how do we|how should we|what's the best way to) (.+?)\?/gi, type: 'question', confidence: 0.8 },
  { regex: /(?:should we|do we need to|is it worth) (.+?)\?/gi, type: 'question', confidence: 0.7 },
];

const INTENT_PATTERNS: Array<{ regex: RegExp; intent: ConversationIntent['type']; confidence: number }> = [
  { regex: /(?:we need|i need|please|can you|could you|would you)/i, intent: 'task_request', confidence: 0.8 },
  { regex: /(?:how do|what is|why does|when should)\?/i, intent: 'question', confidence: 0.9 },
  { regex: /(?:we decided|decided to|let's go with|the plan is)/i, intent: 'decision', confidence: 0.85 },
  { regex: /(?:what if|maybe|thinking about|idea)/i, intent: 'brainstorm', confidence: 0.7 },
  { regex: /(?:looks good|lgtm|nice|great work|well done)/i, intent: 'feedback', confidence: 0.8 },
  { regex: /(?:fyi|just so you know|heads up|btw)/i, intent: 'info_share', confidence: 0.7 },
];

// ============================================================================
// Extraction Functions
// ============================================================================

/**
 * Extract entities from text using patterns
 */
function extractEntities(text: string, patterns: Pattern[]): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  
  for (const pattern of patterns) {
    let match;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    
    while ((match = regex.exec(text)) !== null) {
      const extracted = match[1]?.trim();
      if (!extracted || extracted.length < 3) continue;
      
      // Get surrounding context
      const contextStart = Math.max(0, match.index - 50);
      const contextEnd = Math.min(text.length, match.index + match[0].length + 50);
      const context = text.slice(contextStart, contextEnd);
      
      entities.push({
        text: extracted,
        type: pattern.type,
        confidence: pattern.confidence,
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        context,
      });
    }
  }
  
  // Deduplicate overlapping entities (keep highest confidence)
  return deduplicateEntities(entities);
}

/**
 * Remove overlapping entities, keeping the highest confidence one
 */
function deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
  if (entities.length <= 1) return entities;
  
  // Sort by start offset, then by confidence (desc)
  const sorted = [...entities].sort((a, b) => {
    if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset;
    return b.confidence - a.confidence;
  });
  
  const result: ExtractedEntity[] = [];
  let lastEnd = -1;
  
  for (const entity of sorted) {
    // Skip if overlapping with previous
    if (entity.startOffset < lastEnd) {
      // But keep if higher confidence and significant overlap
      const prev = result[result.length - 1];
      if (prev && entity.confidence > prev.confidence + 0.1) {
        result[result.length - 1] = entity;
        lastEnd = entity.endOffset;
      }
      continue;
    }
    
    result.push(entity);
    lastEnd = entity.endOffset;
  }
  
  return result;
}

/**
 * Convert entities to suggested nodes
 */
function entitiesToNodes(entities: ExtractedEntity[], sourceType: string, patterns: Pattern[]): ExtractedNode[] {
  const nodes: ExtractedNode[] = [];
  
  for (const entity of entities) {
    // Find the matching pattern to get node type
    const pattern = patterns.find(p => p.type === entity.type);
    if (!pattern?.nodeType) continue;
    
    // Clean up the title
    let title = entity.text;
    title = title.charAt(0).toUpperCase() + title.slice(1);
    if (title.length > 100) {
      title = title.slice(0, 97) + '...';
    }
    
    // Generate tags from content
    const tags = extractTags(entity.text);
    
    nodes.push({
      suggestedType: pattern.nodeType,
      suggestedTitle: title,
      suggestedContent: entity.context || entity.text,
      suggestedTags: tags,
      suggestedPriority: pattern.priority || 'normal',
      confidence: entity.confidence,
      source: {
        type: sourceType as any,
        excerpt: entity.context || entity.text,
        offset: entity.startOffset,
      },
    });
  }
  
  return nodes;
}

/**
 * Extract tags from text
 */
function extractTags(text: string): string[] {
  const tags: string[] = [];
  const lowerText = text.toLowerCase();
  
  // Technical terms
  const techTerms = ['api', 'auth', 'database', 'frontend', 'backend', 'ui', 'ux', 'security', 'performance', 'bug', 'feature', 'refactor', 'test', 'docs'];
  for (const term of techTerms) {
    if (lowerText.includes(term)) {
      tags.push(term);
    }
  }
  
  // Priority indicators
  if (/urgent|asap|critical/i.test(text)) tags.push('urgent');
  if (/bug|fix|broken/i.test(text)) tags.push('bug');
  
  return [...new Set(tags)].slice(0, 5);
}

/**
 * Detect conversation intents
 */
function detectIntents(messages: ConversationMessage[]): ConversationIntent[] {
  const intents: ConversationIntent[] = [];
  
  for (const message of messages) {
    if (message.role === 'system') continue;
    
    for (const pattern of INTENT_PATTERNS) {
      if (pattern.regex.test(message.content)) {
        intents.push({
          type: pattern.intent,
          confidence: pattern.confidence,
          evidence: message.content.slice(0, 100),
        });
        break; // One intent per message
      }
    }
  }
  
  return intents;
}

/**
 * Parse raw text into conversation messages
 */
function parseConversation(text: string): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  
  // Try to detect conversation format
  // Format 1: "User: message" / "Assistant: message"
  const rolePattern = /^(user|assistant|human|ai|system)[:\s]+(.+?)(?=\n(?:user|assistant|human|ai|system)[:\s]|$)/gims;
  let match;
  
  while ((match = rolePattern.exec(text)) !== null) {
    const role = match[1].toLowerCase();
    const content = match[2].trim();
    
    messages.push({
      role: role === 'human' ? 'user' : role === 'ai' ? 'assistant' : role as any,
      content,
    });
  }
  
  // If no structured format found, treat as single user message
  if (messages.length === 0) {
    messages.push({
      role: 'user',
      content: text,
    });
  }
  
  return messages;
}

// ============================================================================
// Main Extractor Class
// ============================================================================

export class ConversationExtractor {
  /**
   * Analyze a conversation and extract structured data
   */
  analyze(source: Source): ConversationAnalysisResult {
    const messages = parseConversation(source.content);
    const fullText = messages.map(m => m.content).join('\n');
    
    // Extract entities
    const taskEntities = extractEntities(fullText, TASK_PATTERNS);
    const decisionEntities = extractEntities(fullText, DECISION_PATTERNS);
    const ideaEntities = extractEntities(fullText, IDEA_PATTERNS);
    // Questions extracted but not converted to nodes (yet)
    void extractEntities(fullText, QUESTION_PATTERNS);
    
    // Convert to nodes
    const taskNodes = entitiesToNodes(taskEntities, source.type, TASK_PATTERNS);
    const decisionNodes = entitiesToNodes(decisionEntities, source.type, DECISION_PATTERNS);
    const ideaNodes = entitiesToNodes(ideaEntities, source.type, IDEA_PATTERNS);
    
    // Detect intents
    const intents = detectIntents(messages);
    
    // Combine all nodes
    const suggestedNodes = [...taskNodes, ...decisionNodes, ...ideaNodes];
    
    // Extract relations (simple heuristics)
    const suggestedRelations: ExtractedRelation[] = [];
    
    // Tasks that mention decisions
    for (const task of taskNodes) {
      for (const decision of decisionNodes) {
        if (task.source.excerpt.toLowerCase().includes(decision.suggestedTitle.toLowerCase().slice(0, 20))) {
          suggestedRelations.push({
            from: task.suggestedTitle,
            to: decision.suggestedTitle,
            type: 'derived-from',
            confidence: 0.6,
            evidence: task.source.excerpt,
          });
        }
      }
    }
    
    // Generate summary
    const summary = this.generateSummary(messages, intents, suggestedNodes);
    
    return {
      messages,
      intents,
      suggestedNodes,
      suggestedRelations,
      summary,
    };
  }
  
  /**
   * Generate a brief summary of the conversation
   */
  private generateSummary(
    _messages: ConversationMessage[],
    intents: ConversationIntent[],
    nodes: ExtractedNode[]
  ): string {
    const parts: string[] = [];
    
    // Count intents
    const intentCounts: Record<string, number> = {};
    for (const intent of intents) {
      intentCounts[intent.type] = (intentCounts[intent.type] || 0) + 1;
    }
    
    // Build summary
    if (intentCounts.task_request) {
      parts.push(`${intentCounts.task_request} task request(s)`);
    }
    if (intentCounts.decision) {
      parts.push(`${intentCounts.decision} decision(s)`);
    }
    if (intentCounts.question) {
      parts.push(`${intentCounts.question} question(s)`);
    }
    if (intentCounts.brainstorm) {
      parts.push(`${intentCounts.brainstorm} idea(s)`);
    }
    
    // Add node counts
    const taskCount = nodes.filter(n => n.suggestedType === 'task').length;
    const ideaCount = nodes.filter(n => n.suggestedType === 'ideation' || n.suggestedType === 'brainfart').length;
    
    if (taskCount > 0) {
      parts.push(`extracted ${taskCount} potential task(s)`);
    }
    if (ideaCount > 0) {
      parts.push(`${ideaCount} idea(s)`);
    }
    
    if (parts.length === 0) {
      return 'General conversation with no clear action items.';
    }
    
    return `Conversation with ${parts.join(', ')}.`;
  }
  
  /**
   * Quick extraction - just get task-like items
   */
  extractTasks(text: string): ExtractedNode[] {
    const entities = extractEntities(text, TASK_PATTERNS);
    return entitiesToNodes(entities, 'conversation', TASK_PATTERNS);
  }
  
  /**
   * Quick extraction - just get decisions
   */
  extractDecisions(text: string): ExtractedNode[] {
    const entities = extractEntities(text, DECISION_PATTERNS);
    return entitiesToNodes(entities, 'conversation', DECISION_PATTERNS);
  }
  
  /**
   * Quick extraction - just get ideas
   */
  extractIdeas(text: string): ExtractedNode[] {
    const entities = extractEntities(text, [...IDEA_PATTERNS]);
    return entitiesToNodes(entities, 'conversation', IDEA_PATTERNS);
  }
}

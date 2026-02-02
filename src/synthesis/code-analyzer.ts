/**
 * Code Analyzer
 * 
 * Extracts structured information from source code files.
 * Creates code nodes for functions, classes, and modules.
 */

import type {
  Source,
  ExtractedNode,
  ExtractedRelation,
  CodeFunction,
  CodeClass,
  CodeModule,
  CodeAnalysisResult,
} from './types.js';

// ============================================================================
// TypeScript/JavaScript Parser (Simple Regex-based)
// ============================================================================

interface ParsedFunction {
  name: string;
  signature: string;
  docstring?: string;
  startLine: number;
  endLine: number;
  exported: boolean;
  async: boolean;
  params: string[];
}

interface ParsedClass {
  name: string;
  docstring?: string;
  startLine: number;
  endLine: number;
  exported: boolean;
  extends?: string;
  implements: string[];
  methods: ParsedFunction[];
}

/**
 * Extract functions from TypeScript/JavaScript code
 */
function extractFunctions(code: string, _language: string): ParsedFunction[] {
  const functions: ParsedFunction[] = [];
  const lines = code.split('\n');
  
  // Patterns for different function styles
  const patterns = [
    // export function name(...) or export async function name(...)
    /^(export\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)/,
    // export const name = (...) => or export const name = async (...) =>
    /^(export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(async\s+)?\(([^)]*)\)\s*=>/,
    // export const name = function(...) or export const name = async function(...)
    /^(export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(async\s+)?function\s*\(([^)]*)\)/,
    // class method: name(...) { or async name(...) {
    /^\s+(async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*\w+)?\s*\{/,
  ];
  
  let currentDocstring: string | undefined;
  let braceDepth = 0;
  let inFunction = false;
  let currentFunction: Partial<ParsedFunction> | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Track JSDoc comments
    if (trimmed.startsWith('/**')) {
      const docLines: string[] = [trimmed];
      let j = i;
      while (j < lines.length && !lines[j].includes('*/')) {
        j++;
        docLines.push(lines[j]);
      }
      currentDocstring = docLines.join('\n');
    }
    
    // Skip if inside a function body
    if (inFunction) {
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;
      
      if (braceDepth === 0) {
        inFunction = false;
        if (currentFunction) {
          currentFunction.endLine = i + 1;
          functions.push(currentFunction as ParsedFunction);
          currentFunction = null;
        }
      }
      continue;
    }
    
    // Try each pattern
    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        const exported = !!match[1];
        let name: string;
        let async = false;
        let params: string[] = [];
        
        // Different capture groups for different patterns
        if (pattern.source.includes('function\\s+')) {
          // function declaration
          async = !!match[2];
          name = match[3];
          params = (match[4] || '').split(',').map(p => p.trim()).filter(Boolean);
        } else if (pattern.source.includes('=>')) {
          // arrow function
          name = match[2];
          async = !!match[3];
          params = (match[4] || '').split(',').map(p => p.trim()).filter(Boolean);
        } else {
          // method
          async = !!match[1];
          name = match[2];
          params = (match[3] || '').split(',').map(p => p.trim()).filter(Boolean);
        }
        
        // Skip constructor, getters, setters
        if (['constructor', 'get', 'set'].includes(name)) {
          currentDocstring = undefined;
          continue;
        }
        
        currentFunction = {
          name,
          signature: `${async ? 'async ' : ''}${name}(${params.join(', ')})`,
          docstring: currentDocstring,
          startLine: i + 1,
          endLine: i + 1,
          exported,
          async,
          params,
        };
        
        braceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        inFunction = braceDepth > 0;
        
        if (!inFunction) {
          // Single line function (arrow without braces)
          functions.push(currentFunction as ParsedFunction);
          currentFunction = null;
        }
        
        currentDocstring = undefined;
        break;
      }
    }
    
    // Clear docstring if not followed by function
    if (!trimmed.startsWith('*') && !trimmed.startsWith('/**') && !trimmed.match(/^(export|async|function|const|let|var)/)) {
      currentDocstring = undefined;
    }
  }
  
  return functions;
}

/**
 * Extract classes from TypeScript/JavaScript code
 */
function extractClasses(code: string, language: string): ParsedClass[] {
  const classes: ParsedClass[] = [];
  const lines = code.split('\n');
  
  const classPattern = /^(export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/;
  
  let currentDocstring: string | undefined;
  let braceDepth = 0;
  let inClass = false;
  let currentClass: Partial<ParsedClass> | null = null;
  let classBody = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Track JSDoc comments
    if (trimmed.startsWith('/**')) {
      const docLines: string[] = [trimmed];
      let j = i;
      while (j < lines.length && !lines[j].includes('*/')) {
        j++;
        docLines.push(lines[j]);
      }
      currentDocstring = docLines.join('\n');
    }
    
    // Inside class
    if (inClass) {
      classBody += line + '\n';
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;
      
      if (braceDepth === 0) {
        inClass = false;
        if (currentClass) {
          currentClass.endLine = i + 1;
          // Parse methods from class body
          currentClass.methods = extractFunctions(classBody, language);
          classes.push(currentClass as ParsedClass);
          currentClass = null;
          classBody = '';
        }
      }
      continue;
    }
    
    // Check for class declaration
    const match = trimmed.match(classPattern);
    if (match) {
      const exported = !!match[1];
      const name = match[2];
      const extendsClass = match[3];
      const implementsClasses = match[4]?.split(',').map(s => s.trim()) || [];
      
      currentClass = {
        name,
        docstring: currentDocstring,
        startLine: i + 1,
        endLine: i + 1,
        exported,
        extends: extendsClass,
        implements: implementsClasses,
        methods: [],
      };
      
      braceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      inClass = braceDepth > 0;
      classBody = line + '\n';
      
      currentDocstring = undefined;
    }
    
    // Clear docstring if not followed by class
    if (!trimmed.startsWith('*') && !trimmed.startsWith('/**') && !trimmed.match(/^(export|class)/)) {
      currentDocstring = undefined;
    }
  }
  
  return classes;
}

/**
 * Extract imports from TypeScript/JavaScript code
 */
function extractImports(code: string): CodeModule['imports'] {
  const imports: CodeModule['imports'] = [];
  
  // import { a, b } from 'module'
  const namedPattern = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
  // import name from 'module'
  const defaultPattern = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
  // import * as name from 'module'
  const namespacePattern = /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
  
  let match;
  
  while ((match = namedPattern.exec(code)) !== null) {
    const items = match[1].split(',').map(s => s.trim().split(' as ')[0]);
    imports.push({
      module: match[2],
      items,
      isDefault: false,
    });
  }
  
  while ((match = defaultPattern.exec(code)) !== null) {
    imports.push({
      module: match[2],
      items: [match[1]],
      isDefault: true,
    });
  }
  
  while ((match = namespacePattern.exec(code)) !== null) {
    imports.push({
      module: match[2],
      items: [match[1]],
      isDefault: false,
    });
  }
  
  return imports;
}

/**
 * Extract exports from TypeScript/JavaScript code
 */
function extractExports(code: string): string[] {
  const exports: string[] = [];
  
  // export { a, b }
  const namedExportPattern = /export\s+\{([^}]+)\}/g;
  // export const/let/var/function/class name
  const directExportPattern = /export\s+(?:const|let|var|function|class|async\s+function)\s+(\w+)/g;
  // export default
  const defaultExportPattern = /export\s+default\s+(?:class|function)?\s*(\w+)?/g;
  
  let match;
  
  while ((match = namedExportPattern.exec(code)) !== null) {
    const items = match[1].split(',').map(s => s.trim().split(' as ')[0]);
    exports.push(...items);
  }
  
  while ((match = directExportPattern.exec(code)) !== null) {
    exports.push(match[1]);
  }
  
  while ((match = defaultExportPattern.exec(code)) !== null) {
    if (match[1]) {
      exports.push(match[1]);
    } else {
      exports.push('default');
    }
  }
  
  return [...new Set(exports)];
}

// ============================================================================
// Main Analyzer Class
// ============================================================================

export class CodeAnalyzer {
  private supportedLanguages = ['typescript', 'javascript', 'ts', 'js'];
  
  /**
   * Analyze source code and extract structured information
   */
  analyze(source: Source): CodeAnalysisResult {
    const language = source.metadata?.language || this.detectLanguage(source.metadata?.path || '');
    
    if (!this.supportedLanguages.includes(language)) {
      return {
        module: {
          path: source.metadata?.path || 'unknown',
          language,
          imports: [],
          exports: [],
          functions: [],
          classes: [],
          constants: [],
        },
        suggestedNodes: [],
        suggestedRelations: [],
      };
    }
    
    const functions = extractFunctions(source.content, language);
    const classes = extractClasses(source.content, language);
    const imports = extractImports(source.content);
    const exports = extractExports(source.content);
    
    const module: CodeModule = {
      path: source.metadata?.path || 'unknown',
      language,
      imports,
      exports,
      functions: functions.map(f => ({
        name: f.name,
        signature: f.signature,
        docstring: f.docstring,
        startLine: f.startLine,
        endLine: f.endLine,
        complexity: this.estimateComplexity(source.content, f.startLine, f.endLine),
        dependencies: this.extractDependencies(source.content, f.startLine, f.endLine),
        exports: f.exported,
      })),
      classes: classes.map(c => ({
        name: c.name,
        docstring: c.docstring,
        startLine: c.startLine,
        endLine: c.endLine,
        methods: c.methods.map(m => ({
          name: m.name,
          signature: m.signature,
          docstring: m.docstring,
          startLine: m.startLine,
          endLine: m.endLine,
          complexity: 1,
          dependencies: [],
          exports: false,
        })),
        properties: [],
        extends: c.extends,
        implements: c.implements,
      })),
      constants: [],
    };
    
    // Generate suggested nodes
    const suggestedNodes = this.generateNodes(module, source);
    
    // Generate suggested relations
    const suggestedRelations = this.generateRelations(module);
    
    return {
      module,
      suggestedNodes,
      suggestedRelations,
    };
  }
  
  /**
   * Detect language from file extension
   */
  private detectLanguage(path: string): string {
    if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
    if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
    if (path.endsWith('.py')) return 'python';
    if (path.endsWith('.go')) return 'go';
    if (path.endsWith('.rs')) return 'rust';
    return 'unknown';
  }
  
  /**
   * Estimate cyclomatic complexity (simple heuristic)
   */
  private estimateComplexity(code: string, startLine: number, endLine: number): number {
    const lines = code.split('\n').slice(startLine - 1, endLine);
    const body = lines.join('\n');
    
    let complexity = 1;
    
    // Count decision points
    const patterns = [
      /\bif\s*\(/g,
      /\belse\s+if\s*\(/g,
      /\bfor\s*\(/g,
      /\bwhile\s*\(/g,
      /\bswitch\s*\(/g,
      /\bcase\s+/g,
      /\bcatch\s*\(/g,
      /\?\s*[^:]/g,  // Ternary
      /&&/g,
      /\|\|/g,
    ];
    
    for (const pattern of patterns) {
      const matches = body.match(pattern);
      if (matches) complexity += matches.length;
    }
    
    return complexity;
  }
  
  /**
   * Extract function dependencies (simple heuristic)
   */
  private extractDependencies(code: string, startLine: number, endLine: number): string[] {
    const lines = code.split('\n').slice(startLine - 1, endLine);
    const body = lines.join('\n');
    
    const deps: string[] = [];
    
    // Look for function calls
    const callPattern = /\b(\w+)\s*\(/g;
    let match;
    
    while ((match = callPattern.exec(body)) !== null) {
      const name = match[1];
      // Skip common keywords and builtins
      if (!['if', 'for', 'while', 'switch', 'function', 'return', 'new', 'typeof', 'instanceof', 'console', 'Math', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'JSON', 'Promise'].includes(name)) {
        deps.push(name);
      }
    }
    
    return [...new Set(deps)];
  }
  
  /**
   * Generate code nodes from module analysis
   */
  private generateNodes(module: CodeModule, _source: Source): ExtractedNode[] {
    const nodes: ExtractedNode[] = [];
    
    // Node for each exported function
    for (const func of module.functions) {
      if (func.exports) {
        nodes.push({
          suggestedType: 'code',
          suggestedTitle: `${func.name}()`,
          suggestedContent: `## ${func.signature}\n\n${func.docstring || 'No documentation.'}\n\nFile: ${module.path}:${func.startLine}-${func.endLine}`,
          suggestedTags: ['code', 'function', module.language],
          suggestedPriority: 'normal',
          confidence: 0.9,
          source: {
            type: 'code',
            excerpt: func.signature,
            offset: func.startLine,
          },
        });
      }
    }
    
    // Node for each class
    for (const cls of module.classes) {
      const methodList = cls.methods.map(m => `- ${m.signature}`).join('\n');
      
      nodes.push({
        suggestedType: 'code',
        suggestedTitle: `class ${cls.name}`,
        suggestedContent: `## class ${cls.name}${cls.extends ? ` extends ${cls.extends}` : ''}\n\n${cls.docstring || 'No documentation.'}\n\n### Methods\n${methodList}\n\nFile: ${module.path}:${cls.startLine}-${cls.endLine}`,
        suggestedTags: ['code', 'class', module.language],
        suggestedPriority: 'normal',
        confidence: 0.9,
        source: {
          type: 'code',
          excerpt: `class ${cls.name}`,
          offset: cls.startLine,
        },
      });
    }
    
    return nodes;
  }
  
  /**
   * Generate relations from module analysis
   */
  private generateRelations(module: CodeModule): ExtractedRelation[] {
    const relations: ExtractedRelation[] = [];
    
    // Class inheritance
    for (const cls of module.classes) {
      if (cls.extends) {
        relations.push({
          from: `class ${cls.name}`,
          to: `class ${cls.extends}`,
          type: 'part-of',
          confidence: 0.95,
          evidence: `${cls.name} extends ${cls.extends}`,
        });
      }
    }
    
    // Function dependencies
    const funcNames = new Set(module.functions.map(f => f.name));
    
    for (const func of module.functions) {
      for (const dep of func.dependencies) {
        if (funcNames.has(dep)) {
          relations.push({
            from: `${func.name}()`,
            to: `${dep}()`,
            type: 'depends-on',
            confidence: 0.7,
            evidence: `${func.name} calls ${dep}`,
          });
        }
      }
    }
    
    return relations;
  }
  
  /**
   * Quick analysis - just get function signatures
   */
  getFunctions(code: string, language: string = 'typescript'): CodeFunction[] {
    const functions = extractFunctions(code, language);
    return functions.map(f => ({
      name: f.name,
      signature: f.signature,
      docstring: f.docstring,
      startLine: f.startLine,
      endLine: f.endLine,
      complexity: 1,
      dependencies: [],
      exports: f.exported,
    }));
  }
  
  /**
   * Quick analysis - just get class names
   */
  getClasses(code: string, language: string = 'typescript'): CodeClass[] {
    const classes = extractClasses(code, language);
    return classes.map(c => ({
      name: c.name,
      docstring: c.docstring,
      startLine: c.startLine,
      endLine: c.endLine,
      methods: c.methods.map(m => ({
        name: m.name,
        signature: m.signature,
        docstring: m.docstring,
        startLine: m.startLine,
        endLine: m.endLine,
        complexity: 1,
        dependencies: [],
        exports: false,
      })),
      properties: [],
      extends: c.extends,
      implements: c.implements,
    }));
  }
}

/**
 * GitHub Integration
 * 
 * Bidirectional sync between Memory Cube and GitHub issues/PRs.
 * Uses the `gh` CLI for all GitHub operations.
 */

import { execSync } from 'child_process';
import type { Cube } from '../core/cube.js';
import type { Node, NodeType, NodeStatus } from '../core/types.js';

export interface GitHubConfig {
  /** GitHub repository in owner/repo format */
  repo: string;
  /** Label to identify cube-synced issues */
  syncLabel?: string;
  /** Auto-sync interval in ms (0 = disabled) */
  syncInterval?: number;
  /** Map GitHub issue labels to node types */
  labelTypeMap?: Record<string, NodeType>;
  /** Map GitHub issue states to node statuses */
  stateStatusMap?: Record<string, NodeStatus>;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  assignees: string[];
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  labels: string[];
  url: string;
  headRef: string;
  baseRef: string;
}

const DEFAULT_CONFIG: Required<GitHubConfig> = {
  repo: '',
  syncLabel: 'cube-sync',
  syncInterval: 0,
  labelTypeMap: {
    'bug': 'task',
    'enhancement': 'ideation',
    'documentation': 'doc',
    'question': 'brainfart',
    'research': 'research',
  },
  stateStatusMap: {
    'open': 'pending',
    'closed': 'complete',
  },
};

export class GitHubIntegration {
  private cube: Cube;
  private config: Required<GitHubConfig>;
  private syncTimer: NodeJS.Timeout | null = null;

  constructor(cube: Cube, config: GitHubConfig) {
    if (!config.repo) {
      throw new Error('GitHub repo is required (format: owner/repo)');
    }
    
    this.cube = cube;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if gh CLI is available and authenticated
   */
  async checkAuth(): Promise<{ ok: boolean; error?: string }> {
    try {
      execSync('gh auth status', { stdio: 'pipe' });
      return { ok: true };
    } catch (error: any) {
      return { 
        ok: false, 
        error: 'GitHub CLI not authenticated. Run: gh auth login' 
      };
    }
  }

  /**
   * Import GitHub issues into the cube
   */
  async importIssues(options?: { 
    state?: 'open' | 'closed' | 'all';
    labels?: string[];
    limit?: number;
  }): Promise<{ imported: number; updated: number; errors: string[] }> {
    const state = options?.state ?? 'all';
    const limit = options?.limit ?? 100;
    const labels = options?.labels?.join(',') ?? '';

    const result = { imported: 0, updated: 0, errors: [] as string[] };

    try {
      // Fetch issues using gh CLI
      let cmd = `gh issue list --repo ${this.config.repo} --state ${state} --limit ${limit} --json number,title,body,state,labels,assignees,url,createdAt,updatedAt`;
      if (labels) {
        cmd += ` --label "${labels}"`;
      }

      const output = execSync(cmd, { encoding: 'utf-8' });
      const issues: any[] = JSON.parse(output);

      for (const issue of issues) {
        try {
          const nodeId = this.issueToNodeId(issue.number);
          const existing = this.cube.get(nodeId);

          const nodeType = this.inferNodeType(issue.labels.map((l: any) => l.name));
          const nodeStatus = this.config.stateStatusMap[issue.state] ?? 'pending';

          const nodeData = {
            type: nodeType,
            title: issue.title,
            content: this.formatIssueContent(issue),
            status: nodeStatus,
            tags: ['github', `gh-issue-${issue.number}`, ...issue.labels.map((l: any) => l.name)],
          };

          if (existing.success) {
            // Update existing node
            const updateResult = this.cube.update(nodeId, nodeData);
            if (updateResult.success) {
              result.updated++;
            } else {
              result.errors.push(`Failed to update issue #${issue.number}: ${updateResult.error}`);
            }
          } else {
            // Create new node
            const createResult = this.cube.create({
              ...nodeData,
            });
            if (createResult.success) {
              result.imported++;
            } else {
              result.errors.push(`Failed to import issue #${issue.number}: ${createResult.error}`);
            }
          }
        } catch (err: any) {
          result.errors.push(`Error processing issue #${issue.number}: ${err.message}`);
        }
      }
    } catch (err: any) {
      result.errors.push(`Failed to fetch issues: ${err.message}`);
    }

    return result;
  }

  /**
   * Export a cube node to GitHub as an issue
   */
  async exportToIssue(nodeId: string): Promise<{ ok: boolean; issueNumber?: number; url?: string; error?: string }> {
    const nodeResult = this.cube.get(nodeId);
    if (!nodeResult.success || !nodeResult.data) {
      return { ok: false, error: nodeResult.error ?? 'Node not found' };
    }

    const node = nodeResult.data;
    
    // Check if already exported (look for gh-issue-* tag)
    const existingIssueTag = node.tags?.find(t => t.startsWith('gh-issue-'));
    if (existingIssueTag) {
      const issueNum = existingIssueTag.replace('gh-issue-', '');
      return { 
        ok: false, 
        error: `Node already linked to issue #${issueNum}` 
      };
    }

    try {
      // Create issue using gh CLI
      const labels = this.nodeTypeToLabels(node.type);
      const body = this.formatNodeAsIssueBody(node);
      
      const cmd = `gh issue create --repo ${this.config.repo} --title "${this.escapeShell(node.title)}" --body "${this.escapeShell(body)}" --label "${labels.join(',')}"`;
      
      const output = execSync(cmd, { encoding: 'utf-8' });
      const url = output.trim();
      const issueNumber = parseInt(url.split('/').pop() ?? '0', 10);

      // Update node with GitHub link (stored in tags)
      this.cube.update(nodeId, {
        tags: [...(node.tags || []), `gh-issue-${issueNumber}`, `gh-repo-${this.config.repo.replace('/', '-')}`],
      });

      return { ok: true, issueNumber, url };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Sync node status changes to GitHub
   */
  async syncStatusToGitHub(nodeId: string): Promise<{ ok: boolean; error?: string }> {
    const nodeResult = this.cube.get(nodeId);
    if (!nodeResult.success || !nodeResult.data) {
      return { ok: false, error: 'Node not found' };
    }

    const node = nodeResult.data;
    
    // Find issue number from tags
    const issueTag = node.tags?.find(t => t.startsWith('gh-issue-'));
    if (!issueTag) {
      return { ok: false, error: 'Node not linked to a GitHub issue' };
    }
    const issueNumber = parseInt(issueTag.replace('gh-issue-', ''), 10);

    try {
      // Map node status to GitHub issue state
      const githubState = node.status === 'complete' ? 'closed' : 'open';
      
      if (githubState === 'closed') {
        execSync(`gh issue close ${issueNumber} --repo ${this.config.repo}`, { stdio: 'pipe' });
      } else {
        execSync(`gh issue reopen ${issueNumber} --repo ${this.config.repo}`, { stdio: 'pipe' });
      }

      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Import PRs that reference cube nodes
   */
  async importPRs(options?: { state?: 'open' | 'closed' | 'merged' | 'all'; limit?: number }): Promise<{ imported: number; errors: string[] }> {
    const state = options?.state ?? 'all';
    const limit = options?.limit ?? 50;
    const result = { imported: 0, errors: [] as string[] };

    try {
      const cmd = `gh pr list --repo ${this.config.repo} --state ${state} --limit ${limit} --json number,title,body,state,labels,url,headRefName,baseRefName`;
      const output = execSync(cmd, { encoding: 'utf-8' });
      const prs: any[] = JSON.parse(output);

      for (const pr of prs) {
        try {
          const nodeId = `code/pr-${pr.number}-${this.slugify(pr.title)}`;
          const existing = this.cube.get(nodeId);

          if (!existing.success) {
            const createResult = this.cube.create({
              type: 'code',
              title: `PR #${pr.number}: ${pr.title}`,
              content: this.formatPRContent(pr),
              status: pr.state === 'merged' ? 'complete' : pr.state === 'closed' ? 'archived' : 'active',
              tags: ['github', 'pull-request', `gh-pr-${pr.number}`, pr.headRefName],
            });

            if (createResult.success) {
              result.imported++;
              
              // Link PR to any issues it references
              const issueRefs = this.extractIssueReferences(pr.body);
              for (const issueNum of issueRefs) {
                const issueNodeId = this.issueToNodeId(issueNum);
                const issueNode = this.cube.get(issueNodeId);
                if (issueNode.success) {
                  this.cube.link(createResult.data!.id, 'implements', issueNodeId);
                }
              }
            }
          }
        } catch (err: any) {
          result.errors.push(`Error processing PR #${pr.number}: ${err.message}`);
        }
      }
    } catch (err: any) {
      result.errors.push(`Failed to fetch PRs: ${err.message}`);
    }

    return result;
  }

  /**
   * Start automatic sync
   */
  startAutoSync(): void {
    if (this.config.syncInterval <= 0) return;
    
    this.syncTimer = setInterval(async () => {
      await this.importIssues({ state: 'all' });
      await this.importPRs({ state: 'open' });
    }, this.config.syncInterval);
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  // Helper methods

  private issueToNodeId(issueNumber: number): string {
    return `task/gh-issue-${issueNumber}`;
  }

  private inferNodeType(labels: string[]): NodeType {
    for (const label of labels) {
      const mappedType = this.config.labelTypeMap[label.toLowerCase()];
      if (mappedType) return mappedType;
    }
    return 'task';
  }

  private nodeTypeToLabels(type: NodeType): string[] {
    const labels = [this.config.syncLabel];
    
    // Reverse lookup in labelTypeMap
    for (const [label, nodeType] of Object.entries(this.config.labelTypeMap)) {
      if (nodeType === type) {
        labels.push(label);
        break;
      }
    }
    
    return labels;
  }

  private formatIssueContent(issue: any): string {
    let content = issue.body || '';
    content += `\n\n---\n`;
    content += `**GitHub:** [#${issue.number}](${issue.url})\n`;
    content += `**State:** ${issue.state}\n`;
    if (issue.assignees?.length > 0) {
      content += `**Assignees:** ${issue.assignees.map((a: any) => a.login).join(', ')}\n`;
    }
    return content;
  }

  private formatPRContent(pr: any): string {
    let content = pr.body || '';
    content += `\n\n---\n`;
    content += `**GitHub:** [PR #${pr.number}](${pr.url})\n`;
    content += `**Branch:** ${pr.headRefName} → ${pr.baseRefName}\n`;
    content += `**State:** ${pr.state}\n`;
    return content;
  }

  private formatNodeAsIssueBody(node: Node): string {
    let body = node.content || '';
    body += `\n\n---\n`;
    body += `*Exported from Memory Cube*\n`;
    body += `- **Node ID:** \`${node.id}\`\n`;
    body += `- **Type:** ${node.type}\n`;
    body += `- **Priority:** ${node.priority}\n`;
    if (node.tags?.length > 0) {
      body += `- **Tags:** ${node.tags.join(', ')}\n`;
    }
    return body;
  }

  private extractIssueReferences(text: string): number[] {
    const matches = text?.match(/#(\d+)/g) || [];
    return matches.map(m => parseInt(m.slice(1), 10));
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30);
  }

  private escapeShell(text: string): string {
    return text.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
  }
}

export { GitHubIntegration as default };

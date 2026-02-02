/**
 * File Watcher
 * 
 * Watches the .cube/nodes directory for changes and emits events.
 * Useful for detecting external modifications to node files.
 */

import { watch, FSWatcher } from 'fs';
import { join, relative, basename } from 'path';
import { existsSync, readdirSync } from 'fs';
import { randomUUID } from 'crypto';
import type { EventBus } from './event-bus.js';
import type { CodeFileChangedEvent } from './types.js';

export interface FileWatcherOptions {
  debounceMs?: number;      // Debounce rapid changes
  ignorePatterns?: RegExp[]; // Patterns to ignore
  recursive?: boolean;       // Watch subdirectories
}

const DEFAULT_OPTIONS: Required<FileWatcherOptions> = {
  debounceMs: 100,
  ignorePatterns: [
    /\.swp$/,        // Vim swap files
    /~$/,            // Backup files
    /^\.#/,          // Emacs lock files
    /\.DS_Store$/,   // macOS
    /Thumbs\.db$/,   // Windows
  ],
  recursive: true,
};

interface PendingChange {
  type: 'change' | 'rename';
  path: string;
  timestamp: number;
}

export class FileWatcher {
  private watchPath: string;
  private eventBus: EventBus;
  private options: Required<FileWatcherOptions>;
  private watcher: FSWatcher | null = null;
  private pendingChanges: Map<string, PendingChange> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private knownFiles: Set<string> = new Set();

  constructor(cubePath: string, eventBus: EventBus, options?: FileWatcherOptions) {
    this.watchPath = join(cubePath, '.cube', 'nodes');
    this.eventBus = eventBus;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Start watching for file changes
   */
  start(): boolean {
    if (this.watcher) {
      return false; // Already watching
    }

    if (!existsSync(this.watchPath)) {
      console.warn(`[FileWatcher] Watch path does not exist: ${this.watchPath}`);
      return false;
    }

    // Build initial file list
    this.scanDirectory(this.watchPath);

    try {
      this.watcher = watch(
        this.watchPath,
        { recursive: this.options.recursive },
        (eventType, filename) => {
          if (filename) {
            this.handleChange(eventType as 'change' | 'rename', filename);
          }
        }
      );

      this.watcher.on('error', (error) => {
        console.error('[FileWatcher] Error:', error);
      });

      return true;
    } catch (error) {
      console.error('[FileWatcher] Failed to start:', error);
      return false;
    }
  }

  /**
   * Stop watching for file changes
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.pendingChanges.clear();
    this.knownFiles.clear();
  }

  /**
   * Check if watcher is running
   */
  isRunning(): boolean {
    return this.watcher !== null;
  }

  /**
   * Scan directory and track known files
   */
  private scanDirectory(dir: string): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (this.options.recursive) {
            this.scanDirectory(fullPath);
          }
        } else if (entry.isFile() && fullPath.endsWith('.md')) {
          const relativePath = relative(this.watchPath, fullPath);
          this.knownFiles.add(relativePath);
        }
      }
    } catch {
      // Ignore scan errors
    }
  }

  /**
   * Handle a file change event
   */
  private handleChange(eventType: 'change' | 'rename', filename: string): void {
    // Check ignore patterns
    if (this.shouldIgnore(filename)) {
      return;
    }

    // Only care about .md files
    if (!filename.endsWith('.md')) {
      return;
    }

    // Add to pending changes
    this.pendingChanges.set(filename, {
      type: eventType,
      path: filename,
      timestamp: Date.now(),
    });

    // Debounce processing
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processPendingChanges();
    }, this.options.debounceMs);
  }

  /**
   * Check if file should be ignored
   */
  private shouldIgnore(filename: string): boolean {
    const base = basename(filename);
    return this.options.ignorePatterns.some(pattern => pattern.test(base));
  }

  /**
   * Process all pending changes
   */
  private processPendingChanges(): void {
    const changes = Array.from(this.pendingChanges.values());
    this.pendingChanges.clear();

    for (const change of changes) {
      const fullPath = join(this.watchPath, change.path);
      const fileExists = existsSync(fullPath);
      const wasKnown = this.knownFiles.has(change.path);

      let changeType: 'created' | 'modified' | 'deleted';

      if (!fileExists && wasKnown) {
        // File was deleted
        changeType = 'deleted';
        this.knownFiles.delete(change.path);
      } else if (fileExists && !wasKnown) {
        // File was created
        changeType = 'created';
        this.knownFiles.add(change.path);
      } else if (fileExists && wasKnown) {
        // File was modified
        changeType = 'modified';
      } else {
        // File doesn't exist and wasn't known - ignore
        continue;
      }

      this.emitFileChange(change.path, changeType);
    }
  }

  /**
   * Emit a file change event
   */
  private emitFileChange(filePath: string, changeType: 'created' | 'modified' | 'deleted'): void {
    const event: CodeFileChangedEvent = {
      id: randomUUID(),
      type: 'code.file_changed',
      timestamp: new Date().toISOString(),
      source: 'file-watcher',
      filePath: filePath,
      changeType: changeType,
    };

    this.eventBus.emitSync(event);
  }

  /**
   * Get the watch path
   */
  getWatchPath(): string {
    return this.watchPath;
  }

  /**
   * Get count of known files
   */
  getKnownFileCount(): number {
    return this.knownFiles.size;
  }
}

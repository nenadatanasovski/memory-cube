/**
 * Event Log
 * 
 * Append-only persistent log for Memory Cube events.
 * Stores events in JSONL format for easy parsing and streaming.
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import type { CubeEvent, EventLogEntry } from './types.js';

export interface EventLogOptions {
  maxSizeBytes?: number;      // Max log file size before rotation
  maxEvents?: number;         // Max events to keep (0 = unlimited)
  rotateCount?: number;       // Number of rotated files to keep
}

const DEFAULT_OPTIONS: Required<EventLogOptions> = {
  maxSizeBytes: 10 * 1024 * 1024, // 10MB
  maxEvents: 10000,
  rotateCount: 3,
};

export class EventLog {
  private logPath: string;
  private options: Required<EventLogOptions>;
  private eventCount: number = 0;

  constructor(cubePath: string, options?: EventLogOptions) {
    this.logPath = join(cubePath, '.cube', 'events.log');
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.ensureDirectory();
    this.countExistingEvents();
  }

  /**
   * Ensure the log directory exists
   */
  private ensureDirectory(): void {
    const dir = dirname(this.logPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Count existing events in log
   */
  private countExistingEvents(): void {
    if (!existsSync(this.logPath)) {
      this.eventCount = 0;
      return;
    }

    try {
      const content = readFileSync(this.logPath, 'utf-8');
      this.eventCount = content.split('\n').filter(line => line.trim()).length;
    } catch {
      this.eventCount = 0;
    }
  }

  /**
   * Append an event to the log
   */
  append(entry: EventLogEntry): void {
    this.checkRotation();

    const line = JSON.stringify(entry) + '\n';
    appendFileSync(this.logPath, line, 'utf-8');
    this.eventCount++;
  }

  /**
   * Append just the event (creates minimal entry)
   */
  appendEvent(event: CubeEvent, triggersActivated: string[] = []): void {
    this.append({
      event,
      processedAt: new Date().toISOString(),
      triggersActivated,
    });
  }

  /**
   * Read recent events
   */
  readRecent(count: number = 100): EventLogEntry[] {
    if (!existsSync(this.logPath)) {
      return [];
    }

    try {
      const content = readFileSync(this.logPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      // Get last N lines
      const recentLines = lines.slice(-count);
      
      return recentLines.map(line => {
        try {
          return JSON.parse(line) as EventLogEntry;
        } catch {
          return null;
        }
      }).filter((entry): entry is EventLogEntry => entry !== null);
    } catch {
      return [];
    }
  }

  /**
   * Read events by type
   */
  readByType(eventType: string, count: number = 100): EventLogEntry[] {
    const all = this.readRecent(count * 10); // Read more to filter
    return all
      .filter(entry => entry.event.type === eventType)
      .slice(-count);
  }

  /**
   * Read events for a specific node
   */
  readByNode(nodeId: string, count: number = 100): EventLogEntry[] {
    const all = this.readRecent(count * 10);
    return all
      .filter(entry => {
        const event = entry.event as any;
        return event.nodeId === nodeId || 
               event.node?.id === nodeId ||
               event.fromNodeId === nodeId ||
               event.toNodeId === nodeId ||
               event.taskId === nodeId;
      })
      .slice(-count);
  }

  /**
   * Read events in a time range
   */
  readByTimeRange(startTime: string, endTime: string): EventLogEntry[] {
    const all = this.readAll();
    return all.filter(entry => {
      const ts = entry.event.timestamp;
      return ts >= startTime && ts <= endTime;
    });
  }

  /**
   * Read all events (use with caution on large logs)
   */
  readAll(): EventLogEntry[] {
    if (!existsSync(this.logPath)) {
      return [];
    }

    try {
      const content = readFileSync(this.logPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      return lines.map(line => {
        try {
          return JSON.parse(line) as EventLogEntry;
        } catch {
          return null;
        }
      }).filter((entry): entry is EventLogEntry => entry !== null);
    } catch {
      return [];
    }
  }

  /**
   * Check if rotation is needed and perform it
   */
  private checkRotation(): void {
    if (!existsSync(this.logPath)) return;

    let needsRotation = false;

    // Check file size
    if (this.options.maxSizeBytes > 0) {
      try {
        const stats = statSync(this.logPath);
        if (stats.size >= this.options.maxSizeBytes) {
          needsRotation = true;
        }
      } catch {
        // Ignore stat errors
      }
    }

    // Check event count
    if (this.options.maxEvents > 0 && this.eventCount >= this.options.maxEvents) {
      needsRotation = true;
    }

    if (needsRotation) {
      this.rotate();
    }
  }

  /**
   * Rotate log files
   */
  private rotate(): void {
    // Delete oldest rotation
    const oldestPath = `${this.logPath}.${this.options.rotateCount}`;
    if (existsSync(oldestPath)) {
      try {
        require('fs').unlinkSync(oldestPath);
      } catch {
        // Ignore deletion errors
      }
    }

    // Shift existing rotations
    for (let i = this.options.rotateCount - 1; i >= 1; i--) {
      const from = `${this.logPath}.${i}`;
      const to = `${this.logPath}.${i + 1}`;
      if (existsSync(from)) {
        try {
          require('fs').renameSync(from, to);
        } catch {
          // Ignore rename errors
        }
      }
    }

    // Rotate current log
    if (existsSync(this.logPath)) {
      try {
        require('fs').renameSync(this.logPath, `${this.logPath}.1`);
      } catch {
        // If rename fails, truncate instead
        writeFileSync(this.logPath, '', 'utf-8');
      }
    }

    this.eventCount = 0;
  }

  /**
   * Clear the event log
   */
  clear(): void {
    if (existsSync(this.logPath)) {
      writeFileSync(this.logPath, '', 'utf-8');
    }
    this.eventCount = 0;
  }

  /**
   * Get log statistics
   */
  stats(): {
    eventCount: number;
    fileSizeBytes: number;
    oldestEvent?: string;
    newestEvent?: string;
  } {
    let fileSizeBytes = 0;
    let oldestEvent: string | undefined;
    let newestEvent: string | undefined;

    if (existsSync(this.logPath)) {
      try {
        fileSizeBytes = statSync(this.logPath).size;
        
        const recent = this.readRecent(1);
        if (recent.length > 0) {
          newestEvent = recent[0].event.timestamp;
        }

        // Read first line for oldest
        const content = readFileSync(this.logPath, 'utf-8');
        const firstLine = content.split('\n')[0];
        if (firstLine) {
          try {
            const entry = JSON.parse(firstLine) as EventLogEntry;
            oldestEvent = entry.event.timestamp;
          } catch {
            // Ignore parse errors
          }
        }
      } catch {
        // Ignore stat errors
      }
    }

    return {
      eventCount: this.eventCount,
      fileSizeBytes,
      oldestEvent,
      newestEvent,
    };
  }

  /**
   * Get the log file path
   */
  getPath(): string {
    return this.logPath;
  }
}

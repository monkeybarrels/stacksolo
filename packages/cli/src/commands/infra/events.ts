/**
 * stacksolo events
 *
 * View high-resolution event logs for deploy sessions.
 * Shows detailed timeline of all operations during deployment.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  initRegistry,
  listSessions,
  getSession,
  getSessionEvents,
  getLatestSession,
} from '@stacksolo/registry';
import type { Session, Event, EventCategory } from '@stacksolo/registry';

// =============================================================================
// ASCII Table Helpers
// =============================================================================

interface TableColumn {
  header: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

function drawTableLine(columns: TableColumn[], char = '-', join = '+'): string {
  const segments = columns.map((col) => char.repeat(col.width + 2));
  return join + segments.join(join) + join;
}

function drawTableRow(columns: TableColumn[], values: string[]): string {
  const cells = columns.map((col, i) => {
    const value = values[i] || '';
    const stripped = value.replace(/\x1b\[[0-9;]*m/g, ''); // Strip ANSI codes for length
    const padding = col.width - stripped.length;
    if (col.align === 'right') {
      return ' ' + ' '.repeat(Math.max(0, padding)) + value + ' ';
    } else if (col.align === 'center') {
      const left = Math.floor(padding / 2);
      const right = padding - left;
      return ' ' + ' '.repeat(Math.max(0, left)) + value + ' '.repeat(Math.max(0, right)) + ' ';
    } else {
      return ' ' + value + ' '.repeat(Math.max(0, padding)) + ' ';
    }
  });
  return '|' + cells.join('|') + '|';
}

/**
 * Format timestamp for display (HH:MM:SS.mmm)
 */
function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * Format duration in human-readable form
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

/**
 * Get color for event category
 */
function getCategoryColor(category: EventCategory): (s: string) => string {
  switch (category) {
    case 'internal':
      return chalk.gray;
    case 'terraform':
      return chalk.magenta;
    case 'docker':
      return chalk.blue;
    case 'gcloud':
      return chalk.cyan;
    case 'file':
      return chalk.yellow;
    case 'gcs':
      return chalk.green;
    default:
      return chalk.white;
  }
}

/**
 * Get icon for event type
 */
function getEventIcon(eventType: string): string {
  if (eventType.includes('start')) return '>';
  if (eventType.includes('end')) return '<';
  if (eventType.includes('created') || eventType.includes('success')) return '+';
  if (eventType.includes('error') || eventType.includes('failed')) return '!';
  if (eventType.includes('destroyed')) return '-';
  return ' ';
}

/**
 * Format event for display
 */
function formatEvent(event: Event): string {
  const time = formatTime(event.timestamp);
  const categoryColor = getCategoryColor(event.category);
  const icon = getEventIcon(event.eventType);

  const category = categoryColor(`[${event.category.padEnd(9)}]`);
  const eventType = chalk.white(event.eventType.padEnd(20));

  // Build description based on event data
  let description = '';
  const data = event.data as Record<string, unknown>;

  if (event.terraformAddress) {
    description = chalk.cyan(event.terraformAddress);
  } else if (data.phase) {
    description = chalk.yellow(`phase=${data.phase}`);
  } else if (data.command) {
    const cmd = Array.isArray(data.command) ? data.command.join(' ') : data.command;
    description = chalk.gray(typeof cmd === 'string' ? cmd.slice(0, 50) : '');
  } else if (data.path) {
    description = chalk.gray(data.path as string);
  } else if (data.exitCode !== undefined) {
    const exitCode = data.exitCode as number;
    description = exitCode === 0 ? chalk.green(`exit=${exitCode}`) : chalk.red(`exit=${exitCode}`);
  } else if (data.durationMs !== undefined) {
    description = chalk.gray(formatDuration(data.durationMs as number));
  }

  return `${chalk.gray(time)} ${icon} ${category} ${eventType} ${description}`;
}

/**
 * Display session summary
 */
function displaySession(session: Session): void {
  const status = session.exitCode === null
    ? chalk.yellow('running')
    : session.exitCode === 0
      ? chalk.green('succeeded')
      : chalk.red(`failed (${session.exitCode})`);

  const duration = session.finishedAt
    ? formatDuration(session.finishedAt.getTime() - session.startedAt.getTime())
    : 'in progress';

  console.log('');
  console.log(chalk.bold(`  Session: ${session.id.slice(0, 8)}`));
  console.log(chalk.gray(`  Started:  ${session.startedAt.toLocaleString()}`));
  console.log(chalk.gray(`  Command:  ${session.command} ${session.args || ''}`));
  if (session.projectName) {
    console.log(chalk.gray(`  Project:  ${session.projectName}`));
  }
  console.log(chalk.gray(`  Status:   ${status} (${duration})`));
  console.log('');
}

/**
 * Display events as an ASCII table
 */
function displayEventsTable(events: Event[]): void {
  const columns: TableColumn[] = [
    { header: 'TIME', width: 12 },
    { header: 'PROJECT', width: 15 },
    { header: 'CATEGORY', width: 10 },
    { header: 'EVENT', width: 20 },
    { header: 'DETAILS', width: 35 },
  ];

  console.log('  ' + drawTableLine(columns));
  console.log('  ' + drawTableRow(columns, columns.map((c) => chalk.bold(c.header))));
  console.log('  ' + drawTableLine(columns));

  for (const event of events) {
    const time = formatTime(event.timestamp);
    const project = (event.project || '-').slice(0, 15);
    const categoryColor = getCategoryColor(event.category);
    const category = categoryColor(event.category);
    const eventType = event.eventType;

    // Build details based on event data
    const data = event.data as Record<string, unknown>;
    let details = '';

    if (event.terraformAddress) {
      details = event.terraformAddress;
    } else if (data.phase) {
      details = `phase=${data.phase}`;
    } else if (data.command) {
      const cmd = Array.isArray(data.command) ? data.command.join(' ') : data.command;
      details = typeof cmd === 'string' ? cmd.slice(0, 35) : '';
    } else if (data.path) {
      details = (data.path as string).slice(0, 35);
    } else if (data.exitCode !== undefined) {
      const exitCode = data.exitCode as number;
      details = exitCode === 0 ? chalk.green(`exit=0`) : chalk.red(`exit=${exitCode}`);
    } else if (data.durationMs !== undefined) {
      details = formatDuration(data.durationMs as number);
    } else if (data.question) {
      details = (data.question as string).slice(0, 35);
    } else if (data.choice) {
      details = `choice=${data.choice}`;
    } else if (data.count !== undefined) {
      details = `${data.count} resources`;
    }

    console.log('  ' + drawTableRow(columns, [time, project, category, eventType, details]));
  }

  console.log('  ' + drawTableLine(columns));
}

// =============================================================================
// events list - List recent sessions
// =============================================================================

const listCommand = new Command('list')
  .description('List recent deploy sessions')
  .option('-n, --limit <number>', 'Number of sessions to show', '10')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await initRegistry();

    const limit = parseInt(options.limit, 10);
    const sessions = await listSessions(limit);

    if (sessions.length === 0) {
      console.log(chalk.gray('\n  No deploy sessions found.\n'));
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(sessions, null, 2));
      return;
    }

    console.log(chalk.bold('\n  Recent Deploy Sessions\n'));

    const columns: TableColumn[] = [
      { header: 'ID', width: 8 },
      { header: 'STARTED', width: 20 },
      { header: 'DURATION', width: 10, align: 'right' },
      { header: 'STATUS', width: 8, align: 'center' },
      { header: 'PROJECT', width: 20 },
    ];

    console.log('  ' + drawTableLine(columns));
    console.log('  ' + drawTableRow(columns, columns.map((c) => chalk.bold(c.header))));
    console.log('  ' + drawTableLine(columns));

    for (const session of sessions) {
      const id = session.id.slice(0, 8);
      const started = session.startedAt.toLocaleString();
      const duration = session.finishedAt
        ? formatDuration(session.finishedAt.getTime() - session.startedAt.getTime())
        : 'running';
      const status =
        session.exitCode === null
          ? chalk.yellow('running')
          : session.exitCode === 0
            ? chalk.green('success')
            : chalk.red('failed');
      const project = (session.projectName || '-').slice(0, 20);

      console.log('  ' + drawTableRow(columns, [id, started, duration, status, project]));
    }

    console.log('  ' + drawTableLine(columns));
    console.log('');
  });

// =============================================================================
// events show - Show events for a session
// =============================================================================

const showCommand = new Command('show')
  .description('Show events for a deploy session')
  .argument('[session-id]', 'Session ID (uses latest if not specified)')
  .option('-c, --category <category>', 'Filter by category (internal, terraform, docker, gcloud, file, gcs)')
  .option('-r, --resource <name>', 'Filter by resource name')
  .option('-n, --limit <number>', 'Maximum events to show')
  .option('--json', 'Output as JSON')
  .action(async (sessionId, options) => {
    await initRegistry();

    // Get session
    let session: Session | null;
    if (sessionId) {
      session = await getSession(sessionId);
      if (!session) {
        // Try to find by prefix
        const sessions = await listSessions(100);
        session = sessions.find((s) => s.id.startsWith(sessionId)) || null;
      }
    } else {
      session = await getLatestSession();
    }

    if (!session) {
      console.log(chalk.red('\n  Session not found.\n'));
      return;
    }

    // Get events
    const filters: Record<string, unknown> = {};
    if (options.category) filters.category = options.category;
    if (options.resource) filters.resourceName = options.resource;
    if (options.limit) filters.limit = parseInt(options.limit, 10);

    const events = await getSessionEvents(session.id, filters as never);

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            session: {
              id: session.id,
              startedAt: session.startedAt,
              finishedAt: session.finishedAt,
              command: session.command,
              args: session.args,
              projectName: session.projectName,
              exitCode: session.exitCode,
            },
            events,
          },
          null,
          2
        )
      );
      return;
    }

    displaySession(session);

    if (events.length === 0) {
      console.log(chalk.gray('  No events found.\n'));
      return;
    }

    displayEventsTable(events);
    console.log('');
    console.log(chalk.gray(`  Total: ${events.length} events`));
    console.log('');
  });

// =============================================================================
// Main events command
// =============================================================================

export const eventsCommand = new Command('events')
  .description('View deploy event logs')
  .addCommand(listCommand)
  .addCommand(showCommand);

// Default action - show latest session events
eventsCommand.action(async () => {
  await initRegistry();

  const session = await getLatestSession();

  if (!session) {
    console.log(chalk.gray('\n  No deploy sessions found.'));
    console.log(chalk.gray('  Run `stacksolo deploy` to create a session.\n'));
    return;
  }

  const events = await getSessionEvents(session.id);

  displaySession(session);

  if (events.length === 0) {
    console.log(chalk.gray('  No events recorded.\n'));
    return;
  }

  displayEventsTable(events);
  console.log('');
  console.log(chalk.gray(`  Total: ${events.length} events`));
  console.log('');
});

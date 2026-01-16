#!/usr/bin/env npx tsx

/**
 * Track npm download statistics for @stacksolo/cli
 *
 * Usage:
 *   npx tsx scripts/track-downloads.ts          # Show current stats
 *   npx tsx scripts/track-downloads.ts --save   # Save to history file
 *   npx tsx scripts/track-downloads.ts --report # Generate full report
 */

import * as fs from 'fs';
import * as path from 'path';

const PACKAGE_NAME = '@stacksolo/cli';
const HISTORY_FILE = path.join(__dirname, '..', '.download-history.json');

interface DownloadData {
  downloads: number;
  start: string;
  end: string;
  package: string;
}

interface HistoryEntry {
  date: string;
  weekly: number;
  monthly: number;
  total?: number;
}

interface History {
  package: string;
  entries: HistoryEntry[];
}

async function fetchDownloads(period: 'last-day' | 'last-week' | 'last-month'): Promise<DownloadData> {
  const url = `https://api.npmjs.org/downloads/point/${period}/${PACKAGE_NAME}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch downloads: ${response.statusText}`);
  }
  return response.json();
}

async function fetchTotalDownloads(): Promise<number> {
  // Get total downloads since package creation (2024-01-01 as approximation)
  const url = `https://api.npmjs.org/downloads/point/2024-01-01:2100-01-01/${PACKAGE_NAME}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return 0;
    const data = await response.json();
    return data.downloads || 0;
  } catch {
    return 0;
  }
}

async function getPackageInfo(): Promise<{ version: string; publishDate: string }> {
  const url = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch package info: ${response.statusText}`);
  }
  const data = await response.json();
  return {
    version: data.version,
    publishDate: data.time || 'unknown',
  };
}

function loadHistory(): History {
  if (fs.existsSync(HISTORY_FILE)) {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
  }
  return { package: PACKAGE_NAME, entries: [] };
}

function saveHistory(history: History): void {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function calculateGrowth(entries: HistoryEntry[]): string {
  if (entries.length < 2) return 'N/A';
  const latest = entries[entries.length - 1].weekly;
  const previous = entries[entries.length - 2].weekly;
  if (previous === 0) return '+100%';
  const growth = ((latest - previous) / previous) * 100;
  return `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`;
}

async function main() {
  const args = process.argv.slice(2);
  const shouldSave = args.includes('--save');
  const showReport = args.includes('--report');

  console.log(`\n📦 npm Download Stats for ${PACKAGE_NAME}\n`);
  console.log('─'.repeat(50));

  try {
    // Fetch current stats
    const [daily, weekly, monthly, total, packageInfo] = await Promise.all([
      fetchDownloads('last-day'),
      fetchDownloads('last-week'),
      fetchDownloads('last-month'),
      fetchTotalDownloads(),
      getPackageInfo(),
    ]);

    // Display current stats
    console.log(`\n📊 Current Statistics (${new Date().toISOString().split('T')[0]})\n`);
    console.log(`   Version:     ${packageInfo.version}`);
    console.log(`   Daily:       ${formatNumber(daily.downloads)} downloads`);
    console.log(`   Weekly:      ${formatNumber(weekly.downloads)} downloads`);
    console.log(`   Monthly:     ${formatNumber(monthly.downloads)} downloads`);
    console.log(`   All-time:    ${formatNumber(total)} downloads`);

    // Load and update history
    const history = loadHistory();

    if (shouldSave) {
      const today = new Date().toISOString().split('T')[0];

      // Check if we already have an entry for today
      const existingIndex = history.entries.findIndex(e => e.date === today);
      const newEntry: HistoryEntry = {
        date: today,
        weekly: weekly.downloads,
        monthly: monthly.downloads,
        total,
      };

      if (existingIndex >= 0) {
        history.entries[existingIndex] = newEntry;
        console.log(`\n✅ Updated entry for ${today}`);
      } else {
        history.entries.push(newEntry);
        console.log(`\n✅ Saved new entry for ${today}`);
      }

      saveHistory(history);
    }

    // Show growth if we have history
    if (history.entries.length >= 2) {
      console.log(`\n📈 Week-over-week growth: ${calculateGrowth(history.entries)}`);
    }

    // Show full report if requested
    if (showReport && history.entries.length > 0) {
      console.log(`\n📋 Download History\n`);
      console.log('   Date         Weekly      Monthly     Total');
      console.log('   ' + '─'.repeat(45));

      for (const entry of history.entries.slice(-10)) { // Last 10 entries
        console.log(
          `   ${entry.date}   ${formatNumber(entry.weekly).padStart(8)}   ${formatNumber(entry.monthly).padStart(8)}   ${entry.total ? formatNumber(entry.total).padStart(8) : 'N/A'.padStart(8)}`
        );
      }
    }

    // Show links
    console.log(`\n🔗 Links\n`);
    console.log(`   npm:       https://www.npmjs.com/package/${PACKAGE_NAME}`);
    console.log(`   npm-stat:  https://npm-stat.com/charts.html?package=${encodeURIComponent(PACKAGE_NAME)}`);
    console.log(`   bundlephobia: https://bundlephobia.com/package/${PACKAGE_NAME}`);

    console.log('\n' + '─'.repeat(50));
    console.log(`\nTip: Run with --save to track history, --report for full report\n`);

  } catch (error) {
    console.error('Error fetching download stats:', error);
    process.exit(1);
  }
}

main();

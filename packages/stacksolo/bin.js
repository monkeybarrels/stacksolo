#!/usr/bin/env node

/**
 * stacksolo - thin wrapper that delegates to @stacksolo/cli
 *
 * This allows users to run `npx stacksolo` instead of `npx @stacksolo/cli`
 */

// Simply re-export the CLI - this runs it directly
import '@stacksolo/cli';

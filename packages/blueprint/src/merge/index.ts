/**
 * @stacksolo/blueprint merge module
 * Merge multiple StackSolo projects into a single deployable stack
 */

// Merger
export {
  mergeConfigs,
  type MergeMetadata,
  type MergeOptions,
  type MergeInput,
  type MergeResult,
} from './merger.js';

// Conflict detection
export {
  detectConflicts,
  formatConflicts,
  type Conflict,
  type ConflictResult,
} from './conflicts.js';

// Naming utilities
export {
  prefixResourceName,
  prefixBucketName,
  prefixRoutePath,
  relativeSourceDir,
  extractOriginalName,
  isPrefixed,
} from './naming.js';

// Validation
export {
  validateMergedConfig,
  validateCrossProjectReferences,
  type MergeValidationResult,
} from './validation.js';

/**
 * YAML serialization utilities for K8s manifests
 * Generates YAML strings from K8s resource objects
 */

type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

/**
 * Serialize a value to YAML string with proper indentation
 */
export function toYaml(obj: Record<string, YamlValue>, indent = 0): string {
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;

    if (value === null) {
      lines.push(`${prefix}${key}: null`);
    } else if (typeof value === 'string') {
      lines.push(`${prefix}${key}: ${formatYamlString(value)}`);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      lines.push(`${prefix}${key}: ${value}`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${prefix}${key}: []`);
      } else {
        lines.push(`${prefix}${key}:`);
        for (const item of value) {
          if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
            const itemLines = toYaml(item as Record<string, YamlValue>, 0).split('\n');
            lines.push(`${prefix}- ${itemLines[0]}`);
            for (let i = 1; i < itemLines.length; i++) {
              if (itemLines[i].trim()) {
                lines.push(`${prefix}  ${itemLines[i]}`);
              }
            }
          } else {
            lines.push(`${prefix}- ${formatYamlValue(item)}`);
          }
        }
      }
    } else if (typeof value === 'object') {
      if (Object.keys(value).length === 0) {
        lines.push(`${prefix}${key}: {}`);
      } else {
        lines.push(`${prefix}${key}:`);
        lines.push(toYaml(value as Record<string, YamlValue>, indent + 1));
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format a string value for YAML, adding quotes if needed
 */
function formatYamlString(value: string): string {
  // Check if the string needs quoting
  const needsQuotes =
    value === '' ||
    value.includes(':') ||
    value.includes('#') ||
    value.includes('\n') ||
    value.includes('"') ||
    value.includes("'") ||
    value.startsWith(' ') ||
    value.endsWith(' ') ||
    value.startsWith('*') ||
    value.startsWith('&') ||
    value.startsWith('!') ||
    value.startsWith('{') ||
    value.startsWith('[') ||
    value.startsWith('@') ||
    value.startsWith('`') ||
    /^(true|false|yes|no|on|off|null|~)$/i.test(value) ||
    /^[0-9]/.test(value) ||
    /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value);

  if (needsQuotes) {
    // Use double quotes and escape internal quotes
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }

  return value;
}

/**
 * Format any value for inline YAML
 */
function formatYamlValue(value: YamlValue): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return formatYamlString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return `[${value.map(formatYamlValue).join(', ')}]`;
  }
  return String(value);
}

/**
 * Generate a YAML document with header comment
 */
export function generateYamlDocument(
  resource: Record<string, YamlValue>,
  comment?: string
): string {
  const lines: string[] = [];

  if (comment) {
    for (const line of comment.split('\n')) {
      lines.push(`# ${line}`);
    }
    lines.push('');
  }

  lines.push(toYaml(resource));

  return lines.join('\n') + '\n';
}

/**
 * Combine multiple YAML documents into a single file
 */
export function combineYamlDocuments(documents: string[]): string {
  return documents.join('\n---\n');
}

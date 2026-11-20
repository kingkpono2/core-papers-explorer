/** One metric from a `Server-Timing` header, such as `core;dur=412.3;desc="CORE API"`. */
export interface ServerTimingMetric {
  readonly name: string;
  readonly durationMs: number | null;
  readonly description: string | null;
}

const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * Parses a `Server-Timing` header (W3C Server Timing). Metrics are separated by commas and their
 * parameters by semicolons, outside quoted strings; the first `dur` and `desc` of a metric count.
 * Malformed metrics are skipped rather than failing the rest, and a missing header gives `[]`.
 */
export function parseServerTiming(header: string | null | undefined): ServerTimingMetric[] {
  if (!header) {
    return [];
  }
  return splitOutsideQuotes(header, ',').flatMap((metric) => {
    const [name, ...params] = splitOutsideQuotes(metric, ';').map((part) => part.trim());
    if (!TOKEN.test(name)) {
      return [];
    }
    let durationMs: number | null = null;
    let description: string | null = null;
    let seenDuration = false;
    let seenDescription = false;
    for (const param of params) {
      const equals = param.indexOf('=');
      const key = (equals === -1 ? param : param.slice(0, equals)).trim().toLowerCase();
      const value = equals === -1 ? '' : unquote(param.slice(equals + 1).trim());
      if (key === 'dur' && !seenDuration) {
        seenDuration = true;
        const ms = Number(value);
        durationMs = value !== '' && Number.isFinite(ms) && ms >= 0 ? ms : null;
      } else if (key === 'desc' && !seenDescription) {
        seenDescription = true;
        description = value;
      }
    }
    return [{ name, durationMs, description }];
  });
}

/** The duration of the first metric with this name, compared case-insensitively. */
export function metricDuration(
  metrics: readonly ServerTimingMetric[],
  name: string,
): number | null {
  const wanted = name.toLowerCase();
  return metrics.find((metric) => metric.name.toLowerCase() === wanted)?.durationMs ?? null;
}

function splitOutsideQuotes(text: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === '\\' && i + 1 < text.length) {
      current += char + text[++i];
    } else if (char === '"') {
      quoted = !quoted;
      current += char;
    } else if (char === separator && !quoted) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

function unquote(value: string): string {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1).replace(/\\(.)/g, '$1')
    : value;
}

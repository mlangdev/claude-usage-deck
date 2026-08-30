'use strict';

/**
 * Parses the free-text `result` field returned by:
 *   claude -p "/usage" --output-format json
 *
 * Typical lines look like:
 *   Current session: 10% used · resets Aug 30, 4:10am (America/Sao_Paulo)
 *   Current week (all models): 4% used · resets Sep 4, 6am (America/Sao_Paulo)
 *
 * The exact wording is not a documented/stable API, so parsing is
 * intentionally tolerant: any line matching "<label>: N% used · resets <text>"
 * is captured, whatever the label.
 */
const LINE_RE = /^(.+?):\s*(\d{1,3})%\s*used\s*(?:[·\-]\s*resets\s*(.+))?$/i;

function parseUsageOutput(resultText) {
  if (typeof resultText !== 'string' || resultText.length === 0) {
    return [];
  }

  const metrics = [];
  for (const rawLine of resultText.split('\n')) {
    const line = rawLine.trim();
    const match = line.match(LINE_RE);
    if (!match) continue;

    metrics.push({
      label: match[1].trim(),
      percentUsed: Math.min(100, parseInt(match[2], 10)),
      resetsAt: match[3] ? match[3].trim() : null,
    });
  }
  return metrics;
}

module.exports = { parseUsageOutput };

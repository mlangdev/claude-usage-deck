'use strict';

/**
 * Parses the free-text `result` field returned by:
 *   claude -p "/usage" --output-format json
 *
 * Typical lines look like:
 *   Current session: 10% used · resets Aug 30, 4:10am (America/Sao_Paulo)
 *   Current week (all models): 4% used · resets Sep 4, 6am (America/Sao_Paulo)
 *   Last 24h · 55 requests · 4 sessions
 *   Last 7d · 610 requests · 12 sessions
 *
 * None of this is a documented/stable API, so parsing is intentionally
 * tolerant: unmatched lines are just ignored, and the raw text is always
 * kept around so callers can fall back to it.
 */
const METRIC_LINE_RE = /^(.+?):\s*(\d{1,3})%\s*used\s*(?:[·\-]\s*resets\s*(.+))?$/i;
const STATS_LINE_RE = /^Last\s+(\S+)\s*[·\-]\s*(\d+)\s*requests?\s*[·\-]\s*(\d+)\s*sessions?$/i;

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/**
 * Melhor esforco para transformar "Aug 30, 4:09am (America/Sao_Paulo)" numa Date.
 * Assume que a maquina local esta no mesmo fuso horario mostrado pelo /usage
 * (nao da pra confiar no nome do fuso, o Date do JS nao entende IANA tz aqui).
 * Retorna null se o texto nao bater com o formato esperado.
 */
function estimateResetDate(resetsAtText, now = new Date()) {
  if (!resetsAtText) return null;
  const m = resetsAtText.match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) return null;

  const month = MONTHS[m[1].toLowerCase()];
  if (month === undefined) return null;

  const day = parseInt(m[2], 10);
  let hour = parseInt(m[3], 10) % 12;
  if (m[5].toLowerCase() === 'pm') hour += 12;
  const minute = m[4] ? parseInt(m[4], 10) : 0;

  let candidate = new Date(now.getFullYear(), month, day, hour, minute, 0, 0);
  // se a data cair mais de 1 dia no passado, e porque virou o ano
  if (candidate.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
    candidate = new Date(now.getFullYear() + 1, month, day, hour, minute, 0, 0);
  }
  return candidate;
}

function parseUsageOutput(resultText, now = new Date()) {
  const metrics = [];
  const stats = [];

  if (typeof resultText !== 'string' || resultText.length === 0) {
    return { metrics, stats };
  }

  for (const rawLine of resultText.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const metricMatch = line.match(METRIC_LINE_RE);
    if (metricMatch) {
      const resetsAt = metricMatch[3] ? metricMatch[3].trim() : null;
      const resetsAtDate = estimateResetDate(resetsAt, now);
      metrics.push({
        label: metricMatch[1].trim(),
        percentUsed: Math.min(100, parseInt(metricMatch[2], 10)),
        resetsAt,
        resetsAtIso: resetsAtDate ? resetsAtDate.toISOString() : null,
      });
      continue;
    }

    const statsMatch = line.match(STATS_LINE_RE);
    if (statsMatch) {
      stats.push({
        window: statsMatch[1].trim(),
        requests: parseInt(statsMatch[2], 10),
        sessions: parseInt(statsMatch[3], 10),
      });
    }
  }

  return { metrics, stats };
}

module.exports = { parseUsageOutput, estimateResetDate };

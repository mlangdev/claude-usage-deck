'use strict';

const http = require('http');
const https = require('https');
const { log, Plugins, Actions } = require('./utils/plugin');

const plugin = new Plugins();

const METRIC_LABELS = {
  session: 'SESSAO',
  week: 'SEMANA',
};

const DEFAULT_POLLER_URL = 'http://127.0.0.1:4756/usage';
const ALERT_THRESHOLD = 90;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, { timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400 && res.statusCode !== 502) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function withForcedRefresh(pollerUrl) {
  return `${pollerUrl}${pollerUrl.includes('?') ? '&' : '?'}refresh=1`;
}

// Paleta inspirada na identidade visual do Claude (tons terracota/creme sobre fundo escuro)
const CLAUDE = {
  bg: '#1f1e1c',
  track: '#3a372f',
  cream: '#f4f0e6',
  mutedCream: '#b8b2a3',
  normal: '#da7756',
  warning: '#d8a13c',
  critical: '#c2483a',
};

function colorForPercent(percent) {
  if (percent >= ALERT_THRESHOLD) return CLAUDE.critical;
  if (percent >= 70) return CLAUDE.warning;
  return CLAUDE.normal;
}

function sparkle(cx, cy, r, color) {
  // marca decorativa simples (nao e o logo da Anthropic, so um acento visual)
  const rays = [0, 45, 90, 135].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    const x1 = cx - r * Math.cos(rad);
    const y1 = cy - r * Math.sin(rad);
    const x2 = cx + r * Math.cos(rad);
    const y2 = cy + r * Math.sin(rad);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
  }).join('');
  return `<g opacity="0.55">${rays}</g>`;
}

function cardBase(size) {
  return `<rect x="0" y="0" width="${size}" height="${size}" rx="22" fill="${CLAUDE.bg}"/>${sparkle(size - 18, 18, 7, CLAUDE.normal)}`;
}

function svgDataUri(svg) {
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

function buildGaugeSvg(percent, label) {
  const p = Math.max(0, Math.min(100, percent));
  const size = 144;
  const cx = size / 2;
  const cy = 62;
  const r = 46;
  const strokeWidth = 11;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - p / 100);
  const ringColor = colorForPercent(p);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`
    + cardBase(size)
    + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${CLAUDE.track}" stroke-width="${strokeWidth}"/>`
    + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ringColor}" stroke-width="${strokeWidth}" `
    + `stroke-linecap="round" stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${dashOffset.toFixed(1)}" `
    + `transform="rotate(-90 ${cx} ${cy})"/>`
    + `<text x="${cx}" y="${cy + 11}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="32" fill="${CLAUDE.cream}">${p}%</text>`
    + `<text x="${cx}" y="132" text-anchor="middle" font-family="Arial, sans-serif" font-weight="600" font-size="16" letter-spacing="1.5" fill="${CLAUDE.mutedCream}">${label}</text>`
    + `</svg>`;
}

function buildCountdownSvg(timeText, label) {
  const size = 144;
  const cx = size / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`
    + cardBase(size)
    + `<text x="${cx}" y="72" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="27" fill="${CLAUDE.cream}">${timeText}</text>`
    + `<text x="${cx}" y="96" text-anchor="middle" font-family="Arial, sans-serif" font-weight="600" font-size="11" letter-spacing="1" fill="${CLAUDE.mutedCream}">ATE RESETAR</text>`
    + `<text x="${cx}" y="132" text-anchor="middle" font-family="Arial, sans-serif" font-weight="600" font-size="16" letter-spacing="1.5" fill="${CLAUDE.normal}">${label}</text>`
    + `</svg>`;
}

function buildStatsSvg(requests, sessions, windowLabel) {
  const size = 144;
  const cx = size / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`
    + cardBase(size)
    + `<text x="${cx}" y="66" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="34" fill="${CLAUDE.cream}">${requests}</text>`
    + `<text x="${cx}" y="84" text-anchor="middle" font-family="Arial, sans-serif" font-weight="600" font-size="11" letter-spacing="1.5" fill="${CLAUDE.mutedCream}">REQUESTS</text>`
    + `<text x="${cx}" y="110" text-anchor="middle" font-family="Arial, sans-serif" font-weight="600" font-size="17" fill="${CLAUDE.normal}">${sessions} sessoes</text>`
    + `<text x="${cx}" y="132" text-anchor="middle" font-family="Arial, sans-serif" font-weight="600" font-size="13" letter-spacing="1" fill="${CLAUDE.mutedCream}">ULTIMAS ${windowLabel.toUpperCase()}</text>`
    + `</svg>`;
}

function pickMetric(metrics, metricKey) {
  if (!Array.isArray(metrics) || metrics.length === 0) return null;
  return metrics.find((m) => (m.label || '').toLowerCase().includes(metricKey)) || metrics[0];
}

function pickStats(stats, windowKey) {
  if (!Array.isArray(stats) || stats.length === 0) return null;
  return stats.find((s) => (s.window || '').toLowerCase() === windowKey.toLowerCase()) || stats[0];
}

function formatCountdown(ms) {
  if (!Number.isFinite(ms)) return '--';
  if (ms <= 0) return 'renovou!';
  const totalMinutes = Math.round(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Fabrica generica: cuida do ciclo de polling (start/stop por contexto de tecla)
 * comum as tres acoes do plugin, deixando cada uma so definir como renderizar.
 */
function createPoller(defaultSettings, render) {
  const timers = {};

  async function update(context, settings) {
    const pollerUrl = settings.pollerUrl || defaultSettings.pollerUrl;
    try {
      const body = await fetchJson(pollerUrl);
      render(context, settings, body);
    } catch (err) {
      log.error('falha ao consultar poller', pollerUrl, err && err.message);
      render(context, settings, null, err);
    }
  }

  function stop(context) {
    if (timers[context]) {
      clearInterval(timers[context]);
      delete timers[context];
    }
  }

  function start(context, actionInstance) {
    stop(context);
    const settings = Object.assign({}, defaultSettings, actionInstance.data[context]);
    const intervalMs = Math.max(5, Number(settings.refreshSeconds) || defaultSettings.refreshSeconds) * 1000;
    update(context, settings);
    timers[context] = setInterval(() => update(context, settings), intervalMs);
  }

  function refreshNow(context, settings) {
    update(context, Object.assign({}, settings, { pollerUrl: withForcedRefresh(settings.pollerUrl || defaultSettings.pollerUrl) }));
  }

  return { start, stop, refreshNow };
}

// ---- Acao 1: gauge de consumo (sessao/semana) ----

const USAGE_DEFAULTS = { metric: 'week', pollerUrl: DEFAULT_POLLER_URL, refreshSeconds: 20 };
const lastPercentByContext = {};

const usagePoller = createPoller(USAGE_DEFAULTS, (context, settings, body, err) => {
  const metricKey = (settings.metric || USAGE_DEFAULTS.metric).toLowerCase();
  const label = METRIC_LABELS[metricKey] || metricKey.toUpperCase();

  if (err || !body) {
    plugin.setImage(context, svgDataUri(buildGaugeSvg(0, 'ERRO')));
    return;
  }

  const metric = pickMetric(body.metrics, metricKey);
  if (!metric) {
    plugin.setImage(context, svgDataUri(buildGaugeSvg(0, 'N/D')));
    if (body.error) log.error('poller reportou erro:', body.error);
    return;
  }

  plugin.setImage(context, svgDataUri(buildGaugeSvg(metric.percentUsed, label)));

  const previous = lastPercentByContext[context] || 0;
  if (metric.percentUsed >= ALERT_THRESHOLD && previous < ALERT_THRESHOLD) {
    plugin.showAlert(context);
  }
  lastPercentByContext[context] = metric.percentUsed;
});

plugin.usage = new Actions({
  default: USAGE_DEFAULTS,
  _willAppear({ context }) {
    plugin.setTitle(context, '');
    usagePoller.start(context, plugin.usage);
  },
  _willDisappear({ context }) {
    usagePoller.stop(context);
    delete lastPercentByContext[context];
  },
  _didReceiveSettings({ context }) {
    usagePoller.start(context, plugin.usage);
  },
  keyUp({ context }) {
    usagePoller.refreshNow(context, Object.assign({}, USAGE_DEFAULTS, plugin.usage.data[context]));
  },
});

// ---- Acao 2: contagem regressiva ate o reset ----

const COUNTDOWN_DEFAULTS = { metric: 'week', pollerUrl: DEFAULT_POLLER_URL, refreshSeconds: 30 };

const countdownPoller = createPoller(COUNTDOWN_DEFAULTS, (context, settings, body, err) => {
  const metricKey = (settings.metric || COUNTDOWN_DEFAULTS.metric).toLowerCase();
  const label = METRIC_LABELS[metricKey] || metricKey.toUpperCase();

  if (err || !body) {
    plugin.setImage(context, svgDataUri(buildCountdownSvg('ERRO', label)));
    return;
  }

  const metric = pickMetric(body.metrics, metricKey);
  if (!metric || !metric.resetsAtIso) {
    plugin.setImage(context, svgDataUri(buildCountdownSvg('N/D', label)));
    return;
  }

  const msRemaining = new Date(metric.resetsAtIso).getTime() - Date.now();
  plugin.setImage(context, svgDataUri(buildCountdownSvg(formatCountdown(msRemaining), label)));
});

plugin.countdown = new Actions({
  default: COUNTDOWN_DEFAULTS,
  _willAppear({ context }) {
    plugin.setTitle(context, '');
    countdownPoller.start(context, plugin.countdown);
  },
  _willDisappear({ context }) {
    countdownPoller.stop(context);
  },
  _didReceiveSettings({ context }) {
    countdownPoller.start(context, plugin.countdown);
  },
  keyUp({ context }) {
    countdownPoller.refreshNow(context, Object.assign({}, COUNTDOWN_DEFAULTS, plugin.countdown.data[context]));
  },
});

// ---- Acao 3: estatisticas (requests/sessoes) ----

const STATS_DEFAULTS = { window: '24h', pollerUrl: DEFAULT_POLLER_URL, refreshSeconds: 60 };

const statsPoller = createPoller(STATS_DEFAULTS, (context, settings, body, err) => {
  const windowKey = settings.window || STATS_DEFAULTS.window;

  if (err || !body) {
    plugin.setImage(context, svgDataUri(buildStatsSvg('-', '-', windowKey)));
    return;
  }

  const stat = pickStats(body.stats, windowKey);
  if (!stat) {
    plugin.setImage(context, svgDataUri(buildStatsSvg('-', '-', windowKey)));
    if (body.error) log.error('poller reportou erro:', body.error);
    return;
  }

  plugin.setImage(context, svgDataUri(buildStatsSvg(stat.requests, stat.sessions, stat.window)));
});

plugin.stats = new Actions({
  default: STATS_DEFAULTS,
  _willAppear({ context }) {
    plugin.setTitle(context, '');
    statsPoller.start(context, plugin.stats);
  },
  _willDisappear({ context }) {
    statsPoller.stop(context);
  },
  _didReceiveSettings({ context }) {
    statsPoller.start(context, plugin.stats);
  },
  keyUp({ context }) {
    statsPoller.refreshNow(context, Object.assign({}, STATS_DEFAULTS, plugin.stats.data[context]));
  },
});

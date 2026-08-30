'use strict';

const http = require('http');
const https = require('https');
const { log, Plugins, Actions } = require('./utils/plugin');

const plugin = new Plugins();

const METRIC_LABELS = {
  session: 'SESSAO',
  week: 'SEMANA',
};

const DEFAULT_SETTINGS = {
  metric: 'week',
  pollerUrl: 'http://127.0.0.1:4756/usage',
  refreshSeconds: 20,
};

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

function colorForPercent(percent) {
  if (percent >= 90) return '#dc2626';
  if (percent >= 70) return '#f59e0b';
  return '#16a34a';
}

function buildBarSvg(percent) {
  const p = Math.max(0, Math.min(100, percent));
  const w = 144;
  const h = 144;
  const trackTop = 16;
  const trackHeight = h - trackTop - 16;
  const barHeight = Math.round(trackHeight * (p / 100));
  const barColor = colorForPercent(p);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`
    + `<rect x="0" y="0" width="${w}" height="${h}" fill="#20242e"/>`
    + `<rect x="14" y="${trackTop}" width="${w - 28}" height="${trackHeight}" rx="8" fill="#2f3542"/>`
    + `<rect x="14" y="${trackTop + trackHeight - barHeight}" width="${w - 28}" height="${barHeight}" rx="8" fill="${barColor}"/>`
    + `</svg>`;
}

function svgDataUri(svg) {
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

function pickMetric(metrics, metricKey) {
  if (!Array.isArray(metrics) || metrics.length === 0) return null;
  const match = metrics.find((m) => (m.label || '').toLowerCase().includes(metricKey));
  return match || metrics[0];
}

async function updateKey(context, settings) {
  const metricKey = (settings.metric || DEFAULT_SETTINGS.metric).toLowerCase();
  const pollerUrl = settings.pollerUrl || DEFAULT_SETTINGS.pollerUrl;

  try {
    const body = await fetchJson(pollerUrl);
    const metric = pickMetric(body.metrics, metricKey);

    if (!metric) {
      plugin.setTitle(context, 'N/D');
      plugin.setImage(context, svgDataUri(buildBarSvg(0)));
      if (body.error) log.error('poller reportou erro:', body.error);
      return;
    }

    const label = METRIC_LABELS[metricKey] || metricKey.toUpperCase();
    plugin.setTitle(context, `${label}\n${metric.percentUsed}%`);
    plugin.setImage(context, svgDataUri(buildBarSvg(metric.percentUsed)));
  } catch (err) {
    log.error('falha ao consultar poller', pollerUrl, err && err.message);
    plugin.setTitle(context, 'ERRO');
    plugin.setImage(context, svgDataUri(buildBarSvg(0)));
  }
}

const timers = {};

function startPolling(context, actionInstance) {
  stopPolling(context);
  const settings = Object.assign({}, DEFAULT_SETTINGS, actionInstance.data[context]);
  const intervalMs = Math.max(5, Number(settings.refreshSeconds) || DEFAULT_SETTINGS.refreshSeconds) * 1000;

  updateKey(context, settings);
  timers[context] = setInterval(() => updateKey(context, settings), intervalMs);
}

function stopPolling(context) {
  if (timers[context]) {
    clearInterval(timers[context]);
    delete timers[context];
  }
}

plugin.usage = new Actions({
  default: DEFAULT_SETTINGS,

  _willAppear({ context }) {
    startPolling(context, plugin.usage);
  },

  _willDisappear({ context }) {
    stopPolling(context);
  },

  _didReceiveSettings({ context }) {
    startPolling(context, plugin.usage);
  },

  keyUp({ context }) {
    const settings = Object.assign({}, DEFAULT_SETTINGS, plugin.usage.data[context]);
    const pollerUrl = `${settings.pollerUrl || DEFAULT_SETTINGS.pollerUrl}${(settings.pollerUrl || '').includes('?') ? '&' : '?'}refresh=1`;
    updateKey(context, Object.assign({}, settings, { pollerUrl }));
  },
});

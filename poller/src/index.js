'use strict';

const http = require('http');
const { exec } = require('child_process');
const { parseUsageOutput } = require('./parseUsage');

const PORT = parseInt(process.env.PORT || '4756', 10);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '300000', 10); // 5 min
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const EXEC_TIMEOUT_MS = 30000;

const state = {
  updatedAt: null,
  metrics: [],
  stats: [],
  raw: null,
  error: null,
  refreshing: false,
};

function refresh() {
  if (state.refreshing) return Promise.resolve(state);
  state.refreshing = true;

  const command = `${CLAUDE_BIN} -p "/usage" --output-format json`;

  return new Promise((resolve) => {
    exec(command, { timeout: EXEC_TIMEOUT_MS, windowsHide: true }, (err, stdout, stderr) => {
      state.refreshing = false;

      if (err) {
        state.error = `Falha ao executar claude CLI: ${err.message}${stderr ? ` | stderr: ${stderr}` : ''}`;
        console.error('[claude-usage-deck]', state.error);
        return resolve(state);
      }

      try {
        const parsed = JSON.parse(stdout);
        if (parsed.is_error) {
          state.error = `claude CLI retornou erro: ${parsed.result || 'desconhecido'}`;
          console.error('[claude-usage-deck]', state.error);
          return resolve(state);
        }

        const { metrics, stats } = parseUsageOutput(parsed.result || '');
        state.metrics = metrics;
        state.stats = stats;
        state.raw = parsed.result || null;
        state.updatedAt = new Date().toISOString();
        state.error = null;

        if (state.metrics.length === 0) {
          state.error = 'Não foi possível reconhecer o formato da saída do /usage (pode ter mudado). Veja "raw" para o texto original.';
          console.warn('[claude-usage-deck]', state.error);
        } else {
          console.log('[claude-usage-deck] atualizado:', state.metrics.map((m) => `${m.label}=${m.percentUsed}%`).join(', '));
        }
      } catch (parseErr) {
        state.error = `Falha ao interpretar JSON do claude CLI: ${parseErr.message}`;
        console.error('[claude-usage-deck]', state.error);
      }

      resolve(state);
    });
  });
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/health') {
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === '/usage') {
    if (url.searchParams.get('refresh') === '1') {
      await refresh();
    }
    return sendJson(res, state.error && state.metrics.length === 0 ? 502 : 200, state);
  }

  sendJson(res, 404, { error: 'not found', routes: ['/usage', '/health'] });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[claude-usage-deck] poller ouvindo em http://127.0.0.1:${PORT}/usage`);
  console.log(`[claude-usage-deck] atualizando a cada ${Math.round(POLL_INTERVAL_MS / 1000)}s via "${CLAUDE_BIN} -p /usage"`);
  refresh();
  setInterval(refresh, POLL_INTERVAL_MS);
});

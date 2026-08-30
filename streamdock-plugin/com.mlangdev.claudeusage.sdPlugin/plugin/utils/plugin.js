'use strict';
// Camada minima do protocolo StreamDock (WebSocket), adaptada do template oficial
// https://github.com/MiraboxSpace/StreamDock-Plugin-SDK (SDNodeJsSDKV2).
// Documentacao do protocolo: https://sdk.key123.vip/en/guide/events-received.html
//                             https://sdk.key123.vip/en/guide/events-sent.html

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const logDir = path.join(__dirname, '..', 'log');
try { fs.mkdirSync(logDir, { recursive: true }); } catch (_) {}

function logLine(level, ...args) {
  const now = new Date();
  const file = path.join(logDir, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.log`);
  const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  try {
    fs.appendFileSync(file, `[${now.toISOString()}] [${level}] ${text}\n`);
  } catch (_) {
    // se nem o log funcionar, nao ha muito a fazer aqui
  }
}

const log = {
  info: (...args) => logLine('INFO', ...args),
  error: (...args) => logLine('ERROR', ...args),
};

process.on('uncaughtException', (error) => log.error('uncaughtException', error && error.stack || error));
process.on('unhandledRejection', (reason) => log.error('unhandledRejection', reason));

class Plugins {
  static language = (() => {
    try { return JSON.parse(process.argv[9]).application.language; } catch (_) { return 'en'; }
  })();
  static globalSettings = {};
  getGlobalSettingsFlag = true;

  constructor() {
    if (Plugins.instance) return Plugins.instance;

    this.ws = new WebSocket('ws://127.0.0.1:' + process.argv[3]);
    this.ws.on('open', () => this.ws.send(JSON.stringify({ uuid: process.argv[5], event: process.argv[7] })));
    this.ws.on('close', () => process.exit());
    this.ws.on('error', (err) => log.error('websocket error', err && err.message));
    this.ws.on('message', (e) => {
      if (this.getGlobalSettingsFlag) {
        this.getGlobalSettingsFlag = false;
        this.getGlobalSettings();
      }

      let data;
      try {
        data = JSON.parse(e.toString());
      } catch (err) {
        log.error('mensagem invalida do StreamDock', err && err.message);
        return;
      }

      const action = data.action?.split('.').pop();
      try {
        this[action]?.[data.event]?.(data);
        if (data.event === 'didReceiveGlobalSettings') {
          Plugins.globalSettings = data.payload.settings;
        }
        this[data.event]?.(data);
      } catch (err) {
        log.error('erro processando evento', data.event, err && err.stack || err);
      }
    });

    Plugins.instance = this;
  }

  setGlobalSettings(payload) {
    Plugins.globalSettings = payload;
    this.ws.send(JSON.stringify({ event: 'setGlobalSettings', context: process.argv[5], payload }));
  }

  getGlobalSettings() {
    this.ws.send(JSON.stringify({ event: 'getGlobalSettings', context: process.argv[5] }));
  }

  setTitle(context, title) {
    this.ws.send(JSON.stringify({ event: 'setTitle', context, payload: { target: 0, title: String(title ?? '') } }));
  }

  setImage(context, url) {
    this.ws.send(JSON.stringify({ event: 'setImage', context, payload: { target: 0, image: url } }));
  }

  setSettings(context, payload) {
    this.ws.send(JSON.stringify({ event: 'setSettings', context, payload }));
  }

  showAlert(context) {
    this.ws.send(JSON.stringify({ event: 'showAlert', context }));
  }

  showOk(context) {
    this.ws.send(JSON.stringify({ event: 'showOk', context }));
  }

  sendToPropertyInspector(payload) {
    this.ws.send(JSON.stringify({
      action: Actions.currentAction,
      context: Actions.currentContext,
      payload,
      event: 'sendToPropertyInspector',
    }));
  }
}

class Actions {
  static currentAction = null;
  static currentContext = null;
  static actions = {};

  constructor(data) {
    this.data = {};
    this.default = {};
    Object.assign(this, data);
  }

  propertyInspectorDidAppear(data) {
    Actions.currentAction = data.action;
    Actions.currentContext = data.context;
    this._propertyInspectorDidAppear?.(data);
  }

  willAppear(data) {
    Actions.actions[data.context] = data.action;
    const { context, payload: { settings } } = data;
    this.data[context] = Object.assign({}, this.default, settings);
    this._willAppear?.(data);
  }

  didReceiveSettings(data) {
    this.data[data.context] = data.payload.settings;
    this._didReceiveSettings?.(data);
  }

  willDisappear(data) {
    this._willDisappear?.(data);
    delete this.data[data.context];
  }
}

module.exports = { log, Plugins, Actions };

const path = require('path');
const fs = require('fs');
const url = require('url');
const {URL} = url;
const child_process = require('child_process');
const vm = require('vm');
const fetch = require('window-fetch');
const {XMLHttpRequest} = require('xmlhttprequest');
const WebSocket = require('ws/lib/websocket');

const _handleError = err => {
  postMessage({
    _workerError: true,
    message: err.message,
    stack: err.stack,
  });
};

onmessage = initMessage => {
  (async () => {
    const messageQueue = [];
    onmessage = m => {
      messageQueue.push(m);
    };

    if (initMessage.data.startScript) {
      eval(initMessage.data.startScript);
    }

    const _normalizeUrl = src => new URL(src, initMessage.data.baseUrl).href;
    function getScript(url) {
      const result = child_process.spawnSync(process.argv[0], [
        path.join(__dirname, 'request.js'),
        url,
      ], {
        encoding: 'utf8',
        maxBuffer: 5 * 1024 * 1024,
      });
      if (result.status === 0) {
        return result.stdout;
      } else {
        throw new Error(`fetch ${url} failed: ${result.stderr}`);
      }
    }

    const filename = _normalizeUrl(initMessage.data.src);
    const exp = getScript(filename);

    function importScripts() {
      for (let i = 0; i < arguments.length; i++) {
        const importScriptPath = arguments[i];
        const filename = _normalizeUrl(importScriptPath);

        const importScriptSource = getScript(filename);
        vm.runInContext(importScriptSource, self, {
          filename: /^https?:/.test(filename) ? filename : 'data-url://',
        });
      }
    }

    const self = {
      console,
      setTimeout,
      setInterval,
      get onmessage() {
        return global.onmessage;
      },
      set onmessage(onmessage) {
        global.onmessage = onmessage;
      },
      get onerror() {
        return global.onerror;
      },
      set onerror(onerror) {
        global.onerror = onerror;
      },
      addEventListener(event, fn) {
        if (/^(?:error|message)$/.test(event)) {
          global['on' + event] = fn;
        }
      },
      location: url.parse(filename),
      fetch(s, options) {
        return fetch(_normalizeUrl(s), options);
      },
      XMLHttpRequest,
      WebSocket,
      importScripts,
      postMessage,
      createImageBitmap,
    };
    self.self = self;
    vm.createContext(self);

    onmessage = null;
    onerror = err => {
      process.send(JSON.stringify({error: err.message, stack: err.stack}));
    };
    vm.runInContext(exp, self, {
      filename: /^https?:/.test(filename) ? filename : 'data-url://',
    });

    if (messageQueue.length > 0) {
      if (onmessage !== null) {
        for (let i = 0; i < messageQueue.length; i++) {
          onmessage(messageQueue[i]);
        }
      }
      messageQueue.length = 0;
    }
  })()
    .catch(_handleError);
};

process.on('uncaughtException', _handleError);
process.on('unhandledRejection', _handleError);

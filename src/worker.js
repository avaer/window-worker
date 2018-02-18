const path = require('path');
const fs = require('fs');
const url = require('url');
const {URL} = url;
const vm = require('vm');
const fetch = require('window-fetch');
const {XMLHttpRequest} = require('xmlhttprequest');
const WebSocket = require('ws/lib/websocket');

const _handleError = err => {
  postMessage({
    _workerError: true,
    message: err.message,
    error: err.stack,
  });
};

onmessage = initMessage => {
  const messageQueue = [];
  onmessage = m => {
    messageQueue.push(m);
  };

  (async () => {
    const _normalizeUrl = src => new URL(src, initMessage.data.baseUrl).href;
    function getScript(s) {
      return fetch(s)
        .then(res => {
          if (res.status >= 200 && res.status < 300) {
            return res.text();
          } else {
            return Promise.reject(new Error('fetch returned invalid status code: ' + JSON.stringify(s) + ' : ' + res.status));
          }
        });
    }

    const filename = _normalizeUrl(initMessage.data.src);

    const exp = await getScript(filename);

    const importScriptPaths = (() => {
      const result = [];
      const regexp = /^importScripts\s*\((?:'(.+)'|"(.+)"|`(.+)`)\).*$/gm;
      let match;
      while (match = regexp.exec(exp)) {
        result.push(match[1] || match[2] || match[3]);
      }
      return result;
    })();
    const importScriptSources = {};
    await Promise.all(importScriptPaths.map(importScriptPath => {
      return getScript(_normalizeUrl(importScriptPath))
        .then(importScriptSource => {
          importScriptSources[importScriptPath] = importScriptSource;
        });
    }));

    function importScripts() {
      for (let i = 0; i < arguments.length; i++) {
        const importScriptPath = arguments[i];
        const importScriptSource = importScriptSources[importScriptPath];

        if (importScriptSource !== undefined) {
          const filename = _normalizeUrl(importScriptPath);
          vm.runInThisContext(importScriptSource, {
            filename: /^https?:/.test(filename) ? filename : 'data-url://',
          });
        } else {
          throw new Error('importScripts: script not found: ' + JSON.stringify(importScriptPath) + ', ' + JSON.stringify(Object.keys(importScriptSources)));
        }
      }
    }

    global.self = global;
    global.onerror = err => {
      process.send(JSON.stringify({error: err.message, stack: err.stack}));
    };
    global.addEventListener = (event, fn) => {
      if (/^(?:error|message)$/.test(event)) {
        global['on' + event] = fn;
      }
    };
    global.location = url.parse(filename);
    global.fetch = (s, options) => fetch(_normalizeUrl(s), options);
    global.XMLHttpRequest = XMLHttpRequest;
    global.WebSocket = WebSocket;
    global.importScripts = importScripts;

    onmessage = null;
    vm.runInThisContext(exp, {
      filename: /^https?:/.test(filename) ? filename : 'data-url://',
    });

    if (messageQueue.length > 0) {
      if (onmessage !== null) {
        for (let i = 0; i < messageQueue.length; i++) {
          console.log('flush message', Object.keys(messageQueue[i]));
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
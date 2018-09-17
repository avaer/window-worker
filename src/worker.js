const path = require('path');
const fs = require('fs');
const url = require('url');
const {URL} = url;
const vm = require('vm');
const childProcessThread = requireNative('ChildProcessThread');
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

    const baseUrl = (src => {
      if (!/^data:/.test(src)) {
        const u = new URL(src);
        u.pathname = path.dirname(u.pathname) + '/';
        return u.href;
      } else {
        return 'file://' + __dirname;
      }
    })(initMessage.data.src);
    const _normalizeUrl = src => {
      if (!/^data:/.test(src)) {
        return new URL(src, baseUrl).href;
      } else {
        return src;
      }
    };
    function getScript(url) {
      const match = url.match(/^data:.+?(;base64)?,(.*)$/);
      if (match) {
        if (match[1]) {
          return Buffer.from(match[2], 'base64').toString('utf8');
        } else {
          return match[2];
        }
      } else {
        let result, err = null;
        childProcessThread.await(async cb => {
          try {
            const res = await fetch(url);
            if (res.status >= 200 && res.status < 300) {
              result = await res.text();
            } else {
              throw new Error('request got invalid status code: ' + res.status);
            }
          } catch(e) {
            err = e;
          }

          cb();
        });

        if (!err) {
          return result;
        } else {
          throw new Error(`fetch ${url} failed: ${err.stack}`);
        }
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
        if (event === 'message') {
          global.onmessage = fn;
        }
        if (event === 'error') {
          global.onerror = fn;
        }
      },
      removeEventListener(event, fn) {
        if (event === 'message' && global.onmessage === fn) {
          global.onmessage = null;
        }
        if (event === 'error' && global.onerror === fn) {
          global.onerror = null;
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

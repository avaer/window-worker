const path = require('path');
const fs = require('fs');
const url = require('url');
const {URL} = url;
const vm = require('vm');
const child_process = require('child_process');
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

const createRequest = (fds, cb, arg) => {
  {
    const b = Buffer.from(JSON.stringify({fn: cb.toString(), arg}), 'utf8');
    const bLength = Buffer.allocUnsafe(4);
    bLength.writeUInt32LE(b.length);
    fs.writeSync(fds[1], bLength);
    fs.writeSync(fds[1], b);
  }

  const length = (() => {
    let total = 0;
    const b = Buffer.allocUnsafe(4);
    for (;;) {
      const bytesRead = fs.readSync(fds[0], b, total, 4, null);
      if (bytesRead > 0) {
        total += bytesRead;
      }
      if (total >= 4) {
        return b.readUInt32LE(0);
      }
    }
  })();
  
  const b = (() => {
    const b = Buffer.allocUnsafe(length);
    let total = 0;
    for (;;) {
      const bytesRead = fs.readSync(fds[0], b, total, length - total, null);
      if (bytesRead > 0) {
        total += bytesRead;
      }
      if (total >= length) {
        return b
      }
    }
  })();

  const s = b.toString('utf8');
  const j = JSON.parse(s);
  return j;
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
      if (/^https?:/.test(src)) {
        const u = new URL(src);
        u.pathname = path.dirname(u.pathname) + '/';
        return u.href;
      } else {
        return 'file://' + __dirname;
      }
    })(initMessage.data.src);
    const _normalizeUrl = src => {
      if (!/^(?:data|blob):/.test(src)) {
        const match = baseUrl.match(/^(file:\/\/)(.*)$/);
        if (match) {
          return match[1] + path.join(match[2], src);
        } else {
          return new URL(src, baseUrl).href;
        }
      } else {
        return src;
      }
    };
    function getScript(url) {
      let match;
      if (match = url.match(/^data:.+?(;base64)?,(.*)$/)) {
        if (match[1]) {
          return Buffer.from(match[2], 'base64').toString('utf8');
        } else {
          return match[2];
        }
      } else if (match = url.match(/^file:\/\/(.*)$/)) {
        return fs.readFileSync(match[1], 'utf8');
      } else {
        if (initMessage.data.fds) {
          const {error, result} = createRequest(initMessage.data.fds, (url, cb) => {
            (async () => {
              const res = await fetch(url);
              if (res.ok) {
                return await res.text();
              } else {
                throw new Error('request got invalid status code: ' + res.status);
              }
            })()
              .then(result => {
                cb({result});
              })
              .catch(error => {
                error = error.stack;
                cb({error});
              });
          }, url);

          if (!error) {
            return result;
          } else {
            throw new Error(`fetch ${url} failed: ${error}`);
          }
        } else {
          const result = child_process.spawnSync(initMessage.data.argv0, [
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
      clearTimeout,
      setInterval,
      clearInterval,
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
      FileReader,
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

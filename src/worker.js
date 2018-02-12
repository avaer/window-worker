const path = require('path');
const fs = require('fs');
const url = require('url');
const {URL} = url;
const vm = require('vm');
const fetch = require('window-fetch');
const {XMLHttpRequest} = require('xmlhttprequest');
const WebSocket = require('ws/lib/websocket');
const smiggles = require('smiggles');
const pullstream = require('pullstream');
const MessageEvent = require('./message-event');

const ws = fs.createWriteStream(null, {fd: 4});

process.once('message', obj => {
  (async () => {
    const _normalizeUrl = src => new URL(src, obj.baseUrl).href;

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

    const filename = _normalizeUrl(obj.input);
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
    global.close = () => {
      process.exit(0);
    };
    global.postMessage = msg => {
      const b = smiggles.serialize(msg);
      let bSize = 0;
      for (let i = 0; i < b.length; i++) {
        bSize += b[i].length;
      }
      const lb = Uint32Array.from([bSize]);
      ws.write(new Buffer(lb.buffer, lb.byteOffset, lb.byteLength));
      for (let i = 0; i < b.length; i++) {
        ws.write(b[i]);
      }
    };
    global.onmessage = undefined;
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

    vm.runInThisContext(exp, {
      filename: /^https?:/.test(filename) ? filename : 'data-url://',
    });

    const rs = fs.createReadStream(null, {fd: 3});
    const ps = new pullstream();
    rs.pipe(ps);
    const _recurse = () => {
      ps.pull(4, (err, data) => {
        if (!err) {
          const length = (() => {
            if ((data.byteOffset % Uint32Array.BYTES_PER_ELEMENT) === 0) {
              return new Uint32Array(data.buffer, data.byteOffset, 1)[0];
            } else {
              const arrayBuffer = new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT);
              new Buffer(arrayBuffer).set(new Buffer(data.buffer, data.byteOffset, Uint32Array.BYTES_PER_ELEMENT));
              return new Uint32Array(arrayBuffer)[0];
            }
          })();
          ps.pull(length, (err, data) => {
            if (!err) {
              global.onmessage && global.onmessage(new MessageEvent(smiggles.deserialize(data)));

              _recurse();
            } else {
              // console.warn(err);

              // _recurse();
            }
          });
        } else {
          // console.warn(err);

          // _recurse();
        }
      });
    };
    _recurse();
  })()
    .catch(err => {
      console.warn(err.stack);
      process.exit(1);
    });
});

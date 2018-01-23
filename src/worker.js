const fs = require('fs'),
	path = require('path'),
	vm = require('vm'),
	events = /^(?:error|message)$/;
const fetch = require('window-fetch');

process.once('message', obj => {
  const messageQueue = [];
  const onmessage = m => {
    messageQueue.push(m);
  };
  process.on('message', onmessage);
  const bindMessageQueue = () => {
    process.removeListener('message', onmessage);

    for (let i = 0; i < messageQueue.length; i++) {
      process.emit('message', messageQueue[i]);
    }
    messageQueue.length = 0;
  };

  (async () => {
    const baseUrl = obj.baseUrl;
    const _normalizeUrl = url => {
      if (!/^.+?:/.test(url)) {
        url = baseUrl + ((!/\/$/.test(baseUrl) && !/^\//.test(url)) ? '/' : '') + url;
      }
      return url;
    };

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
      process.send(JSON.stringify({data: msg}, null, 0));
    };
    global.onmessage = void 0;
    global.onerror = err => {
      process.send(JSON.stringify({error: err.message, stack: err.stack}, null, 0));
    };
    global.addEventListener = (event, fn) => {
      if (events.test(event)) {
        global['on' + event] = fn;
      }
    };
    global.fetch = (s, options) => fetch(_normalizeUrl(s), options);
    global.importScripts = importScripts;

    vm.runInThisContext(exp, {
      filename: /^https?:/.test(filename) ? filename : 'data-url://',
    });

    process.on('message', msg => {
      try {
        global.onmessage && global.onmessage(JSON.parse(msg));
      } catch (err) {
        global.onerror && global.onerror(err);
      }
    });
    process.on('error', err => {
      global.onerror && global.onerror(err);
    });
    bindMessageQueue();
  })()
    .catch(err => {
      console.warn(err.stack);
      process.exit(1);
    });
});

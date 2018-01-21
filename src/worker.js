const fs = require('fs'),
	path = require('path'),
	vm = require('vm'),
	noop = require(path.join(__dirname, 'noop.js')),
	events = /^(error|message)$/;
const fetch = require('window-fetch');
const babel = require('babel-core');
const importScriptsAsync = require('babel-plugin-transform-import-scripts-async');

async function importScripts() {
  for (let i = 0; i < arguments.length; i++) {
    const scriptSrc = arguments[i];
    const codeString = await getScript(scriptSrc);
    const compiledCodeString = compile(codeString);
    vm.createScript(compiledCodeString).runInThisContext();
  }
}
function getScript(s) {
  return fetch(s)
    .then(res => {
      if (res.status >= 200 && res.status < 300) {
        return res.text();
      } else {
        return Promise.reject(new Error('fetch returned invalid status code: ' + res.status));
      }
    });
}
function compile(arg) {
  return babel
    .transform(arg, {
      plugins: [importScriptsAsync],
    }).code;
}

// Bootstraps the Worker
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
    const exp = '(async function() {' + compile(obj.isfn ? ('(' + obj.input + ')()') : await getScript(obj.input)) + '})()';

    global.self = {
      close: () => {
        process.exit(0);
      },
      postMessage: msg => {
        process.send(JSON.stringify({data: msg}, null, 0));
      },
      onmessage: void 0,
      onerror: err => {
        process.send(JSON.stringify({error: err.message, stack: err.stack}, null, 0));
      },
      addEventListener: (event, fn) => {
        if (events.test(event)) {
          global["on" + event] = global.self["on" + event] = fn;
        }
      }
    };

    global.__dirname = obj.cwd;
    global.__filename = __filename;
    // global.require = require;

    const baseUrl = obj.baseUrl;
    const _normalizeUrl = url => {
      if (!/^.+?:/.test(url)) {
        url = baseUrl + ((!/\/$/.test(baseUrl) && !/^\//.test(url)) ? '/' : '') + url;
      }
      return url;
    };
    global.fetch = (s, options) => fetch(_normalizeUrl(s), options);

    global.importScripts = importScripts;
    /* global.importScripts = (...files) => {
      if (files.length > 0) {
        vm.createScript(files.map(file => fs.readFileSync(file, "utf8")).join("\n")).runInThisContext();
      }
    }; */

    Object.keys(global.self).forEach(key => {
      global[key] = global.self[key];
    });

    await vm.createScript(exp).runInThisContext();

    process.on('message', msg => {
      try {
        (global.onmessage || global.self.onmessage || noop)(JSON.parse(msg));
      } catch (err) {
        (global.onerror || global.self.onerror || noop)(err);
      }
    });
    process.on('error', err => {
      (global.onerror || global.self.onerror || noop)(err);
    });
    bindMessageQueue();
  })();
});

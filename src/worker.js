const path = require('path');
const fs = require('fs');
const url = require('url');
const {URL} = url;
const vm = require('vm');
// const child_process = require('child_process');
const fetch = require('window-fetch');
const {XMLHttpRequest} = require('xmlhttprequest');
const WebSocket = require('ws/lib/websocket');
const {Worker, parentPort, workerData} = require('worker_threads');

function postMessage() {
  return parentPort.postMessage.apply(parentPort, arguments);
}

const _handleError = err => {
  postMessage({
    _workerError: true,
    message: err.message,
    stack: err.stack,
  });
};
process.on('uncaughtException', _handleError);
process.on('unhandledRejection', _handleError);

const initMessage = { // XXX
  data: workerData,
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
    return 'file://' + process.cwd();
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
    const sab = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT*2 + 5 * 1024 * 1024);
    const int32Array = new Int32Array(sab);
    const worker = new Worker(path.join(__dirname, 'request.js'), {
      workerData: {
        url,
        int32Array,
      },
    });
    Atomics.wait(int32Array, 0, 0);
    const status = new Uint32Array(sab, 0, 1)[0];
    const length = new Uint32Array(sab, Int32Array.BYTES_PER_ELEMENT, 1)[0];
    const result = Buffer.from(sab, Int32Array.BYTES_PER_ELEMENT*2, length).toString('utf8');
    if (status === 1) {
      return result;
    } else {
      throw new Error(`fetch ${url} failed (${JSON.stringify(status)}): ${result}`);
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

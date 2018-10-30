const path = require('path');
const fs = require('fs');
const Worker = require('.');

const worker = new Worker('data:application/javascript;base64,' + fs.readFileSync('example-worker.js', 'base64'), {
  baseUrl: 'https://unpkg.com/window-worker/',
  bindingsModule: path.join(__dirname, 'example-bindings.js'),
  startScript: `
    (() => {
      global.createImageBitmap = () => {};
      global.FileReader = () => {};
    })();
  `
});
let numMessages = 0;
const _pend = () => {
  if (++numMessages === 4) {
    worker.terminate();
  }
};
worker.onmessage = msg => {
  console.log('got message', msg.data);

  _pend();
};
worker.onerror = err => {
  console.log('got error', err);
  
  _pend();
};
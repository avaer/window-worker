const path = require('path');
const fs = require('fs');
const Worker = require('.');

const worker = new Worker('data:application/javascript;base64,' + fs.readFileSync('example-worker.js', 'base64'), {
  baseUrl: 'https://unpkg.com/window-worker/',
  bindingsModule: path.join(__dirname, 'example-bindings.js'),
});
let numMessages = 0;
worker.onmessage = msg => {
  console.log('got message', msg.data);

  if (++numMessages === 2) {
    worker.terminate();
  }
};

/* process.on('SIGINT', () => {
  console.log('sigint master');
  process.exit();
});
process.on('SIGWINCH', () => {
  console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!1sigwinch master');
}); */

/* setInterval(() => {
  console.log('parent');
}, 2000); */
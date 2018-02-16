const path = require('path');
const fs = require('fs');
const Worker = require('.');

const worker = new Worker(`http://192.168.0.13:8000/archae/plugins/generator/build/worker.js`, {
  baseUrl: 'https://unpkg.com/window-worker/',
  bindingsModule: path.join(__dirname, 'example-bindings.js'),
});
let numMessages = 0;
worker.onmessage = msg => {
  console.log('got message', msg.data);

  if (++numMessages === 2) {
    // worker.terminate();
  }
};

process.on('SIGINT', () => {
  console.log('sigint master');
  process.exit();
});
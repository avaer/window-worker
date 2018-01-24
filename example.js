const fs = require('fs');
const Worker = require('.');

const worker = new Worker('data:application/javascript;base64,' + fs.readFileSync('example-worker.js', 'base64'), {
  baseUrl: 'https://unpkg.com/window-worker'
});
let numMessages = 0;
worker.onmessage = msg => {
  console.log('got message', msg.data);

  if (++numMessages === 2) {
    worker.terminate();
  }
};

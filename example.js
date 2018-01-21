const fs = require('fs');
const Worker = require('.');

const worker = new Worker('data:application/javascript;base64,' + fs.readFileSync('example-worker.js', 'base64'), {
  baseUrl: 'https://unpkg.com/window-worker'
});
worker.onmessage = msg => {
  console.log('got message', JSON.stringify(msg.data));

  worker.terminate();
};

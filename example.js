const Worker = require('.');

const worker = new Worker('example-worker.js', {
  baseUrl: 'https://unpkg.com/window-worker'
});
worker.onmessage = msg => {
  console.log('got message', JSON.stringify(msg.data));

  worker.terminate();
};

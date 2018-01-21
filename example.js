const Worker = require('.');

new Worker('example-worker.js', {
  baseUrl: 'https://unpkg.com/window-worker'
});

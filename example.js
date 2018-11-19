const path = require('path');
const fs = require('fs');
const http = require('http');
const Worker = require('.');
const express = require('express');

(() => {
  const worker = new Worker('data:application/javascript;base64,' + fs.readFileSync('example-worker.js', 'base64'), {
    baseUrl: 'https://unpkg.com/window-worker/',
    startScript: `
      (() => {
        global.createImageBitmap = () => {};
        global.FileReader = () => {};
      })();
    `
  });
  let numMessages = 0;
  const totalNumMessages = 2;
  const _pend = () => {
    if (++numMessages === totalNumMessages) {
      worker.terminate();
    }
  };
  worker.onmessage = msg => {
    console.log('got message 1', msg.data);

    _pend();
  };
  worker.onerror = err => {
    console.log('got error 1', err);
    
    _pend();
  };
})();

const server = http.createServer(express.static(__dirname));
server.listen(9000, () => {
  console.log('booting worker');
  const worker = new Worker('http://127.0.0.1:9000/example-worker.js', {
    baseUrl: 'https://unpkg.com/window-worker/',
    startScript: `
      (() => {
        global.createImageBitmap = () => {};
        global.FileReader = () => {};
      })();
    `
  });
  let numMessages = 0;
  const totalNumMessages = 2;
  const _pend = () => {
    if (++numMessages === totalNumMessages) {
      worker.terminate();
      server.close();
    }
  };
  worker.onmessage = msg => {
    console.log('got message 2', msg.data);

    _pend();
  };
  worker.onerror = err => {
    console.log('got error 2', err);
    
    _pend();
  };
});

console.log('run worker 1');

importScripts('example-import.js');

console.log('run worker 2');

postMessage('lol');
const array = Float32Array.from([1, 2, 3, 4]);
postMessage({
  array,
}, [array.buffer]);

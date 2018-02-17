console.log('run worker 1');

importScripts('example-import.js');
if (!nativeBinding.bound) {
  throw new Error('native binding not found');
}

console.log('run worker 2');

postMessage('lol');
const array = Float32Array.from([1, 2, 3, 4]);
postMessage({
  array,
}, [array.buffer]);

throw new Error('fail 1');
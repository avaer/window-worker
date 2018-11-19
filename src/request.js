const {workerData} = require('worker_threads');
const fetch = require('window-fetch');

const {url, int32Array} = workerData;
const {buffer: sab} = int32Array;
const lengthArray = new Uint32Array(sab, Int32Array.BYTES_PER_ELEMENT, 1);
const resultArray = new Uint8Array(sab, Int32Array.BYTES_PER_ELEMENT*2);

(async () => {
  const res = await fetch(url);
  if (res.status >= 200 && res.status < 300) {
    return await res.text();
  } else {
    throw new Error('request got invalid status code: ' + res.status);
  }
})()
  .then(result => {
    const s = result + '';
    const b = new Buffer(s, 'utf8');
    lengthArray[0] = b.byteLength;
    resultArray.set(b);
  })
  .catch(err => {
    const s = err.stack || (err + '');
    const b = new Buffer(s, 'utf8');
    lengthArray[0] = b.byteLength;
    resultArray.set(b);
  })
  .finally(() => {
    Atomics.store(sab, 0, 1);
    Atomics.notify(sab, 0);
  });

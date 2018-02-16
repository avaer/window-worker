console.log('worker 1');

importScripts('example-import.js');

const get = () => new Promise((accept, reject) => {
  setTimeout(() => {
console.log('timeout');
    http.get('http://google.com', res => {
console.log('http');
res.resume();
res.on('end', () => {
console.log('end');
accept();
});
    });
  }, 100);
})
.then(s => {console.log('then 1')})

setTimeout(() => {
  (async () => {
    await Promise.resolve();
    
    console.log('run worker 2');
    
    await get();
    
    console.log('run worker 3');
  })();
}, 500);
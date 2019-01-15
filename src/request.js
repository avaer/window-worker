const fetch = require('window-fetch');

if (process.argv.length === 3) {
  (async () => {
    const url = process.argv[2];
    try {
      const res = await fetch(url);
      if (res.status >= 200 && res.status < 300) {
        const text = await res.text();
        process.stdout.write(text, () => {
          process.exit(0);
        });
      } else {
        const err = new Error('request got invalid status code: ' + res.status);
        process.stderr.write(err.stack, () => {
          process.exit(1);
        });
      }
    } catch(err) {
      process.stderr.write(err.stack, () => {
        process.exit(1);
      });
    }
  })();
} else {
  const err = new Error('invalid arguments: ' + process.argv.length);
  process.stderr.write(err.stack, () => {
    process.exit(1);
  });
}

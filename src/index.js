const path = require('path');
const fs = require('fs');
const os = require('os');
const fetch = require('window-fetch');
const worker_threads = require('worker_threads');

/* const createHandler = fds => {
  const rs = fs.createReadStream(null, {fd: fds[0]});
  const _read1 = () => {
    const bs = [];
    let total = 0;
    const _data = d => {
      bs.push(d);
      total += d.length;
      if (total >= 4) {
        const b = Buffer.concat(bs);
        const b1 = b.slice(0, 4);
        const b2 = b.slice(4);

        const length = b1.readUInt32LE(0);

        rs.removeListener('data', _data);
        _read2(length);
        if (bs.length > 0) {
          rs.unshift(b2);
        }
      }
    };
    rs.on('data', _data);
  };
  const _read2 = length => {
    const bs = [];
    let total = 0;
    const _data = d => {
      bs.push(d);
      total += d.length;
      if (total >= length) {
        const b = Buffer.concat(bs);
        const b1 = b.slice(0, length);
        const b2 = b.slice(length);

        const s = b1.toString('utf8');
        const j = JSON.parse(s);
        const {fn: fnString, arg} = j;
        const fn = eval(fnString);
        fn(arg, result => {
          const b = Buffer.from(JSON.stringify(result), 'utf8');
          const bLength = Buffer.allocUnsafe(4);
          bLength.writeUInt32LE(b.length);
          fs.write(fds[1], bLength, err => {});
          fs.write(fds[1], b, err => {});
        });

        rs.removeListener('data', _data);
        _read1();
        if (bs.length > 0) {
          rs.unshift(b2);
        }
      }
    };
    rs.on('data', _data);
  };

  _read1();
}; */

class Worker {
	constructor(src, options = {}) {
    const {startScript = null} = options;

    this.onmessage = null;
		this.onerror = null;

    /* let fds;
    if (os.platform() !== 'win32') {
      fds = {
        in: childProcessThread.pipe(),
        out: childProcessThread.pipe(),
      };

      createHandler([fds.in[0], fds.out[1]]);
    } else {
      fds = null;
    } */

    this.worker = new worker_threads.Worker(path.join(__dirname, 'worker.js'), {
      workerData: {
        // argv0: process.argv0,
        src,
        startScript,
        // fds: fds && [fds.out[0], fds.in[1]],
      },
    });
    this.worker.on('message', m => {
      if (m.data && m.data._workerError) {
        const err = new Error(m.data.message);
        err.stack = m.data.stack;
        
        if (this.onerror) {
          this.onerror(err);
        } else {
          throw err;
        }
      } else {
        if (this.onmessage) {
          this.onmessage(m);
        }
      }
    });
    this.worker.on('error', err => {
      if (this.onerror) {
        this.onerror(err);
      } else {
        console.warn(err);
      }
    });
	}

  addEventListener(event, fn) {
    if (event === 'message') {
      this.onmessage = fn;
    }
    if (event === 'error') {
      this.onerror = fn;
    }
  }
  removeEventListener(event, fn) {
    if (event === 'message' && this.onmessage === fn) {
      this.onmessage = null;
    }
    if (event === 'error' && this.onerror === fn) {
      this.onerror = null;
    }
  }

	postMessage(m, transferList) {
    this.child.postMessage(m, transferList);
	}

	terminate() {
    this.child.terminate();
	}
}
// Worker.setNativeRequire = childProcessThread.setNativeRequire;
// Worker.bind = childProcessThread.bind;

module.exports = Worker;

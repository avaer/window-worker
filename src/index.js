const path = require('path');
const childProcessThread = require('child-process-thread');

const workerPath = path.join(__dirname, 'worker.js');

class Worker {
	constructor(src, options = {}) {
    const {startScript = null} = options;

    this.onmessage = null;
		this.onerror = null;

		this.child = childProcessThread.fork(workerPath);
		this.child.postMessage({
      argv0: process.argv0,
      src,
      startScript,
    });
    this.child.onmessage = m => {
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
    };
    this.child.onerror = err => {
      if (this.onerror) {
        this.onerror(err);
      } else {
        console.warn(err);
      }
    };
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
Worker.setNativeRequire = childProcessThread.setNativeRequire;
Worker.bind = childProcessThread.bind;

module.exports = Worker;

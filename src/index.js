const path = require('path');
const childProcessThread = require('child-process-thread');

const workerPath = path.join(__dirname, 'worker.js');

class Worker {
	constructor(src, options = {}) {
    const {baseUrl = 'http://127.0.0.1/', startScript = null} = options;

    this.onmessage = null;
		this.onerror = null;

		this.child = childProcessThread.fork(workerPath);
		this.child.postMessage({
      src,
      baseUrl,
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
      this.onerror(err);
    };
	}

	addEventListener(event, fn) {
		if (/^(?:error|message)$/.test(event)) {
			this['on' + event] = fn;
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

module.exports = Worker;

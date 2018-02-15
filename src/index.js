const path = require('path');
const childProcessThread = require('child-process-thread');

const workerPath = path.join(__dirname, 'worker.js');
const MessageEvent = require('./message-event');

class Worker {
	constructor(src, options = {}) {
    const {baseUrl = 'http://127.0.0.1/', bindingsModule = null} = options;

    this.onmessage = null;
		this.onerror = null;

		this.child = childProcessThread.fork(workerPath);
		this.child.postMessage({
      src,
      baseUrl,
      bindingsModule,
    });
    this.child.onmessage = m => {
      if (this.onmessage) {
        this.onmessage(new MessageEvent(m));
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
Worker.bind = bindings => childProcessThread.bind(bindings);

module.exports = Worker;

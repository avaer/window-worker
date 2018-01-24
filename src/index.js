const path = require("path"),
	fork = require("child_process").fork,
	worker = path.join(__dirname, "worker.js"),
	events = /^(error|message)$/,
	defaultPorts = {inspect: 9229, debug: 5858};
const smiggles = require('smiggles');
const pullstream = require('pullstream');
const MessageEvent = require('./message-event');

const range = {min: 1, max: 300};

class Worker {
	constructor (input, options = {}) {
    const {args = [], cwd = process.cwd(), baseUrl = 'http://127.0.0.1/'} = options;

		// get all debug related parameters
		var debugVars = process.execArgv.filter(execArg => {
			return (/(debug|inspect)/).test(execArg);
		});
		if (debugVars.length > 0 && !options.noDebugRedirection) {
			if (!options.execArgv) { //if no execArgs are given copy all arguments
				debugVars = Array.from(process.execArgv);
				options.execArgv = [];
			}

			let inspectIndex = debugVars.findIndex(debugArg => { //get index of inspect parameter
				return (/^--inspect(-brk)?(=\d+)?$/).test(debugArg);
			});

			let debugIndex = debugVars.findIndex(debugArg => { //get index of debug parameter
				return (/^--debug(-brk)?(=\d+)?$/).test(debugArg);
			});

			let portIndex = inspectIndex >= 0 ? inspectIndex : debugIndex; //get index of port, inspect has higher priority

			if (portIndex >= 0) {
				var match = (/^--(debug|inspect)(?:-brk)?(?:=(\d+))?$/).exec(debugVars[portIndex]); //get port
				var port = defaultPorts[match[1]];
				if (match[2]) {
					port = parseInt(match[2]);
				}
				debugVars[portIndex] = "--" + match[1] + "=" + (port + range.min + Math.floor(Math.random() * (range.max - range.min))); //new parameter

				if (debugIndex >= 0 && debugIndex !== portIndex) { //remove "-brk" from debug if there
					match = (/^(--debug)(?:-brk)?(.*)/).exec(debugVars[debugIndex]);
					debugVars[debugIndex] = match[1] + (match[2] ? match[2] : "");
				}
			}
			options.execArgv = options.execArgv.concat(debugVars);

		}

		this.child = fork(worker, args, {
      cwd,
      stdio: [0, 1, 2, 'pipe', 'pipe', 'ipc'],
    });
		this.onerror = undefined;
		this.onmessage = undefined;

    const rs = this.child.stdio[4];
    const ps = new pullstream();
    rs.pipe(ps);
    const _recurse = () => {
      ps.pull(4, (err, data) => {
        if (!err) {
          const length = (() => {
            if ((data.byteOffset % Uint32Array.BYTES_PER_ELEMENT) === 0) {
              return new Uint32Array(data.buffer, data.byteOffset, 1)[0];
            } else {
              const arrayBuffer = new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT);
              new Buffer(arrayBuffer).set(new Buffer(data.buffer, data.byteOffset, Uint32Array.BYTES_PER_ELEMENT));
              return new Uint32Array(arrayBuffer)[0];
            }
          })();
          ps.pull(length, (err, data) => {
            if (!err) {
              this.onmessage && this.onmessage(new MessageEvent(smiggles.deserialize(data)));

              _recurse();
            } else {
              // console.warn(err);

              // _recurse();
            }
          });
        } else {
          // console.warn(err);

          // _recurse();
        }
      });
    };
    _recurse();
    this.child.on('message', msg => {
      if (this.onerror) {
        const m = JSON.parse(msg);
        const error = new Error(m.error);
        error.stack = m.stack;

        this.onerror.call(this, error);
      }
    });
    this.child.on('error', err => {
			if (this.onerror) {
				this.onerror(err);
			}
		});

		this.child.send({
      input,
      cwd,
      baseUrl,
    });
	}

	addEventListener(event, fn) {
		if (events.test(event)) {
			this['on' + event] = fn;
		}
	}

	postMessage(msg) {
    const b = smiggles.serialize(msg);
    let bSize = 0;
    for (let i = 0; i < b.length; i++) {
      bSize += b[i].length;
    }
    const ws = this.child.stdio[3];
    const lb = Uint32Array.from([bSize]);
    ws.write(new Buffer(lb.buffer, lb.byteOffset, lb.byteLength));
    for (let i = 0; i < b.length; i++) {
      ws.write(b[i]);
    }
	}

	terminate () {
		this.child.kill("SIGINT");
	}
}

module.exports = Worker;

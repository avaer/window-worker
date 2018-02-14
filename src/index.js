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
    const {args = [], cwd = process.cwd(), baseUrl = 'http://127.0.0.1/', bindingsModule = null} = options;

		this.child = fork(worker, args, {
      cwd,
      stdio: [0, 1, 2, 'pipe', 'pipe', 'ipc'],
    });
		this.onerror = undefined;
		this.onmessage = undefined;

    // kill child fork if parent dies. (programming lingo has always
    // seemed so macabre... slaves and masters, killing children, hm.)
    {
      // https://stackoverflow.com/questions/14031763/doing-a-cleanup-action-just-before-node-js-exits
      function exitHandler(options, err) {
          this.terminate();
          if (options.cleanup) console.log('clean');
          if (err) console.log(err.stack);
          if (options.exit) process.exit();
      }

      //do something when app is closing
      process.on('exit', exitHandler.bind(this,{cleanup:true}));

      //catches ctrl+c event
      process.on('SIGINT', exitHandler.bind(this, {exit:true}));

      // catches "kill pid" (for example: nodemon restart)
      process.on('SIGUSR1', exitHandler.bind(this, {exit:true}));
      process.on('SIGUSR2', exitHandler.bind(this, {exit:true}));

      //catches uncaught exceptions
      process.on('uncaughtException', exitHandler.bind(this, {exit:true}));
    }

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
      bindingsModule,
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
Worker.bind = bindings => smiggles.bind(bindings);

module.exports = Worker;


# rabbitmq-rpc-eventemitter

Simplified rabbitmq RPC using [rabbitmq-eventemitter](https://www.npmjs.com/package/rabbitmq-eventemitter).

	npm install rabbitmq-rpc-eventemitter

# Usage

The constructor accepts an `rabbitmq-eventemitter` object. The returned instance exposes a `pull` method for receiving and a `push` method for sending requests.

```javascript
var queue = require('rabbitmq-eventemitter')('amqp://localhost');
var rpc = require('rabbitmq-rpc-eventemitter')(queue);

rpc.pull('get.instance', function(message, callback) {
	console.log(message); // prints { request: 1 }
	callback(null, { response: 1 });
});

rpc.push('get.instance', { request: 1 }, function(err, message) {
	console.log(message); // prints { response: 1 }
});
```

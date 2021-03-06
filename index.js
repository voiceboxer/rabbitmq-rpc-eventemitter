var util = require('util');
var events = require('events');
var os = require('os');
var extend = require('xtend');
var rs = require('randomstring');
var once = require('once');
var thunky = require('thunky');

var TIMEOUT = 60 * 1000;

var callbackQueuePattern = function() {
  return rs.generate(16) + '.callback';
};

var queueOptions = function() {
  return {
    queueOptions: {
      namespace: 'rpc',
      durable: false,
      autoDelete: true
    }
  };
};

var Queue = function(queue) {
  if(!(this instanceof Queue)) return new Queue(queue);
  events.EventEmitter.call(this);

  var self = this;
  var onerror = once(function(err) {
    self.emit('error', err);
  });

  this._callbackQueuePattern = callbackQueuePattern();
  this._onerror = onerror;
  this._requests = {};
  this._queue = queue;

  this._queue.on('error', onerror);

  this._ensureCallback = thunky(function(callback) {
    self._queue.pull(self._callbackQueuePattern, function(message, options, cb) {
      var correlationId = options.properties.correlationId;
      var err = null;

      if(message.__error__) {
        err = new Error(message.message);
        err.name = message.name;
        err.stack = message.stack;
      }

      self._resolve(correlationId, err, message);
      cb();
    }, queueOptions(), callback);
  });
};

util.inherits(Queue, events.EventEmitter);

Queue.prototype.push = function(pattern, data, options, callback) {
  if(!callback && typeof options === 'function') {
    callback = options;
    options = null;
  }
  if(!callback && typeof data === 'function') {
    callback = data;
    data = null;
  }

  var self = this;
  var correlationId = rs.generate(32);

  data = data || {};
  options = options || {};
  callback = callback || function(err) {
    if(err) self._onerror(err);
  };

  options = extend({
    replyTo: this._callbackQueuePattern,
    correlationId: correlationId
  }, options);

  this._ensureCallback(function(err) {
    if(err) return callback(err);

    var timeout = setTimeout(function() {
      self._resolve(correlationId, new Error('Request timed out'));
    }, options.timeout || TIMEOUT);

    self._requests[correlationId] = { timeout: timeout, callback: callback };
    self._queue.push(pattern, data, options, function(err) {
      if(err) self._resolve(correlationId, err);
    });
  });
};

Queue.prototype.pull = function(pattern, listener, callback) {
  var self = this;

  callback = callback || function(err) {
    if(err) self._onerror(err);
  };

  this._queue.pull(pattern, function(message, options, cb) {
    var correlationId = options.properties.correlationId;
    var replyTo = options.properties.replyTo;

    if(!correlationId || !replyTo) return cb();

    var onresponse = function(err, data) {
      if(util.isError(err)) {
        data = {
          __error__: true,
          name: err.name,
          message: err.message,
          stack: err.stack
        };
      } else if(!data) {
        data = {};
      }

      self._queue.push(replyTo, data, {
        correlationId: correlationId
      }, cb);
    };

    if(listener.length <= 2) listener(message, onresponse);
    else listener(message, options, onresponse);
  }, queueOptions(), callback);
};

Queue.prototype.close = function(callback) {
  this._queue.close(callback);
};

Queue.prototype._resolve = function(id, err, data) {
  var request = this._requests[id];

  if(request) {
    delete this._requests[id];

    var timeout = request.timeout;
    var callback = request.callback;

    clearTimeout(timeout);
    if(err) callback(err);
    else callback(null, data);
  }
};

module.exports = Queue;

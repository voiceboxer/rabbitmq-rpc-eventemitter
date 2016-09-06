var util = require('util');
var test = require('tape');
var afterAll = require('after-all');
var deepEqual = require('deep-equal');
var almostEqual = require('almost-equal');

var queue = require('../');

var expectsOnce = function() {
  var args = arguments;
  var seen = {};

  return function(obj) {
    for(var i = 0; i < args.length; i++) {
      if(deepEqual(args[i], obj) && !seen[i]) {
        seen[i] = true;
        return true;
      }
    }

    return false;
  };
};

var createQueue = function() {
  var queueOptions = {
    durable: false,
    autoDelete: true
  };

  return queue('amqp://localhost', {
    namespace: 'test-namespace',
    queueOptions: queueOptions
  });
};

test('rpc call', function(t) {
  var q = createQueue();

  t.plan(5);

  var responseHandler = function(err, message) {
    t.error(err);
    t.deepEqual(message, { ok: 2 });

    process.nextTick(function() {
      q.close(function(err) {
        t.error(err);
      });
    });
  };

  var requestHandler = function(message, callback) {
    t.deepEqual(message, { ok: 1 });
    callback(null, { ok: 2 });
  };

  q.pull('test-pattern', requestHandler, function(err) {
    t.error(err);
  });

  q.push('test-pattern', { ok: 1 }, responseHandler);
});

test('rpc error call', function(t) {
  var q = createQueue();

  t.plan(7);

  var responseHandler = function(err, message) {
    t.ok(err instanceof Error);
    t.equals(err.message, 'test-message');
    t.equals(err.name, 'TypeError');
    t.ok(err.stack);

    process.nextTick(function() {
      q.close(function(err) {
        t.error(err);
      });
    });
  };

  var requestHandler = function(message, callback) {
    t.deepEqual(message, { ok: 1 });
    callback(new TypeError('test-message'));
  };

  q.pull('test-pattern', requestHandler, function(err) {
    t.error(err);
  });

  q.push('test-pattern', { ok: 1 }, responseHandler);
});

test('rpc timeout call', function(t) {
  var time = Date.now();
  var q = createQueue();

  t.plan(6);

  var responseHandler = function(err, message) {
    var delta = Date.now() - time;

    t.ok(err instanceof Error);
    t.ok(err.message, err.message);
    t.ok(almostEqual(delta, 1000, 100), delta + ' should be close to 1000 milliseconds');

    process.nextTick(function() {
      q.close(function(err) {
        t.error(err);
      });
    });
  };

  var requestHandler = function(message, callback) {
    t.deepEqual(message, { ok: 1 });
  };

  q.pull('test-pattern', requestHandler, function(err) {
    t.error(err);
  });

  q.push('test-pattern', { ok: 1 }, { timeout: 1000 }, responseHandler);
});

test('multiple rpc calls', function(t) {
  var server = createQueue();
  var client1 = createQueue();
  var client2 = createQueue();

  t.plan(9);

  var valid = expectsOnce({ ok: 1 }, { ok: 2 });
  var onresponse = afterAll(function(err) {
    t.error(err);

    var onclose = afterAll(function(err) {
      t.error(err);
    });

    [server, client1, client2].forEach(function(q) {
      var next = onclose();

      process.nextTick(function() {
        q.close(next);
      });
    });
  });

  var responseHandler1 = onresponse(function(err, message) {
    t.error(err);
    t.deepEqual(message, { ok: 3 });
  });

  var responseHandler2 = onresponse(function(err, message) {
    t.error(err);
    t.deepEqual(message, { ok: 4 });
  });

  var requestHandler = function(message, callback) {
    t.ok(valid(message), 'request message ' + util.inspect(message));
    callback(null, { ok: message.ok + 2 });
  };

  server.pull('test-pattern', requestHandler, function(err) {
    t.error(err);
  });

  client1.push('test-pattern', { ok: 1 }, responseHandler1);
  client2.push('test-pattern', { ok: 2 }, responseHandler2);
});

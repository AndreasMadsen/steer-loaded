var http = require('http');
var path = require('path');
var filed = require('filed');

var test = require('tap').test;
var director = require('director');

var browser = require('../start-browser.js');
var loaded = require('../../steer-loaded.js');

// Create a testing server
var router = new director.http.Router();
var server = http.createServer();

var ready = path.resolve(__dirname, '../fixture/ready-test.html');
var jqueryMin = path.resolve(__dirname, '../fixture/jquery.min.txt');
var simpleHtml = path.resolve(__dirname, '../fixture/ready-simple.html');
var missing = path.resolve(__dirname, '../fixture/ready-missing.html');
var timeout = path.resolve(__dirname, '../fixture/ready-timeout.html');
var timeoutDom = path.resolve(__dirname, '../fixture/ready-dom-timeout.html');

router.get('/dynamic', function() {
  this.req.pipe(filed(ready)).pipe(this.res);
});

router.get('/jquery.min.js', function() {
  this.req.pipe(filed({
    path: jqueryMin,
    mimetype: 'application/javascript'
  })).pipe(this.res);
});

router.get('/notfound', function() {
  this.req.pipe(filed(missing)).pipe(this.res);
});

router.get('/missing.js', function() {
  var res = this.res;
  res.writeHead(404);
  res.end();
});

router.get('/simple', function() {
  this.req.pipe(filed(simpleHtml)).pipe(this.res);
});

router.get('/http-redirect', function() {
  this.res.statusCode = 302;
  this.res.setHeader('content-type', 'text/html');
  this.res.setHeader('location', '/simple');
  this.res.end();
});

router.get('/html-redirect', function() {
  this.res.setHeader('content-type', 'text/html');
  this.res.end('<meta http-equiv="refresh" content="0; url=/simple">');
});

router.get('/timeout', function() {
  var res = this.res;

  this.req.pipe(filed(timeout)).pipe(this.res);
});

router.get('/timeout-dom', function() {
  var res = this.res;

  this.req.pipe(filed(timeoutDom)).pipe(this.res);
});

function resourceObject(resources, expected) {
  var obj = {}, id;

  for (var i = 0; i < expected.length; i++) {
    for (var n in resources) {
      if (expected[i].url === resources[n].url) {
        id = n;
        break;
      }
    }

    obj[id] = expected[i];
    obj[id].time = resources[id].time;
  }

  for (var n in resources) {
    if (!resources[n].url) obj[n] = resources[n];
  }

  return obj;
}

server.on('request', router.dispatch.bind(router));
server.listen(0, function() {
  var host = 'http://127.0.0.1:' + server.address().port;

  var chrome = browser(function() {

    test('enable events', function (t) {
      chrome.inspector.Network.enable(function () {
        chrome.inspector.Page.enable(function () {
          t.end();
        });
      });
    });

    // In this test /dyn is request at domReady and /dyn2 is requested
    // after a 1000 ms timeout. Note plugins.ready shouldn't wait for dyn2
    // to be loaded.
    test('loads all resources for a page', function(t) {
      var dynCalled = false;
      var dyn2Called = false;

      router.get('/dyn', function() {
        dynCalled = true;
        this.res.end();
      });

      router.get('/dyn2', function() {
        dyn2Called = true;
        this.res.end();
      });

      chrome.inspector.Page.navigate(host + '/dynamic', function(err) {
       t.equal(err, null);

        loaded(chrome, function(err, resources) {
          t.equal(err, null);

          t.deepEqual(resources, resourceObject(resources, [
            {
              url: host + '/dynamic',
              received: true,
              loaded: true,
              timeout: false,
              failed: false,
              type: 'document',
              cache: false,
              mime: 'text/html',
              method: undefined,
              statusCode: 200
            }, {
              url: host + '/jquery.min.js',
              received: true,
              loaded: true,
              timeout: false,
              failed: false,
              type: 'script',
              mime: 'application/javascript',
              cache: false,
              method: 'GET',
              statusCode: 200
            }, {
              url: host + '/dyn',
              received: true,
              loaded: true,
              timeout: false,
              failed: false,
              type: 'xhr',
              mime: 'text/plain',
              cache: false,
              method: 'GET',
              statusCode: 200
            }
          ]));

          t.ok(dynCalled, '/dyn should be called');
          t.equal(dyn2Called, false, '/dyn2 should not be called');

          t.end();
        });
      });
    });

    // This navigates to a page, there has a jQuery resource and a 404
    // resource, the expected result is that both loaded and the callback
    // is fired. The resource statusCode property should also be 404 for
    // the missing.js file.
    test('loading an html page which has a 404 resource', function(t) {

      chrome.inspector.Page.navigate(host + '/notfound', function(err) {
        t.equal(err, null);

        loaded(chrome, function(err, resources) {
          t.equal(err, null);

          t.deepEqual(resources, resourceObject(resources, [
            {
              url: host + '/notfound',
              received: true,
              loaded: true,
              timeout: false,
              failed: false,
              type: 'document',
              mime: 'text/html',
              cache: false,
              method: undefined,
              statusCode: 200
            }, {
              url: host + '/missing.js',
              received: true,
              loaded: false,
              timeout: false,
              failed: true,
              type: 'script',
              mime: 'text/plain',
              cache: false,
              method: 'GET',
              statusCode: 404
            }, {
              url: host + '/jquery.min.js',
              received: true,
              loaded: true,
              timeout: false,
              failed: false,
              type: 'script',
              mime: 'application/javascript',
              cache: false,
              method: 'GET',
              statusCode: 200
            }
          ]));

          t.end();
        });
      });
    });

    test('test script timeout being invoked', {timeout: 6000}, function(t) {

      var timer;
      var timeoutCalled = false;

      router.get('/timeout-image', function() {
        var res = this.res;

        timer = setTimeout(function() {
          timeoutCalled = true;
          res.end('clearly an image');
        }, 5000);
      });

      chrome.inspector.Page.navigate(host + '/timeout', function(err) {
        t.equal(err, null);

        loaded(chrome, function(err, resources) {
          t.equal(err, null);

          // the process hangs for some time, clearing the timer
          // allows it to close right away.
          clearTimeout(timer);

          t.deepEqual(resources, resourceObject(resources, [
            {
              url: host + '/timeout',
              received: true,
              loaded: true,
              timeout: false,
              failed: false,
              type: 'document',
              mime: 'text/html',
              cache: false,
              method: undefined,
              statusCode: 200
            }, {
              url: host + '/timeout-image',
              received: false,
              loaded: false,
              timeout: true,
              failed: false,
              type: undefined,
              mime: undefined,
              cache: undefined,
              method: 'GET',
              statusCode: undefined
            }
          ]));

          t.equal(timeoutCalled, false, 'resource did not finish');

          t.end();
        });
      });
    });

    // NOTE: chrome have changed behaviour and dosn't wait for the scripts.
    // I don't think this is the W3C standard behaviour, thus the old
    // behaviour may come back.
    /*
    // This navigates to a page there request a very slow resource
    // (done after 5000 ms). Since this is beyond the allowed time
    // the plugin.ready callback shoudn't wait.
    test('test dom timeout being invoked', {timeout: 30000}, function(t) {
      var timers = [];

      router.get('/timeout/script/*', function() {
        var res = this.res;

        var timer = setTimeout(function() {
          res.end('// loaded');
        }, 1800);

        timers.push(timer);
      });

      chrome.inspector.Page.navigate(host + '/timeout-dom', function(err) {
        t.equal(err, null);

        loaded(chrome, function(err, resources) {
          t.equal(err.message, 'domContentEventFired timed out after 20 seconds');

          // the process hangs for some time, clearing the timer
          // allows it to close right away.
          timers.forEach(function(timer) {
            clearTimeout(timer);
          });

          // The resources object is inconsistent in this case
          // and won't be tested here.

          // That was a bunch of stuff, a cleanup is needed
          chrome.inspector.Page.navigate('about:blank', function(err) {
            setTimeout(function () {
              t.end();
            }, 100);
          });
        });
      });
    });
    */

    test('test a simple html with no other resources', function(t) {
      var domContentEventFired = false;

      chrome.inspector.Page.once('domContentEventFired', function() {
        domContentEventFired = true;
      });

      chrome.inspector.Page.navigate(host + '/simple', function(err) {
        t.equal(err, null);

        loaded(chrome, function(err, resources) {
          t.equal(err, null);

          t.deepEqual(resources, resourceObject(resources, [
            {
              url: host + '/simple',
              received: true,
              loaded: true,
              timeout: false,
              failed: false,
              type: 'document',
              mime: 'text/html',
              cache: false,
              method: undefined,
              statusCode: 200
            }
          ]));

          t.ok(domContentEventFired, 'dom ready fired');

          t.end();
        });
      });
    });

    test('test http redirection', function(t) {

      chrome.inspector.Page.navigate(host + '/http-redirect', function(err) {
        t.equal(err, null);

        loaded(chrome, function(err, resources) {
          t.equal(err, null);

          t.deepEqual(resources, resourceObject(resources, [
            {
              url: host + '/simple',
              received: true,
              loaded: true,
              timeout: false,
              failed: false,
              type: 'document',
              mime: 'text/html',
              cache: true,
              method: 'GET',
              statusCode: 200
            }
          ]));

          t.end();
        });
      });
    });

    test('test html redirection', function(t) {

      chrome.inspector.Page.navigate(host + '/html-redirect', function(err) {
        t.equal(err, null);

        loaded(chrome, function(err, resources) {
          t.equal(err, null);

          t.deepEqual(resources, resourceObject(resources, [
            {
              url: host + '/html-redirect',
              received: true,
              loaded: true,
              timeout: false,
              failed: false,
              type: 'document',
              mime: 'text/html',
              cache: false,
              method: undefined,
              statusCode: 200
            },
            {
              url: host + '/simple',
              received: true,
              loaded: true,
              timeout: false,
              failed: false,
              type: 'document',
              mime: 'text/html',
              cache: true,
              method: 'GET',
              statusCode: 200
            }
          ]));

          t.end();
        });
      });
    });

    test('close chromium', function(t) {
      chrome.close(function() {
        server.close(function() {
          t.end();
        });
      });
    });
  });
});

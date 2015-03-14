
var hash = require('hashish');
var util = require('util');
var events = require('events');

/*
Plug-in to determine when a page is completely done loading. Although this is
only an approximation and will declare the page fully loaded after all resources
used have been given a fair chance to load. Each individual resource is given
2 seconds to load.
*/
function ResourceList() {
  events.EventEmitter.call(this);

  this.resources = {};

  // Because the request ID isn't always known some checks fallback to the
  // url as the resource idenfifier. But because this state is usually
  // temporarily a persistent list of resource urls is keept here.
  this.added = [];
}
util.inherits(ResourceList, events.EventEmitter);

//
// Helper function
//
ResourceList.prototype.getUrl = function(info) {
  var obj = info.request || info.response;
  if (obj) {
    return obj.url;
  }
};

ResourceList.prototype.trackingRequest = function(info) {
  return this.resources.hasOwnProperty(info.requestId);
};

//
// Base resource object
//
ResourceList.prototype.getResourceObject = function(info) {
  if (this.trackingRequest(info) === false) {
    this.add(info);
  }

  return this.resources[info.requestId];
};

ResourceList.prototype.addResourceObject = function(key, url) {
  var self = this;

  var resource = this.resources[key] = {
    url: url,

    // request status
    received: false,
    timeout: false,
    loaded: false,
    failed: false,

    // this is meta data, there will be added when the resource is recived
    type: undefined,
    mime: undefined,
    cache: undefined,
    method: undefined,
    statusCode: undefined,

    // Internal object containing timestamp tracking information
    // all values are in milliseconds
    timestamp: {},

    // timer key
    timer: setTimeout(function() {
      self.timeout(resource);
    }, 2000)
  };
};

//
// Add and remove url from scheduled list
//
// This method add a resource object with the url as its identifier
ResourceList.prototype.schedule = function(url) {
  if (this.resources === null) return;

  if (this.added.indexOf(url) === -1) {
    this.added.push(url);
    this.addResourceObject(url, url);
  }
};

//
//
// This method removes a resource object with the url as its identifier
// This should always be followed by a call to `addResourceObject` where
// the identifier is the request ID.
ResourceList.prototype.progress = function(url) {
  if (this.resources === null) return;

  if (this.added.indexOf(url) === -1) {
    this.added.push(url);
  }

  if (this.resources.hasOwnProperty(url)) {
    clearTimeout(this.resources[url].timer);
    delete this.resources[url];
  }
};

//
// Request object handlers
//
ResourceList.prototype.add = function(info) {
    if (this.resources === null) return;

  // Stop if this is already being tracked
  if (this.trackingRequest(info)) return;

  var url = this.getUrl(info);

  if (url) this.progress(url);

  // in case url was unknown it will just be set to undefined
  this.addResourceObject(info.requestId, url);
};

ResourceList.prototype.request = function(info) {
  var self = this;

  if (this.resources === null) return;

  // get the resource matching the request
  var resource = this.getResourceObject(info);
      resource.method = info.request.method;
      resource.timestamp.request = info.timestamp * 1000;

  // Extend timer to 5000 seconds if method is POST
  // The reason is that we can't expect cacheing of any kind and that
  // some data will have to be intrepeted by the server.
  if (resource.method !== 'POST') return;

  // but only if the resource hasn't been rescived yet.
  if (resource.received || resource.timeout ||
    resource.loaded || resource.failed) {
    return;
  }

  clearTimeout(resource.timer);
  resource.timer = setTimeout(function() {
    self.timeout(resource);
  }, 5000);
};

ResourceList.prototype.received = function(info) {
  if (this.resources === null) return;

  // get the resource matching the request
  var resource = this.getResourceObject(info);

  var url = this.getUrl(info);

  // the resource is already received, stop here
  // Note: if resource.timeout was set, we stil wan't to add the resources
  // it will just be indicated that it hit the timeout and was received later
  if (resource.received) return;
  resource.received = true;

  // If the resource was added by .loaded before .add was called
  if (url) {
    resource.url = url;
    this.progress(url);
  }

  // Note: sometimes the info object lacks information, a minimal typecheck
  // should always exist.
  if (typeof info.type === 'string') {
    resource.type = info.type.toLowerCase();
  }

  // Set and calculate the time values
  resource.timestamp.response = info.timestamp * 1000;

  resource.cache = info.response.fromDiskCache;
  resource.statusCode = info.response.status;
  resource.mime = info.response.mimeType;

  // stop the timeout, now that the resource is loaded
  clearTimeout(resource.timer);

  this.emit('maybeLoaded');
};

ResourceList.prototype.timeout = function(resource) {
  if (this.resources === null) return;

  if (resource.timeout) return;
  resource.timeout = true;

  this.emit('maybeLoaded');
};

ResourceList.prototype.loaded = function(info) {
  if (this.resources === null) return;

  // get the resource matching the request
  var resource = this.getResourceObject(info);
      resource.timestamp.loaded = info.timestamp * 1000;

  if (resource.loaded) return;
  resource.loaded = true;

  // stop the timeout, now that the resource is loaded
  clearTimeout(resource.timer);

  this.emit('maybeLoaded');
};

ResourceList.prototype.failed = function(info) {
  if (this.resources === null) return;

  // get the resource matching the request
  var resource = this.getResourceObject(info);
      resource.timestamp.failed = info.timestamp * 1000;

  if (resource.failed) return;
  resource.failed = true;

  // stop the timeout, now that the resource is loaded
  clearTimeout(resource.timer);

  this.emit('maybeLoaded');
};

//
// Public end functions
//
ResourceList.prototype.flush = function() {
  if (this.resources === null) return;

  hash.forEach(this.resources, function(resource) {
    clearTimeout(resource.timer);
  });

  this.resources = null;
};

function calculateTime(timestamp) {
  if (timestamp.request === undefined) return;

  var latest = Math.max(
    timestamp.loaded || -1,
    timestamp.response || -1,
    timestamp.failed || -1
  );

  // A timestamp can not be less than 0
  if (latest < 0) return;

  return latest - timestamp.request;
}

ResourceList.prototype.exportData = function() {
  if (this.resources === null) throw new Error('data flushed');

  return hash.map(this.resources, function(resource) {
    return {
      url: resource.url,

      // request status
      received: resource.received,
      timeout: resource.timeout,
      loaded: resource.loaded,
      failed: resource.failed,

      // this is meta data, there will be added when the
      // resource is recived
      type: resource.type,
      time: calculateTime(resource.timestamp),
      mime: resource.mime,
      cache: resource.cache,
      method: resource.method,
      statusCode: resource.statusCode
    };
  });
};

ResourceList.prototype.allLoaded = function() {
  if (this.resources === null) return true;

  var active = hash.some(this.resources, function(resource) {
    return (resource.received === false &&
            resource.timeout === false &&
            resource.loaded === false &&
            resource.failed === false);
  });

  return !active;
};

module.exports = function loaded(browser, callback) {
  var resources = new ResourceList();
  var domContentEventFired = false;
  var callbackFired = false;

  function done(err) {
    if (callbackFired) return;
    callbackFired = true;

    var data = resources.exportData();

    resources.flush();

    resources.removeListener('maybeLoaded', checkIfDone);
    browser.inspector.Network.removeListener('requestWillBeSent', prepareForRequest);
    browser.inspector.Network.removeListener('responseReceived', handleResponse);
    browser.inspector.Network.removeListener('requestServedFromMemoryCache', handleMemory);
    browser.inspector.Network.removeListener('requestServedFromCache', handleCache);
    browser.inspector.Network.removeListener('loadingFinished', loadingFinished);
    browser.inspector.Network.removeListener('loadingFailed', loadingFailed);

    callback(err, data);
  }

  // this will emit once a resource is loaded or got reached a timeout
  function checkIfDone() {
    if (domContentEventFired && resources.allLoaded() && !callbackFired) {

      browser.inspector.Page.getResourceTree(function(err, tree) {
        if (err) return done(err);

        tree.frameTree.resources.forEach(function(val) {
          resources.schedule(val.url);
        });

        if (resources.allLoaded()) {
          done(null);
        }
      });
    }
  }
  resources.on('maybeLoaded', checkIfDone);

  // Dom content event must be fired! If a site don't emit this event
  // within 20 seconds, just bail out with a big error.
  function domContentFired() {
    // Cleanup the domready timeout handler
    clearTimeout(domReadyTimer);

    domContentEventFired = true;
    checkIfDone();
  }
  function domReadyTimeout() {
    // Cleanup the event listener
    browser.inspector.Page.removeListener('domContentEventFired', domContentFired);

    // Something is very wrong and we won't be able to access the DOM
    // return an error.
    done(new Error('domContentEventFired timed out after 20 seconds'));
  }
  var domReadyTimer = setTimeout(domReadyTimeout, 20000);
  browser.inspector.Page.once('domContentEventFired', domContentFired);

  // Add resource to the long list
  function prepareForRequest(data) {
    resources.request(data);
  }
  browser.inspector.Network.on('requestWillBeSent', prepareForRequest);

  // Resources has been loaded, check for new resources
  function handleResponse(data) {
    resources.received(data);
  }
  browser.inspector.Network.on('responseReceived', handleResponse);

  // Resource has been loaded from memory
  function handleMemory(data) {
    // create a fake resource object from the memory information
    var resource = data.resource;
    resource.requestId = data.requestId;
    resource.frameId = data.frameId;
    resource.loaderId = data.loaderId;
    resource.documentURL = data.documentURL;
    resource.timestamp = data.timestamp;
    resource.initiator = data.initiator;

    resources.received(resource);
  }
  browser.inspector.Network.on('requestServedFromMemoryCache', handleMemory);

  function handleCache(data) {
    resources.loaded(data);
  }
  browser.inspector.Network.on('requestServedFromCache', handleCache);

  function loadingFinished(data) {
    resources.loaded(data);
  }
  browser.inspector.Network.on('loadingFinished', loadingFinished);

  function loadingFailed(data) {
    resources.failed(data);
  }
  browser.inspector.Network.on('loadingFailed', loadingFailed);
};

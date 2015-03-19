#steer-loaded

> Heuristic for detecting when a page is loaded in google chrome

## Installation

```sheel
npm install steer-loaded
```

## Dependencies

Be sure to check out the requirements for `steer`.

## Documentation

Detecting when a page is loaded is quite complicated. You can't just listen
to `onload` because some javascript may wait for this event to be fired and
then render the page or make additional AJAX calls. This is ofcause a bad
behaviour, never or less I see it quite often. `steer-loaded` listens to
all requests and tries to determine when the page is actually don loading.

```javascript
var path = require('path');
var steer = require('steer');
var loaded = require('steer-loaded');

var chrome = steer({
  cache: path.resolve(__dirname, 'cache'),
  inspectorPort: 7510
});

chrome.once('open', function () {

  // Network and Page events need to be enabled
  chrome.inspector.Network.enable(function (err) {
    if (err) throw err;

    chrome.inspector.Page.enable(function (err) {
      if (err) throw err;

      // Navigate to page
      chrome.inspector.Page.navigate('http://google.dk', function (err) {
        if (err) throw err;

        // Tell when page is loaded
        loaded(chrome, function (err, resources) {
          if (err) throw err;

          // A list of resources there where loaded, primarily used for
          // debuggging and testing but can be usefull.
          console.log(resources);
        });
      });
    });
  });
});
```

##License

**The software is license under "MIT"**

> Copyright (c) 2014 Peter V. T. Schlegel
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
> THE SOFTWARE.

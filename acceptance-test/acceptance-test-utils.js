var wd = require('wd');
var url =require('url');
var app = require('../app');
var appMysql = require('../lib/mysql');
var prepareDatabase = require('../test').prepareDatabase;

var APP_PORT = parseInt(process.env['WEBDRIVER_APP_PORT'] || 8888);
var APP_URL = process.env['WEBDRIVER_APP_URL'] || 'http://localhost:8888';
var BROWSER = process.env['WEBDRIVER_BROWSER'] || 'firefox';
var HOST = process.env['WEBDRIVER_HOST'] || 'localhost';
var PORT = parseInt(process.env['WEBDRIVER_PORT'] || 4444);

exports.test = function test(name, fn) {
  prepareDatabase(function() {
    app.listen(APP_PORT, function() {
      browser = wd.remote(HOST, PORT);

      browser.on('status', function(info) {
        console.log(info.cyan);
      });

      browser.on('command', function(meth, path, data) {
        console.log(' > ' + meth.yellow, path.grey, data || '');
      });

      var t = {
        browser: browser,
        resolve: function(path) {
          return url.resolve(APP_URL, path);
        },
        end: function(testErr) {
          if (testErr)
            console.error(testErr.toString());
          browser.quit(function(browserErr) {
            var exitCode = testErr || browserErr ? 1 : 0;
            if (browserErr)
              console.error("browser.quit() failed: " + browserErr);
            app.close();
            appMysql.client.destroy();
            console.log("Test '" + name + "' " +
                        (exitCode ? "failed." : "succeeded."));
            process.exit(exitCode);
          });
        }
      };

      unboundActions.forEach(function(action) {
        t[action.name] = bindAction(t, action);
      });

      browser.init({
        browserName: BROWSER,
        tags: [],
        name: name
      }, function(err) {
        if (err) throw err;
        fn(t);
      });
    });
  });
};

function bindAction(t, fn) {
  var boundFunction = fn.bind(this, t);

  return function() {
    if (arguments.length) {
      if (typeof(arguments[arguments.length-1]) == 'function')
        return boundFunction.apply(this, arguments);
    }

    for (var i = 0; i < arguments.length; i++)
      boundFunction = boundFunction.bind(this, arguments[i]);
    return boundFunction;
  };
}

var unboundActions = [
  function open(t, path, cb) {
    t.browser.get(t.resolve(path), cb);
  },
  function click(t, cssSelector, cb) {
    t.browser.elementByCssSelector(cssSelector, function(err, el) {
      if (err) return cb(err);
      el.click(cb);
    });
  },
  function waitForVisibleContent(t, options, cb) {
    function collapseWhitespace(text) {
      return text.replace(/\n/g, ' ').replace(/\s+/g, ' ');
    }

    var cssSelector = options.selector;
    t.browser.waitForVisibleByCssSelector(
      cssSelector, t.timeout, function(err) {
        if (err) return cb(err);
        t.browser.elementByCssSelector(cssSelector, function(err, el) {
          if (err) return cb(err);
          t.browser.text(el, function(err, text) {
            var msg = "text '" + text + "' contains '" +
                      options.content + "': "; 

            if (err) return cb(err);
            if (collapseWhitespace(text).indexOf(options.content) == -1) {
              console.error(msg + "FAIL");
              return cb(new Error("assertion failure"));
            }
            console.log(msg + "SUCCESS");
            cb(null);
          });
        });
      }
    );
  }
];

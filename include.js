(function(scope) {
  var defaultPath = location.href,
    sameOrigin = new RegExp('^' + location.origin.replace(/\./g, '\\.')),
    pending = {},
    deferred = {},
    included = {},
    failed = {},
    defaults = {
      'mode': 'cors',
      'cache': 'default',
      'version': 0,
      'expires': true,
      'store': false
    },
    typeDefaults = {
      'script': {},
      'style': {},
      'html': {},
      'json': {},
      'text': {}
    },
    masterType = {
      'script': 'script',
      'style': 'style',
      'html': 'html',
      'json': 'json',
      'text': 'text'
    },
    types = {
      //method for loading javascript
      'script': function includeScriptLoader(filename, options, resolve, reject) {
        var s = options.parent || document.getElementsByTagName('script')[0].parentNode;
        var i = document.createElement('script');
        i.async = i.defer = true;
        //can't fetch/store external scripts
        if (options.store && !filename.match(/^(http|file)/)) {
          include.fetch(filename, options,'script').then(function(content) {
              //add sourceURL for easier debugging
              i.innerHTML = '//# sourceURL=' + filename + '\n\n' + content;
              s.appendChild(i);
              resolve(true);
            },
            reject);
        } else {
          i.onload = function(e) {
            //stop double firing
            this.onreadystatechange = null;
            resolve('onload');
          }
          i.onerror = function(e) {
            //stop double firing
            this.onreadystatechange = null;
            reject(e);
          }
          i.onreadystatechange = function(e) {
            if (this.readyState == "complete") {
              //stop IE<9 from double firing.
              this.onload = this.onerror = null;
              resolve('readystate');
            }
          }
          i.src = filename;
          s.parentNode.insertBefore(i, s);
        }
      },
      //method for loading stylesheets
      'style': function includeStyleLoader(filename, options, resolve, reject) {
        var s = options.parent || document.getElementsByTagName('head')[0] || document.doumentElement;
        var i = document.createElement('link');
        //can't fetch/store external scripts
        if (options.store && !filename.match(/^(http|file)/)) {
          include.fetch(filename, options, 'style').then(function(content) {
              i = document.createElement('style');
              //add sourceURL for easier debugging
              i.innerHTML = '/*# sourceURL=' + filename + ' */\n\n' + content;
              s.appendChild(i);
              resolve(true);
            },
            reject);
        } else {
          i.onload = function(e) {
            this.onreadystatechange = null;
            resolve('onload');
          }
          i.onerror = function(e) {
            this.onreadystatechange = null;
            reject(e);
          }
          i.onreadystatechange = function(e) {
            if (this.readyState == "complete") {
              this.onload = this.onerror = null;
              resolve('readystate');
            }
          }
          i.rel = 'stylesheet';
          i.type = 'text/css';
          i.href = filename;
          s.appendChild(i);
        }
      },
      // method for loading html
      'html': function includeHtmlLoader(filename, options, resolve, reject) {
        //attempt to load it via fetch
        include.fetch(filename, options,'html').then(function(content) {
            var d = document.createElement('div'),
              f = document.createDocumentFragment();
            d.innerHTML = content;
            while (d.firstChild) {
              f.appendChild(d.firstChild);
            }
            //return a documentFragment from the loaded html.
            resolve(f);
          },
          reject);
      },
      'json': function inncludeJsonLoader(filename, options, resolve, reject) {
        //attempt to load via fetching
        include.fetch(filename, options,'json').then(function(content) {
            resolve(JSON.parse(content));
          },
          reject);
      },
      // method for loading text/unknown content
      'text': function includeHtmlLoader(filename, options, resolve, reject) {
        //attempt to load it via fetch and return content
        include.fetch(filename, options,'text').then(resolve, reject);
      }
    },
    localStorage,sessionStorage;
  function getDefaultOptions(options, type) {
    var keys;
    if (type && masterType[type] && typeDefaults[masterType[type]]) {
      var defs = typeDefaults[masterType[type]];
      keys = Object.keys(defs);
      for (var i = 0; i < keys.length; i++) {
        if (!options.hasOwnProperty[keys[i]]) {
          options[keys[i]] = defs[keys[i]];
        }
      }
    }
    keys = Object.keys(defaults);
    for (i = 0; i < keys.length; i++) {
      if (!options.hasOwnProperty[keys[i]]) {
        options[keys[i]] = defaults[keys[i]];
      }
    }
    return options;
  }

  masterType['js'] = masterType['javascript'] = 'script';
  masterType['css'] = masterType['stylesheet'] = 'style';
  masterType['htm'] = 'html';
  masterType['txt'] = 'text';

  try {
    //accessing localStorage in data:, about:, or file: schemas throws an error
    localStorage = localStorage;
    sessionStorage = sessionStorage;
    //on the off chance this browser doesn't have localstorage, this will throw too.
    localStorage.getItem('foo');
    sessionStorage.getItem('foo');
  } catch (e) {
    //if localStorage isn't a thing, create dummy methods.
    localStorage = sessionStorage = {
      'getItem': function() {
        return null
      },
      'setItem': function() {},
      'removeItem': function() {}
    }
  }

  // Main function
  scope.include = function include(filename, type, options, callback) {
    //just a filename
    if (!callback && !options && !type) {
      type = '?'; //flag to use file extension
      options = {};
    }
    //filename and callback
    else if (!callback && !options && typeof type === 'function') {
      callback = type;
      options = {};
      type = '?';
    }
    //filename and options
    else if (!callback && !options && typeof type !== 'string') {
      options = type;
      type = '?';
    }
    //filename, type, and callback
    else if (!callback && typeof type === 'string' && typeof options === 'function') {
      callback = options;
      options = {};
    }
    //filename, options, and callback
    else if (!callback && typeof type !== 'string' && typeof options === 'function') {
      callback = options;
      options = type;
      type = '?';
    }
    //filename and type or
    //filename, type, and options or
    //filename, type, options, and callback
    type = String(type);

    var promise;
    //multiple filenames provided
    if (Array.isArray(filename)) {
      var internal = [];
      for (var i = 0; i < filename.length; i++) {
        internal.push(scope.include(filename[i], type, options)); //don't send the callback
      }
      promise = Promise.all(internal);
    }
    //filename not provided or not a string (resolve filename to the full URL if it is a string);
    else if (!(filename = (filename === String(filename)) && include.extendedUrl(filename))) {
      //return an error in a rejected Promise
      promise = Promise.reject(new TypeError("filename must be a String"));
    }
    //filename previously included
    else if (typeof included[filename] !== 'undefined') {
      //return the result of that include in a Promise.
      promise = failed[filename] ? Promise.reject(included[filename]) : Promise.resolve(included[filename]);
    }
    //filename is pending or hasn't been included yet.
    else {
      if (type = '?') {
        var extensions = filename.toLowerCase().split('.');
        // allow type resolvers to have multiple parts
        // so 'template.html' will be different than 'html'
        do {
          extensions.shift();
          type = masterType[extensions.join('.')];
        } while (!type && extensions.length || (type = 'text'))
      }
      else {
        type = masterType[type.toLowerCase()] || 'text';
      }
      var typeResolver = types[type];
      options = getDefaultOptions(options || {}, type);
      //return the pending promise or a new Promise
      promise = pending[filename] = pending[filename] || new Promise(function includeResolver(resolve, reject) {
        //on success
        function includeResolverLoad(event) {
          delete pending[filename];
          if (deferred[filename]) {
            //wait for include.register to manually resolve this promise
            deferred[filename] = resolve;
          } else {
            //only if the file hasn't registered itself.
            if (typeof included[filename] !== 'undefined') {
              include.register(filename, true);
            }
            resolve(included[filename]);
          }
        }
        //on fail
        function includeResolverError(error) {
          delete pending[filename];
          delete deferred[filename];
          include.register(filename, error);
          failed[filename] = true;
          reject(error);
        }
        //load the file type
        typeResolver(filename, options, includeResolverLoad, includeResolverError);
      });
    }
    //if a callback function was passed in
    if (typeof callback === 'function') {
      //use the promise to fire it off
      promise.then(function(success) {
        callback(null, success);
      }, callback); //use dual argument form of then to avoid 'catch' reserved word issues in IE < 9
    }
    return promise;
  }
  //STATIC METHODS
  //set a default path to resolve includes from, relative to the calling page
  scope.include.defaultPath = function includeDefaultPath(path) {
    defaultPath = new URL(path, location.href).href;
  }
  //resolve the filename to it's full path, removing the origin if it matches the local one.
  scope.include.extendedUrl = function includeExtendedUrl(filename) {
    return new URL(filename, defaultPath).href.replace(sameOrigin, '');
  }
  //update default options. Optionally set type specific defaults
  scope.include.defaultOptions = function includeDefaultOptions(options, type) {
    if (options) {
      var keys = Object.keys(options);
      var defs = type === ''+type && masterType[type.toLowerCase()] ? typeDefaults[masterType[type.toLowerCase()]] : defaults;
      for (i = 0; i < keys.length; i++) {
        if (options.hasOwnProperty[keys[i]]) {
          defs[keys[i]] = options[keys[i]];
        }
      }
    }
  }
  //load filename if check is false, otherwise return a resolved promise
  scope.include.polyfill = function includePolyfill(check, filename, type, options, callback) {
    var promise;
    if (!check) {
      promise = scope.include(filename, type, options, callback);
    } else {
      if (!Array.isArray(filename)) {
        filename = scope.include.extendedUrl(filename);
        if (typeof included[filename] !== 'undefined') {
          check = included[filename];
        }
        promise = Promise.resolve(check);
      } else {
        var internal = [];
        for (var i = 0; i < filename.length; i++) {
          internal.push(scope.include.polyfill(check, filename[i]));
        }
        promise = Promise.all(internal);
      }
    }
    return promise;
  }
  //return a function that returns an include promise, for chaining
  scope.include.next = function includeNext(filename, type, options, callback) {
    var args = arguments;
    return function nextWrapper() {
      return scope.include(filename, type, option, callback);
    }
  }
  //extend the file types you can load
  scope.include.typeLoader = function includeTypeLoader(type, loader, defaultOptions) {
    if (Array.isArray(type)) {
      //send the first type with loader and defaults
      scope.include.typeLoader(type[0], loader, defaults);
      // and associate all the others with that first entry.
      for (var i = 1; i < type.length; i++) {
        scope.include.typeLoader(type[i], type[0]);
      }
      return;
    } else {
      type = String(type).toLowerString();
      //adding new type or overriding the laoder of an existing type.
      if (typeof loader === 'function') {
        //if no master type associated to type, assume it's a new masterType
        if (!masterType[type]) {
          masterType[type] = type;
          typeDefaults[type] = {};
        }
        types[masterType[type]] = loader;
        if (defaultOptions) {
          scope.include.defaultOptions(defaultOptions, type);
        }
      }
      //associating a new type with an existing loader type.
      else if (loader === String(loader) && masterType[loader.toLowerCase()]) {
        masterType[type] = masterType[loader.toLowerCase()];
      } else {
        throw TypeError("unknown loader type " + String(loader))
      }
    }
  }
  //allow external scripts to manually delay their registration,
  scope.include.defer = function includeDefer(filename) {
    filename = include.extendedUrl(filename);
    //placeholder function, in case register somehow gets called prior to pending returning
    //it will be replaced with the resolve function passed to the pending[filename] promise.
    deferred[filename] = function dummy() {};
  }
  //allow external scripts to manually register themselves
  //and optionally return custom objects for resolved filenames
  //also used with include.defer to delay registering a loaded file.
  scope.include.register = function includeRegister(filename, result) {
    filename = include.extendedUrl(filename);
    // if method it wasn't provided, then assume true. otherwise store the value.
    included[filename] = typeof result === 'undefined' ? true : result;
    if (deferred[filename]) {
      //this should be a promise's resolve function
      deferred[filename](included[filename]);
      delete deferred[filename];
    }
  }
  //clear out the internal results of prevously loaded files
  scope.include.flush = function includeFlush(filename) {
    if (!filename) {
      filename = Object.keys(included).concat(Object.keys(failed));
    } else {
      filename = arguments;
    }
    for (var i = 0; i < filename.length; i++) {
      var file = include.extendedUrl(filename[i]);
      delete included[file];
      delete failed[file];
      storage.removeItem(file);
    }
  }
  //get the result of a loaded file.
  scope.include.retrieve = function includeRetrieve(filename) {
    filename = include.extendedUrl(filename);
    return failed[filename] || included[filename];
  }
  //get the list of loaded filenames
  scope.include.filenames = function includeFilenames(includePending) {
    return Object.keys(included).concat(includePending ? Object.keys(pending) : []);
  }
  //load a file using the fetch api. Thows an error for 4xx & 5xx staus codes.
  scope.include.fetch = function includeFetch(filename, options, type) {
    options = getDefaultOptions(options || {}, type);
    var storage = (store == ''+store && store.toLowerCase() === 'session' ? sessionStorage : localStorage);
    if (options.store &&
      (stored = storage.getItem(filename))) {
      if ((options.version && options.version <= stored.version) ||
        (options.expires && stored.expires >= Date.now())) {
        return Promise.resolve(stored.value)
      }
    }
    var init = {
      method: 'GET',
      headers: new Headers(),
      mode: options.mode,
      cache: options.cache
    };
    return fetch(filename, init).then(
      function postIncludeFetch(response) {
        if (!response.ok) {
          throw new TypeError(response.status + ': ' + response.statusText);
        } else {
          if (options.store) {
            var stored = {
              'value': text,
              'version': options.version || null,
              'expires': options.expires ? Date.now() + (options.expires === !!options.expires ? 172800 /*48 hrs*/ : options.expires) : null
            }
            storage.setItem(filename, stored);
          }
          return response.text();
        }
      }
    );
  }
})(window);

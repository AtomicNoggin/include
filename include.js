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
    storage;
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
    storage = localStorage;
    //on the off chance this browser doesn't have localstorage, this will throw too.
    storage.getItem('foo');
  } catch (e) {
    //if localStorage isn't a thing, create dummy methods.
    storage = {
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
        } while (!type && extensions.length || type = 'text')
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
  //update default options. Optionally send type specific defaults
  scope.include.defaultOptions = function includeDefaultOptions(options, type) {
    if (options) {
      var keys = Object.keys(options);
      var defs = type === String(type) && masterType[type.toLowerCase()] ? typeDefaults[masterType[type.toLowerCase()]] : defaults;
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
        if (typeof included[filename] !== 'undefined')) {
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
/*
 * Object.keys Polyfill
 * From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/keys
 */
Object.keys||(Object.keys = function(){"use strict";var t=Object.prototype.hasOwnProperty,e=!{toString: null}.propertyIsEnumerable("toString"),s=["toString","toLocaleString","valueOf","hasOwnProperty","isPrototypeOf","propertyIsEnumerable","constructor"],i=s.length;return function(a){if("function"!=typeof a&&("object"!=typeof a||null===a)) throw new TypeError("Object.keys called on non-object");var r,h,n=[]; for(r in a)t.call(a,r)&&n.push(r);if(e)for(h=0;h<i;h++)t.call(a,s[h])&&n.push(s[h]);return n}}());
/*
 * Array.isArray Polyfill
 * From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/isArray
 */
Array.isArray||(Array.isArray=function(e){return "[object Array]"===Object.prototype.toString.call(e)});
/*
 * URL Polyfill
 * https://github.com/webcomponents/URL
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
!function(t){"use strict";function e(t){return void 0!==c[t]}function s(){n.call(this),this._isInvalid=!0}function i(t){return""==t&&s.call(this),t.toLowerCase()}function a(t){var e=t.charCodeAt(0);return e>32&&e<127&&-1==[34,35,60,62,63,96].indexOf(e)?t:encodeURIComponent(t)}function h(t){var e=t.charCodeAt(0);return e>32&&e<127&&-1==[34,35,60,62,96].indexOf(e)?t:encodeURIComponent(t)}function r(t,r,n){function o(t){y.push(t)}var l=r||"scheme start",_=0,m="",d=!1,g=!1,y=[];t:for(;(t[_-1]!=u||0==_)&&!this._isInvalid;){var w=t[_];switch(l){case"scheme start":if(!w||!f.test(w)){if(r){o("Invalid scheme.");break t}m="",l="no scheme";continue}m+=w.toLowerCase(),l="scheme";break;case"scheme":if(w&&v.test(w))m+=w.toLowerCase();else{if(":"!=w){if(r){if(u==w)break t;o("Code point not allowed in scheme: "+w);break t}m="",_=0,l="no scheme";continue}if(this._scheme=m,m="",r)break t;e(this._scheme)&&(this._isRelative=!0),l="file"==this._scheme?"relative":this._isRelative&&n&&n._scheme==this._scheme?"relative or authority":this._isRelative?"authority first slash":"scheme data"}break;case"scheme data":"?"==w?(this._query="?",l="query"):"#"==w?(this._fragment="#",l="fragment"):u!=w&&"\t"!=w&&"\n"!=w&&"\r"!=w&&(this._schemeData+=a(w));break;case"no scheme":if(n&&e(n._scheme)){l="relative";continue}o("Missing scheme."),s.call(this);break;case"relative or authority":if("/"!=w||"/"!=t[_+1]){o("Expected /, got: "+w),l="relative";continue}l="authority ignore slashes";break;case"relative":if(this._isRelative=!0,"file"!=this._scheme&&(this._scheme=n._scheme),u==w){this._host=n._host,this._port=n._port,this._path=n._path.slice(),this._query=n._query,this._username=n._username,this._password=n._password;break t}if("/"==w||"\\"==w)"\\"==w&&o("\\ is an invalid code point."),l="relative slash";else if("?"==w)this._host=n._host,this._port=n._port,this._path=n._path.slice(),this._query="?",this._username=n._username,this._password=n._password,l="query";else{if("#"!=w){var b=t[_+1],k=t[_+2];("file"!=this._scheme||!f.test(w)||":"!=b&&"|"!=b||u!=k&&"/"!=k&&"\\"!=k&&"?"!=k&&"#"!=k)&&(this._host=n._host,this._port=n._port,this._username=n._username,this._password=n._password,this._path=n._path.slice(),this._path.pop()),l="relative path";continue}this._host=n._host,this._port=n._port,this._path=n._path.slice(),this._query=n._query,this._fragment="#",this._username=n._username,this._password=n._password,l="fragment"}break;case"relative slash":if("/"!=w&&"\\"!=w){"file"!=this._scheme&&(this._host=n._host,this._port=n._port,this._username=n._username,this._password=n._password),l="relative path";continue}"\\"==w&&o("\\ is an invalid code point."),l="file"==this._scheme?"file host":"authority ignore slashes";break;case"authority first slash":if("/"!=w){o("Expected '/', got: "+w),l="authority ignore slashes";continue}l="authority second slash";break;case"authority second slash":if(l="authority ignore slashes","/"!=w){o("Expected '/', got: "+w);continue}break;case"authority ignore slashes":if("/"!=w&&"\\"!=w){l="authority";continue}o("Expected authority, got: "+w);break;case"authority":if("@"==w){d&&(o("@ already seen."),m+="%40"),d=!0;for(var I=0;I<m.length;I++){var R=m[I];if("\t"!=R&&"\n"!=R&&"\r"!=R)if(":"!=R||null!==this._password){var q=a(R);null!==this._password?this._password+=q:this._username+=q}else this._password="";else o("Invalid whitespace in authority.")}m=""}else{if(u==w||"/"==w||"\\"==w||"?"==w||"#"==w){_-=m.length,m="",l="host";continue}m+=w}break;case"file host":if(u==w||"/"==w||"\\"==w||"?"==w||"#"==w){2!=m.length||!f.test(m[0])||":"!=m[1]&&"|"!=m[1]?0==m.length?l="relative path start":(this._host=i.call(this,m),m="",l="relative path start"):l="relative path";continue}"\t"==w||"\n"==w||"\r"==w?o("Invalid whitespace in file host."):m+=w;break;case"host":case"hostname":if(":"!=w||g){if(u==w||"/"==w||"\\"==w||"?"==w||"#"==w){if(this._host=i.call(this,m),m="",l="relative path start",r)break t;continue}"\t"!=w&&"\n"!=w&&"\r"!=w?("["==w?g=!0:"]"==w&&(g=!1),m+=w):o("Invalid code point in host/hostname: "+w)}else if(this._host=i.call(this,m),m="",l="port","hostname"==r)break t;break;case"port":if(/[0-9]/.test(w))m+=w;else{if(u==w||"/"==w||"\\"==w||"?"==w||"#"==w||r){if(""!=m){var L=parseInt(m,10);L!=c[this._scheme]&&(this._port=L+""),m=""}if(r)break t;l="relative path start";continue}"\t"==w||"\n"==w||"\r"==w?o("Invalid code point in port: "+w):s.call(this)}break;case"relative path start":if("\\"==w&&o("'\\' not allowed in path."),l="relative path","/"!=w&&"\\"!=w)continue;break;case"relative path":if(u!=w&&"/"!=w&&"\\"!=w&&(r||"?"!=w&&"#"!=w))"\t"!=w&&"\n"!=w&&"\r"!=w&&(m+=a(w));else{"\\"==w&&o("\\ not allowed in relative path.");var U;(U=p[m.toLowerCase()])&&(m=U),".."==m?(this._path.pop(),"/"!=w&&"\\"!=w&&this._path.push("")):"."==m&&"/"!=w&&"\\"!=w?this._path.push(""):"."!=m&&("file"==this._scheme&&0==this._path.length&&2==m.length&&f.test(m[0])&&"|"==m[1]&&(m=m[0]+":"),this._path.push(m)),m="","?"==w?(this._query="?",l="query"):"#"==w&&(this._fragment="#",l="fragment")}break;case"query":r||"#"!=w?u!=w&&"\t"!=w&&"\n"!=w&&"\r"!=w&&(this._query+=h(w)):(this._fragment="#",l="fragment");break;case"fragment":u!=w&&"\t"!=w&&"\n"!=w&&"\r"!=w&&(this._fragment+=w)}_++}}function n(){this._scheme="",this._schemeData="",this._username="",this._password=null,this._host="",this._port="",this._path=[],this._query="",this._fragment="",this._isInvalid=!1,this._isRelative=!1}function o(t,e){void 0===e||e instanceof o||(e=new o(String(e))),this._url=t,n.call(this);var s=t.replace(/^[ \t\r\n\f]+|[ \t\r\n\f]+$/g,"");r.call(this,s,null,e)}var l=!1;if(!t.forceJURL)try{var _=new URL("b","http://a");_.pathname="c%20d",l="http://a/c%20d"===_.href}catch(t){}if(!l){var c=Object.create(null);c.ftp=21,c.file=0,c.gopher=70,c.http=80,c.https=443,c.ws=80,c.wss=443;var p=Object.create(null);p["%2e"]=".",p[".%2e"]="..",p["%2e."]="..",p["%2e%2e"]="..";var u=void 0,f=/[a-zA-Z]/,v=/[a-zA-Z0-9\+\-\.]/;o.prototype={toString:function(){return this.href},get href(){if(this._isInvalid)return this._url;var t="";return""==this._username&&null==this._password||(t=this._username+(null!=this._password?":"+this._password:"")+"@"),this.protocol+(this._isRelative?"//"+t+this.host:"")+this.pathname+this._query+this._fragment},set href(t){n.call(this),r.call(this,t)},get protocol(){return this._scheme+":"},set protocol(t){this._isInvalid||r.call(this,t+":","scheme start")},get host(){return this._isInvalid?"":this._port?this._host+":"+this._port:this._host},set host(t){!this._isInvalid&&this._isRelative&&r.call(this,t,"host")},get hostname(){return this._host},set hostname(t){!this._isInvalid&&this._isRelative&&r.call(this,t,"hostname")},get port(){return this._port},set port(t){!this._isInvalid&&this._isRelative&&r.call(this,t,"port")},get pathname(){return this._isInvalid?"":this._isRelative?"/"+this._path.join("/"):this._schemeData},set pathname(t){!this._isInvalid&&this._isRelative&&(this._path=[],r.call(this,t,"relative path start"))},get search(){return this._isInvalid||!this._query||"?"==this._query?"":this._query},set search(t){!this._isInvalid&&this._isRelative&&(this._query="?","?"==t[0]&&(t=t.slice(1)),r.call(this,t,"query"))},get hash(){return this._isInvalid||!this._fragment||"#"==this._fragment?"":this._fragment},set hash(t){this._isInvalid||(this._fragment="#","#"==t[0]&&(t=t.slice(1)),r.call(this,t,"fragment"))},get origin(){var t;if(this._isInvalid||!this._scheme)return"";switch(this._scheme){case"data":case"file":case"javascript":case"mailto":return"null"}return(t=this.host)?this._scheme+"://"+t:""}};var m=t.URL;m&&(o.createObjectURL=function(t){return m.createObjectURL.apply(m,arguments)},o.revokeObjectURL=function(t){m.revokeObjectURL(t)}),t.URL=o}}(window);
/*
 * setImmediate Polyfill
 * https://github.com/YuzuJS/setImmediate
 * License:
 * https://github.com/YuzuJS/setImmediate/blob/master/LICENSE.txt
 */
!function(e,t){"use strict";function n(e){"function"!=typeof e&&(e=new Function(""+e));for(var t=new Array(arguments.length-1),n=0;n<t.length;n++)t[n]=arguments[n+1];var a={callback:e,args:t};return i[c]=a,o(c),c++}function a(e){delete i[e]}function s(e){if(r)setTimeout(s,0,e);else{var n=i[e];if(n){r=!0;try{!function(e){var n=e.callback,a=e.args;switch(a.length){case 0:n();break;case 1:n(a[0]);break;case 2:n(a[0],a[1]);break;case 3:n(a[0],a[1],a[2]);break;default:n.apply(t,a)}}(n)}finally{a(e),r=!1}}}}if(!e.setImmediate){var o,c=1,i={},r=!1,f=e.document,l=Object.getPrototypeOf&&Object.getPrototypeOf(e);l=l&&l.setTimeout?l:e,"[object process]"==={}.toString.call(e.process)?o=function(e){process.nextTick(function(){s(e)})}:function(){if(e.postMessage&&!e.importScripts){var t=!0,n=e.onmessage;return e.onmessage=function(){t=!1},e.postMessage("","*"),e.onmessage=n,t}}()?function(){var t="setImmediate$"+Math.random()+"$",n=function(n){n.source===e&&"string"==typeof n.data&&0===n.data.indexOf(t)&&s(+n.data.slice(t.length))};e.addEventListener?e.addEventListener("message",n,!1):e.attachEvent("onmessage",n),o=function(n){e.postMessage(t+n,"*")}}():e.MessageChannel?function(){var e=new MessageChannel;e.port1.onmessage=function(e){s(e.data)},o=function(t){e.port2.postMessage(t)}}():f&&"onreadystatechange"in f.createElement("script")?function(){var e=f.documentElement;o=function(t){var n=f.createElement("script");n.onreadystatechange=function(){s(t),n.onreadystatechange=null,e.removeChild(n),n=null},e.appendChild(n)}}():o=function(e){setTimeout(s,0,e)},l.setImmediate=n,l.clearImmediate=a}}("undefined"==typeof self?"undefined"==typeof global?this:global:self);
/*
 * Promise Polyfill
 * https://github.com/taylorhakes/promise-polyfill
 * Licence:
 * https://github.com/taylorhakes/promise-polyfill/blob/master/LICENSE
 */
!function(e){function n(){}function t(e){if("object"!=typeof this)throw new TypeError("Promises must be constructed via new");if("function"!=typeof e)throw new TypeError("not a function");this._state=0,this._handled=!1,this._value=void 0,this._deferreds=[],f(e,this)}function o(e,n){for(;3===e._state;)e=e._value;return 0===e._state?void e._deferreds.push(n):(e._handled=!0,void t._immediateFn(function(){var t=1===e._state?n.onFulfilled:n.onRejected;if(null!==t){var o;try{o=t(e._value)}catch(e){return void r(n.promise,e)}i(n.promise,o)}else(1===e._state?i:r)(n.promise,e._value)}))}function i(e,n){try{if(n===e)throw new TypeError("A promise cannot be resolved with itself.");if(n&&("object"==typeof n||"function"==typeof n)){var o=n.then;if(n instanceof t)return e._state=3,e._value=n,void u(e);if("function"==typeof o)return void f(function(e,n){return function(){e.apply(n,arguments)}}(o,n),e)}e._state=1,e._value=n,u(e)}catch(n){r(e,n)}}function r(e,n){e._state=2,e._value=n,u(e)}function u(e){2===e._state&&0===e._deferreds.length&&t._immediateFn(function(){e._handled||t._unhandledRejectionFn(e._value)});for(var n=0,i=e._deferreds.length;n<i;n++)o(e,e._deferreds[n]);e._deferreds=null}function f(e,n){var t=!1;try{e(function(e){t||(t=!0,i(n,e))},function(e){t||(t=!0,r(n,e))})}catch(e){if(t)return;t=!0,r(n,e)}}var c=setTimeout;t.prototype.catch=function(e){return this.then(null,e)},t.prototype.then=function(e,t){var i=new this.constructor(n);return o(this,new function(e,n,t){this.onFulfilled="function"==typeof e?e:null,this.onRejected="function"==typeof n?n:null,this.promise=t}(e,t,i)),i},t.all=function(e){var n=Array.prototype.slice.call(e);return new t(function(e,t){function o(r,u){try{if(u&&("object"==typeof u||"function"==typeof u)){var f=u.then;if("function"==typeof f)return void f.call(u,function(e){o(r,e)},t)}n[r]=u,0==--i&&e(n)}catch(e){t(e)}}if(0===n.length)return e([]);for(var i=n.length,r=0;r<n.length;r++)o(r,n[r])})},t.resolve=function(e){return e&&"object"==typeof e&&e.constructor===t?e:new t(function(n){n(e)})},t.reject=function(e){return new t(function(n,t){t(e)})},t.race=function(e){return new t(function(n,t){for(var o=0,i=e.length;o<i;o++)e[o].then(n,t)})},t._immediateFn="function"==typeof setImmediate&&function(e){setImmediate(e)}||function(e){c(e,0)},t._unhandledRejectionFn=function(e){"undefined"!=typeof console&&console&&console.warn("Possible Unhandled Promise Rejection:",e)},t._setImmediateFn=function(e){t._immediateFn=e},t._setUnhandledRejectionFn=function(e){t._unhandledRejectionFn=e},"undefined"!=typeof module&&module.exports?module.exports=t:e.Promise||(e.Promise=t)}(this);
/*
 * window.fetch polyfill
 * https://github.com/github/fetch
 * Licence
 * https://github.com/github/fetch/blob/master/LICENSE
 */
!function(t){"use strict";function e(t){if("string"!=typeof t&&(t=String(t)),/[^a-z0-9\-#$%&'*+.\^_`|~]/i.test(t))throw new TypeError("Invalid character in header field name");return t.toLowerCase()}function r(t){return"string"!=typeof t&&(t=String(t)),t}function o(t){var e={next:function(){var e=t.shift();return{done:void 0===e,value:e}}};return l.iterable&&(e[Symbol.iterator]=function(){return e}),e}function n(t){this.map={},t instanceof n?t.forEach(function(t,e){this.append(e,t)},this):Array.isArray(t)?t.forEach(function(t){this.append(t[0],t[1])},this):t&&Object.getOwnPropertyNames(t).forEach(function(e){this.append(e,t[e])},this)}function i(t){if(t.bodyUsed)return Promise.reject(new TypeError("Already read"));t.bodyUsed=!0}function s(t){return new Promise(function(e,r){t.onload=function(){e(t.result)},t.onerror=function(){r(t.error)}})}function a(t){var e=new FileReader,r=s(e);return e.readAsArrayBuffer(t),r}function h(t){if(t.slice)return t.slice(0);var e=new Uint8Array(t.byteLength);return e.set(new Uint8Array(t)),e.buffer}function u(){return this.bodyUsed=!1,this._initBody=function(t){if(this._bodyInit=t,t)if("string"==typeof t)this._bodyText=t;else if(l.blob&&Blob.prototype.isPrototypeOf(t))this._bodyBlob=t;else if(l.formData&&FormData.prototype.isPrototypeOf(t))this._bodyFormData=t;else if(l.searchParams&&URLSearchParams.prototype.isPrototypeOf(t))this._bodyText=t.toString();else if(l.arrayBuffer&&l.blob&&p(t))this._bodyArrayBuffer=h(t.buffer),this._bodyInit=new Blob([this._bodyArrayBuffer]);else{if(!l.arrayBuffer||!ArrayBuffer.prototype.isPrototypeOf(t)&&!b(t))throw new Error("unsupported BodyInit type");this._bodyArrayBuffer=h(t)}else this._bodyText="";this.headers.get("content-type")||("string"==typeof t?this.headers.set("content-type","text/plain;charset=UTF-8"):this._bodyBlob&&this._bodyBlob.type?this.headers.set("content-type",this._bodyBlob.type):l.searchParams&&URLSearchParams.prototype.isPrototypeOf(t)&&this.headers.set("content-type","application/x-www-form-urlencoded;charset=UTF-8"))},l.blob&&(this.blob=function(){var t=i(this);if(t)return t;if(this._bodyBlob)return Promise.resolve(this._bodyBlob);if(this._bodyArrayBuffer)return Promise.resolve(new Blob([this._bodyArrayBuffer]));if(this._bodyFormData)throw new Error("could not read FormData body as blob");return Promise.resolve(new Blob([this._bodyText]))},this.arrayBuffer=function(){return this._bodyArrayBuffer?i(this)||Promise.resolve(this._bodyArrayBuffer):this.blob().then(a)}),this.text=function(){var t=i(this);if(t)return t;if(this._bodyBlob)return function(t){var e=new FileReader,r=s(e);return e.readAsText(t),r}(this._bodyBlob);if(this._bodyArrayBuffer)return Promise.resolve(function(t){for(var e=new Uint8Array(t),r=new Array(e.length),o=0;o<e.length;o++)r[o]=String.fromCharCode(e[o]);return r.join("")}(this._bodyArrayBuffer));if(this._bodyFormData)throw new Error("could not read FormData body as text");return Promise.resolve(this._bodyText)},l.formData&&(this.formData=function(){return this.text().then(d)}),this.json=function(){return this.text().then(JSON.parse)},this}function f(t,e){var r=(e=e||{}).body;if(t instanceof f){if(t.bodyUsed)throw new TypeError("Already read");this.url=t.url,this.credentials=t.credentials,e.headers||(this.headers=new n(t.headers)),this.method=t.method,this.mode=t.mode,r||null==t._bodyInit||(r=t._bodyInit,t.bodyUsed=!0)}else this.url=String(t);if(this.credentials=e.credentials||this.credentials||"omit",!e.headers&&this.headers||(this.headers=new n(e.headers)),this.method=function(t){var e=t.toUpperCase();return m.indexOf(e)>-1?e:t}(e.method||this.method||"GET"),this.mode=e.mode||this.mode||null,this.referrer=null,("GET"===this.method||"HEAD"===this.method)&&r)throw new TypeError("Body not allowed for GET or HEAD requests");this._initBody(r)}function d(t){var e=new FormData;return t.trim().split("&").forEach(function(t){if(t){var r=t.split("="),o=r.shift().replace(/\+/g," "),n=r.join("=").replace(/\+/g," ");e.append(decodeURIComponent(o),decodeURIComponent(n))}}),e}function y(t,e){e||(e={}),this.type="default",this.status=void 0===e.status?200:e.status,this.ok=this.status>=200&&this.status<300,this.statusText="statusText"in e?e.statusText:"OK",this.headers=new n(e.headers),this.url=e.url||"",this._initBody(t)}if(!t.fetch){var l={searchParams:"URLSearchParams"in t,iterable:"Symbol"in t&&"iterator"in Symbol,blob:"FileReader"in t&&"Blob"in t&&function(){try{return new Blob,!0}catch(t){return!1}}(),formData:"FormData"in t,arrayBuffer:"ArrayBuffer"in t};if(l.arrayBuffer)var c=["[object Int8Array]","[object Uint8Array]","[object Uint8ClampedArray]","[object Int16Array]","[object Uint16Array]","[object Int32Array]","[object Uint32Array]","[object Float32Array]","[object Float64Array]"],p=function(t){return t&&DataView.prototype.isPrototypeOf(t)},b=ArrayBuffer.isView||function(t){return t&&c.indexOf(Object.prototype.toString.call(t))>-1};n.prototype.append=function(t,o){t=e(t),o=r(o);var n=this.map[t];this.map[t]=n?n+","+o:o},n.prototype.delete=function(t){delete this.map[e(t)]},n.prototype.get=function(t){return t=e(t),this.has(t)?this.map[t]:null},n.prototype.has=function(t){return this.map.hasOwnProperty(e(t))},n.prototype.set=function(t,o){this.map[e(t)]=r(o)},n.prototype.forEach=function(t,e){for(var r in this.map)this.map.hasOwnProperty(r)&&t.call(e,this.map[r],r,this)},n.prototype.keys=function(){var t=[];return this.forEach(function(e,r){t.push(r)}),o(t)},n.prototype.values=function(){var t=[];return this.forEach(function(e){t.push(e)}),o(t)},n.prototype.entries=function(){var t=[];return this.forEach(function(e,r){t.push([r,e])}),o(t)},l.iterable&&(n.prototype[Symbol.iterator]=n.prototype.entries);var m=["DELETE","GET","HEAD","OPTIONS","POST","PUT"];f.prototype.clone=function(){return new f(this,{body:this._bodyInit})},u.call(f.prototype),u.call(y.prototype),y.prototype.clone=function(){return new y(this._bodyInit,{status:this.status,statusText:this.statusText,headers:new n(this.headers),url:this.url})},y.error=function(){var t=new y(null,{status:0,statusText:""});return t.type="error",t};var w=[301,302,303,307,308];y.redirect=function(t,e){if(-1===w.indexOf(e))throw new RangeError("Invalid status code");return new y(null,{status:e,headers:{location:t}})},t.Headers=n,t.Request=f,t.Response=y,t.fetch=function(t,e){return new Promise(function(r,o){var i=new f(t,e),s=new XMLHttpRequest;s.onload=function(){var t={status:s.status,statusText:s.statusText,headers:function(t){var e=new n;return t.replace(/\r?\n[\t ]+/g," ").split(/\r?\n/).forEach(function(t){var r=t.split(":"),o=r.shift().trim();if(o){var n=r.join(":").trim();e.append(o,n)}}),e}(s.getAllResponseHeaders()||"")};t.url="responseURL"in s?s.responseURL:t.headers.get("X-Request-URL");var e="response"in s?s.response:s.responseText;r(new y(e,t))},s.onerror=function(){o(new TypeError("Network request failed"))},s.ontimeout=function(){o(new TypeError("Network request failed"))},s.open(i.method,i.url,!0),"include"===i.credentials?s.withCredentials=!0:"omit"===i.credentials&&(s.withCredentials=!1),"responseType"in s&&l.blob&&(s.responseType="blob"),i.headers.forEach(function(t,e){s.setRequestHeader(e,t)}),s.send(void 0===i._bodyInit?null:i._bodyInit)})},t.fetch.polyfill=!0}}("undefined"!=typeof self?self:this);

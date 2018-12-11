# include
A framework for pulling in secondary required files within code.
It keeps track of previously requested files, based on their resolved
absolute path, so they only load once. By default it loads js, css, json, and html,
but can be extended to load any other text file. See `include.typeLoader` and
`include.fetch` static methods for details.

The package optionally uses fetch API to load the scripts and can be configured
to store them in localStorgae for faster return visits. See defaultOptions in the
Static methods for more details.
- @param filename String or Array of strings. location of the file or files to
        include (relative to the default path)
- @param type Optional String. File type to load. "js", "css", "html", "json",
        and "txt" handled out of box. Uses the file extension to 'guess' at
        the file type if omited or return the loaded text if it can't resolve
        to a known type.
- @param options Optional hashmap. Options used by typeLoader.
- @param callback Optional function. node-style (error first) method to call once
        the file is loaded.
- @returns Promise

## when loading js files,
 - same-origin files loaded with options.store set to true will be loaded
   via fetch and inserted as inline code.
 - all other requests will load via `<script src>` attribute
 - optionally specify the parent node to insert script into with
   options.parent, otherwise it will use the parent node of the
   first script tag in the page.

Resolved promises and/or callbacks will receive true, or any object
registered with `include.register` by the loaded script.


## When loading css files,
 - same-origin files loaded with options.store set to true will be loaded
   via fetch and inserted in an inline <style> tag.
 - all other requests will load via a <link> tag
 - optionally specify the parent node to insert script into with
   options.parent, otherwise it will use the HEAD tag

Resolved promises and/or callbacks will recieve true

## When loading html files,
 - files will be loaded via fetch, so be aware of CORS conscerns.
 - Resolved promises and/or callbacks will receive a documentFragment containing
   the parsed file content.
## When loading json files,
 - files will be loaded via fetch, so be aware of CORS conscerns.
 - Resolved promises and/or callbacks will receive a js object containing the
   parsed file content.

## When loading text/unknown file types,
 - files will be loaded via fetch, so be aware of CORS conscerns.
 - Resolved promises and/or callbacks will receive the file content.


## USAGE:
```js
//simple usage. asynchronously load another file.
include('filename.js');

//pass in an array of filenames simultaneously
include(['filename.js','filename-2.js',...,'filename-n.js']);

// returns a Promise to call a function on load/error
include('filename.js').then(function(success) {
  // NOTE: older browsers (IE < 10) may report success on failed script loads
  doSomething(success);
}, function(error)) {
  console.log('filename.js could not be loaded',error);
});
//use the dual argument form of then to avoid 'catch' reserved word issues in IE < 9

// fires off an optional callback method on load/error
include('filename.js',function callback(error,success) {
  // NOTE: older browsers (IE < 10) may report success on failed script loads
  if (error) {
    console.log('filename.js could not be loaded',error);
  }
  else {
    doSomething(success);
  }
});

//send in custom options object
include('filename.js',{store:true,expires:false,version:3}[,callback]);

//specify file types (see include.typeLoader for more info)
include('/some/api/endpoint/','json'[,callback]);
```
##STATIC METHODS:

###include.next
return a wrapper function to chain includes
as a callback -- will fire on success or fail.
```js
include('filename.js'[,type][,options],include.next('needs-filename.js'[,type][,options][,callbackFunc]));
// in a promise
include('filename.js')
 .then(include.next('needs-filename.js'[,type][,options][,callbackFunc]))
 .then(function() {console.log('fires after needs-filename.js is loaded')});
```
###include.polyfill
assert-like function that will optionally load a file if the first argument resolves to false
otherwice return a resolved promise and optionally fire any callback provided
```js
include.polyfill(window.customElements,'my-polyfill.js'[,type][,options][,callbackFunc]).then(function() {
   doStuff();
});
```
###include.register
have the loaded script register itself, so files included via <script src="">
can avoid being double loaded. and optionally specify a result object (or method).
```
include.register('/full/path/to/filename.js'[,{'result':'object','including':function method() {}}])
// return objects will get passed to the Promise and/or callback as a success object
```
NOTE: filename paths are resolved relative to the fromPath value. Use the full path to register.

###include.defer
have the loaded script manually stall it's registration, so it can control
when external scripts depending on it are notified.
ensure that include.register gets called to release the delay.
```js
include.defer('/full/path/to/filename.js')
include('/full/path/to/another/filename.js').then(function() {
   include.register('/full/path/to/filename.js');
})
```
NOTE: filename paths are resolved relative to the fromPath value. Use the full path to register.

####include.defaultPath
set the default path to resolve includes from
uses `location.href` is not specified
```js
include.defaultPath('/path/to/includes');
```

###include.defaultOptions
set default settings for file fetching
```js
include.defaultOptions({
   mode: 'no-cors', //see fetch Request.mode documentation https://developer.mozilla.org/en-US/docs/Web/API/Request/mode
         // no effect on older browsers due to polyfill limitations
   cache: 'default' , //see fetch Request.cache documentation https://developer.mozilla.org/en-US/docs/Web/API/Request/cache
         // no effect on older browsers due to polyfill limitations
   store: true|false, //store the file contents in localStorage, initilaizes to false
   version: int, //refresh stored file if it's version is lower than this version. intializes to 0
   expires: true|false|int, //whether or not to refresh stored files after a specified number of seconds.
         // if true, defaults to 48 hours. initilaizes to true.
 });
 ```
You can also set type specific options. These will be override/inherit global default values at runtime.
```js
 include.defaultOption(option, 'javasctipt');
```
*NOTE:* these options can be overriden in the include options object.

###include.typeLoader
define a custom loader script
(include already handles 'script', 'style', 'html', 'json', and 'text' types by default)
```js
include.typeLoader('typeName', function typeLoader(filename, options, resolve , reject) { ... });
//also send an array of pseudonyms for a single typeLoader
include.typeLoader(['template','partial','handlebars'], function typeLoader(filename, options, resolve , reject) { ... });
// or set a synonym for an existing typeLoader
include.typeLoader('mjs','script');
```
NOTE: to take advantage of localStorage caching, use include.fetch to do the actual file loading.

###include.extendedUrl
resolve a filename to it's absolute path.
will not include the origin if file and page are on the same server.
```js
var absolute = include.extendedUrl('filename.js');
```

###include.retrieve
fetch a returned object directly
```js
var result = include.retrieve('filename.js');
```

###include.fetch
load a file and return a promise. Useful for creating new typeLoaders
unlike native fetch, it will return the text value of the file and fail if response.ok is false.
```js
include.fetch('filename.xml'[,{options}]).then(function(text) {...});
```
NOTE: it will store the file as per default type settings unless overridden in the options object

###include.flush
flush the entire cache if need be
```js
include.flush();
```
or just specific files.
```js
include.flush('filename.js'[[,...],'filename-n.js']);
```
###include.filenames
obtain a list of included filenames
```js
var fileNames = include.filenames();
//include pending filenames
var fileNames = include.filenames(true);
```

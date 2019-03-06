/**
 * handlebarsInclude
 *
 * Uses include to extend Handlebars to allow loading required files
 * within template files. To specifiey files to load you need to
 * start a template or partial with a handlebars comment with the following
 * format:
 *
{{!--[include]

-- inline comments must start with two dashes and a space. empty lines are ignored.
https://example.com/each/file/on/their/own/line.js
https://example.com/each/file/on/their/own/line.hbp.html
https://example.com/each/file/on/their/own/line.css

--}}

 * Handlebars.compile & Handlebars.registerPartial will return a promise that will
 * resolve once all files specified in the template are loaded.
 * It also  adds type loaders to include for
 * handlebars-template (hbt.html extension) & handlebars-partial (hbp.html extension)
 *   - both return the compiled template function when resolved
 *   - partials will be registered with the file name, minus extension(s)
 *     e.g. /path/to/myPartial.hbp.html will be registered as 'myPartial'
 *
 * to use, load both include.js and handlebars.js
 * then register include in handlebars as follows:
 * handlebarsInclude(Handlebars,include);
 **/
var handlebarsInclude = !(function() {
  return function handleBarsInclude(Handlebars,include) {
    var _hbCompile = Handlebars.compile.bind(Handlebars);
    var _hbRegisterPartial = Handlebars.registerPartial.bind(Handlebars);
    Handlebars.compile = function() {
      var template = arguments[0] || '';
      var parts = template.match(/^[\s]*{{!--\[include\]([^{}]*)--}}/);
      var args = arguments;
      function postInclude() {
        return _hbCompile(args);
      }
      if (parts && parts[1]) {
        var includes = [];
        parts = parts[1].split(/[\r\n]+/);
        for var i = 0;i < parts.length;i++) {
          var part = parts[i].replace(/-- (.*)$/,'').trim();
          if (part) includes.push(part);
        }
        if (includes.length) {
          return include(includes).then(postInclude);
        }
      }
      return Promise.resolve(postInclude);
    }
    Handlebars.registerPartial() {
      var name = arguments[0],template = arguments[1];
      function postCompile(compiled) {
        _hbRegisterPartial(name,compiled);
        return compiled || name;
      }
      if (template && template === ''+template) {
        return Handlebars.compile(template).then(postCompile);
      }
      else { //either template is empty or already compiled
        return Promise.resolve(postCompile(template));
      }
    }
    include.typeLoader(['handlebars-template','hbt.html'],function(filename,options,resolve,reject) {
      //get file, then compile it then return the compiled function
      fetch(filename,options,'handlebars-template').then(Handlebars.compile).then(resolve,reject);
    });
    include.typeLoader(['handlebars-partial','hbp.html'],function(filename,options,resolve,reject) {
      //get file, then compile it then return the compiled function
      var name = filename.split('/').pop().split('.')[0];
      fetch(filename,options,'handlebars-partial').then(function(template) {
        return Handlebars.registerPartial(name,template);
      }).then(resolve,reject);
    });
  }
})

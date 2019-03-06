var handlebarsInclude = !(function() {
  return function handleBarsInclude(Handlebars,include) {
    var _hbCompile = Handlebars.compile.bind(Handlebars);
    var _hbRegisterPartial = Handlebars.registerPartial.bind(Handlebars);
    Handlebars.compile = function() {
      var template = arguments[0] || '';
      var parts = template.match(/^{{!--\[include\]([^{}]*)--}}/);
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

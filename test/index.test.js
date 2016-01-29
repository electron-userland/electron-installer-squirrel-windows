/*eslint no-new:0*/
var fs = require('fs');
var path = require('path');
var temp = require('temp');
var async = require('async');
var format = require('util').format;
var assert = require('assert');
var Model = require('../lib/model');
var defaults = require('../lib/defaults');

var debug = require('debug')('electron-installer-squirrel-windows:test');

var createInstaller = require('../');

var options = {
  path: require('electron-installer-fixture-windows')
};
const UPDATE_EXE = path.join(options.path, 'Update.exe');

var createsPaths = [];
var checkPathsCreated = function(done) {
  async.parallel(createsPaths.map(function(p) {
    return function(cb) {
      fs.exists(p, function(exists) {
        if (!exists) {
          return cb(new Error(format('Expected `%s` to exist!', p)));
        }
        cb();
      });
    };
  }), done);
};
describe('electron-installer-squirrel-windows', function() {
  describe('model', function() {
    it('should return an error if no `path` specified', function(done) {
      new Model({}, function(err, app) {
        assert.equal(app, undefined);
        if (!err) {
          return done(new Error('Should have produced an error!'));
        }
        assert(err);
        done();
      });
    });
    it('should work', function(done) {
      var src = require('electron-installer-fixture-windows');
      var out = path.resolve(src, '..');

      new Model(src, function(err, app) {
        assert.ifError(err);

        assert.equal(app.name, 'Myapp');
        assert.equal(app.version, '0.0.0');
        assert.equal(app.description, 'A fixture Electron app for testing app packaging.');
        assert.equal(app.copyright, '2016 Arlo Basil');
        assert.equal(app.path, path.join(src));
        assert.equal(app.product_name, 'MyApp');
        assert.equal(app.electron_version, '0.29.2');
        assert.equal(app.authors, 'Arlo Basil');
        assert.equal(app.owners, 'Arlo Basil');
        assert.equal(app.title, 'MyApp');
        assert.equal(app.exe, 'Myapp.exe');
        assert.equal(app.icon_url, defaults.ICON_URL);
        assert.equal(app.loading_gif, defaults.LOADING_GIF);
        assert.equal(app.setup_filename, 'MyappSetup.exe');
        assert.equal(app.nuget_id, 'Myapp');
        assert.equal(app.overwrite, false);
        assert.equal(app.asar, path.join(src, 'resources', 'app.asar'));
        assert.equal(app.resources, path.join(src, 'resources'));
        assert.equal(app.nuspec_filename, 'Myapp.nuspec');
        assert.equal(app.nupkg_filename, 'Myapp.0.0.0.nupkg');

        // it should always set `out` or commands will fail...
        assert.equal(app.out, out);

        done();
      });
    });
    describe('overrides', function() {
      it('should cascade name to derived properties', function(done) {
        var options = {
          path: require('electron-installer-fixture-windows'),
          name: 'HelloEarl'
        };
        new Model(options, function(err, app) {
          assert.ifError(err);

          assert.equal(app.name, 'HelloEarl');
          assert.equal(app.version, '0.0.0');
          assert.equal(app.description, 'A fixture Electron app for testing app packaging.');
          assert.equal(app.copyright, '2016 Arlo Basil');
          assert.equal(app.path, path.join(options.path));
          assert.equal(app.product_name, 'MyApp');
          assert.equal(app.electron_version, '0.29.2');
          assert.equal(app.authors, 'Arlo Basil');
          assert.equal(app.owners, 'Arlo Basil');
          assert.equal(app.title, 'MyApp');
          assert.equal(app.exe, 'HelloEarl.exe');
          assert.equal(app.icon_url, defaults.ICON_URL);
          assert.equal(app.loading_gif, defaults.LOADING_GIF);
          assert.equal(app.setup_filename, 'HelloEarlSetup.exe');
          assert.equal(app.nuget_id, 'HelloEarl');
          assert.equal(app.overwrite, false);
          assert.equal(app.asar, path.join(options.path, 'resources', 'app.asar'));
          assert.equal(app.resources, path.join(options.path, 'resources'));
          assert.equal(app.nuspec_filename, 'HelloEarl.nuspec');
          assert.equal(app.nupkg_filename, 'HelloEarl.0.0.0.nupkg');

          done();
        });
      });
      it('should allow overriding only the `nuget_id`', function(done) {
        var options = {
          path: require('electron-installer-fixture-windows'),
          nuget_id: 'company_name.foobar'
        };
        new Model(options, function(err, app) {
          assert.ifError(err);

          assert.equal(app.name, 'Myapp');
          assert.equal(app.version, '0.0.0');
          assert.equal(app.description, 'A fixture Electron app for testing app packaging.');
          assert.equal(app.copyright, '2016 Arlo Basil');
          assert.equal(app.path, path.join(options.path));
          assert.equal(app.product_name, 'MyApp');
          assert.equal(app.electron_version, '0.29.2');
          assert.equal(app.authors, 'Arlo Basil');
          assert.equal(app.owners, 'Arlo Basil');
          assert.equal(app.title, 'MyApp');
          assert.equal(app.exe, 'Myapp.exe');
          assert.equal(app.icon_url, defaults.ICON_URL);
          assert.equal(app.loading_gif, defaults.LOADING_GIF);
          assert.equal(app.setup_filename, 'MyappSetup.exe');
          assert.equal(app.nuget_id, 'company_name.foobar');
          assert.equal(app.overwrite, false);
          assert.equal(app.asar, path.join(options.path, 'resources', 'app.asar'));
          assert.equal(app.resources, path.join(options.path, 'resources'));
          assert.equal(app.nuspec_filename, 'company_name.foobar.nuspec');
          assert.equal(app.nupkg_filename, 'company_name.foobar.0.0.0.nupkg');

          done();
        });
      });
    });
  });
  describe('commands', function() {
    // @todo (imlucas): Use `proxyquire` to check that all the child_process
    // commands are actually correct.
    it('should have correct paths for all bundled assets', function(done) {
      var assets = [
        'NUGET_EXE',
        'SYNC_RELEASES_EXE',
        'UPDATE_EXE',
        'UPDATE_COM',
        'NUSPEC_TEMPLATE'
      ];
      async.parallel(assets.map(function(name) {
        return function(cb) {
          var src = createInstaller[name];
          fs.exists(src, function(exists) {
            assert(exists, name + ' does not exist at `' + src + '`');
            cb();
          });
        };
      }), done);
    });
  });
  describe('functional', function() {
    before(function(done) {
      if (process.platform !== 'win32') {
        return this.skip();
      }
      temp.mkdir('electron-installer-squirrel-windows', function(err, out) {
        if (err) return done(err);

        options.out = out;
        fs.exists(UPDATE_EXE, function(exists) {
          if (!exists) return done();
          fs.unlink(UPDATE_EXE, done);
        });
      });
    });
    it('creates a nuget package and installer', function(done) {
      debug('creating installer...');
      createInstaller(options, function(err) {
        if (err) return done(err);

        setTimeout(function() {
          createsPaths = [
            path.join(options.out, 'myapp-0.0.0-full.nupkg'),
            path.join(options.out, 'MyAppSetup.exe'),
            path.join(options.out, 'RELEASES'),
            path.join(UPDATE_EXE)
          ];
          debug('checking paths were created', JSON.stringify(createsPaths, null, 2));
          checkPathsCreated(done);
        }, 20000);
      });
    });
    after(function(done) {
      async.parallel(createsPaths.map(function(p) {
        return function(cb) {
          fs.unlink(p, function() {
            cb();
          });
        };
      }), done);
    });
  });
});

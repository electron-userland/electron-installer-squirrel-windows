var debug = require('debug')('electron-installer-squirrel-windows:model');
var asar = require('asar');
var Model = require('ampersand-model');
var fs = require('fs-extra');
var path = require('path');
var each = require('lodash.foreach');
var clone = require('lodash.clone');
var assign = require('lodash.assign');
var titlecase = require('titlecase');
var defaults = require('./defaults');
var format = require('util').format;

var createSyncErrback = require('./create-sync-errback');

// @todo (imlucas): move this to `electron-installer-model`
var App = Model.extend({
  props: {
    name: 'string',
    version: 'string',
    description: 'string',
    copyright: 'string',
    // Path to the app.
    path: 'string',
    // Directory to put installers in.
    out: 'string',
    product_name: 'string',
    electron_version: {
      type: 'string',
      default: function() {
        // @todo (imlucas): make a module that just has the latest electron
        // version number, e.g.
        // require('electron-latest-version');
        // -> '0.29.2'
        return defaults.ELECTRON_VERSION;
      }
    },
    authors: 'string',
    owners: 'string',
    title: 'string',
    exe: 'string',
    icon_url: 'string',
    setup_icon: 'string',
    loading_gif: 'string',
    cert_path: 'string',
    cert_password: 'string',
    sign_with_params: 'string',
    remote_releases: 'string',
    token: 'string',
    setup_filename: 'string',
    // @todo (imlucas): Support squirrel.windows `setup_icon`.
    nuget_id: 'string',
    overwrite: {
      type: 'boolean',
      default: false
    }
  },
  derived: {
    asar: {
      deps: ['resources'],
      fn: function() {
        if (!this.resources) return undefined;
        return path.join(this.resources, 'app.asar');
      }
    },
    resources: {
      deps: ['path'],
      fn: function() {
        if (!this.path) return undefined;
        return path.join(this.path, 'resources');
      }
    },
    setup_path: {
      deps: ['out', 'setup_filename'],
      fn: function() {
        if (!this.out || !this.setup_filename) return undefined;
        return path.join(this.out, this.setup_filename);
      }
    },
    nuspec_filename: {
      deps: ['nuget_id'],
      fn: function() {
        return format('%s.nuspec', this.nuget_id);
      }
    },
    nupkg_filename: {
      deps: ['name', 'version'],
      fn: function() {
        return format('%s.%s.nupkg', this.nuget_id, this.version);
      }
    }
  },
  parse: function(resp) {
    resp.name_original = resp.name;
    resp.name = titlecase(resp.name.replace(/-/g, ' ')).replace(/ /, '');
    resp.product_name = resp.product_name || resp.productName || resp.name;
    resp.icon_url = resp.icon_url || resp.iconUrl;

    if (!resp.authors) {
      resp.authors = resp.author ? resp.author.name : '';
    }
    if (!resp.exe) {
      resp.exe = format('%s.exe', resp.name);
    }

    resp.loading_gif = resp.loading_gif || resp.loadingGif;
    if (!resp.loading_gif) {
      resp.loading_gif = defaults.LOADING_GIF;
    }

    if (!resp.owners) {
      resp.owners = resp.authors;
    }

    if (!resp.title) {
      resp.title = resp.product_name;
    }

    resp.icon_url = resp.icon_url || resp.iconUrl;
    if (!resp.icon_url) {
      resp.icon_url = defaults.ICON_URL;
    }

    if (!resp.copyright) {
      resp.copyright = format('%s %s', new Date().getFullYear(), resp.owners);
    }

    if (!resp.setup_filename) {
      resp.setup_filename = format('%sSetup.exe', resp.name);
    }

    if (!resp.nuget_id) {
      resp.nuget_id = resp.name;
    }

    resp.version = resp.version.replace(/-.*$/, '');
    return resp;
  },
  loadPackageJsonFromResources: function(done) {
    var src = path.join(this.resources, 'app', 'package.json');
    fs.readFile(src, function(err, buf) {
      if (err) return done(err);

      done(null, JSON.parse(buf));
    });
  },
  loadPackageJson: function(done) {
    if (!this.asar) {
      return this.loadPackageJsonFromResources(done);
    }
    fs.exists(this.asar, function(exists) {
      if (exists) {
        done(null, JSON.parse(asar.extractFile(this.asar, 'package.json')));
      } else {
        this.loadPackageJsonFromResources(done);
      }
    }.bind(this));
  },
  sync: function(method, model, options) {
    this.path = options.path;
    this.out = options.out;
    var done = createSyncErrback(method, model, options);

    var overrides = clone(options);
    delete overrides.parse;
    delete overrides.path;
    debug('sync called w/ overrides', JSON.stringify(overrides, null, 2));

    this.loadPackageJson(function(err, data) {
      if (err) {
        debug('error loading package json', err);
        return done(err);
      }
      var res = assign(data, overrides);
      done(null, res);
    });
  },
  initialize: function(opts, fn) {
    if (typeof opts === 'string') {
      opts = {
        path: opts
      };
    }
    if (!fn) return;

    if (!opts.path) {
      process.nextTick(function() {
        fn(new TypeError('Missing required `path` param.'));
      });
      return;
    }

    if (!opts.out) {
      opts.out = path.resolve(opts.path, '..');
    }

    this.on('sync', function(model) {
      debug('loaded model', JSON.stringify(model.toJSON(), null, 2));
      fn(null, model);
    });
    this.on('error', function(model, err) {
      debug('error fetching model', err);
      fn(err);
    });
    debug('fetching app model');
    this.fetch(opts);
  },
  serialize: function() {
    var res = this.getAttributes({
      props: true,
      derived: true
    }, true);
    each(this._children, function(value, key) {
      res[key] = this[key].serialize();
    }, this);
    each(this._collections, function(value, key) {
      res[key] = this[key].serialize();
    }, this);
    return res;
  }
});

module.exports = App;

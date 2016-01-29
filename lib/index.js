var cp = require('child_process');
var fs = require('fs-extra');
var path = require('path');
var series = require('async').series;
var format = require('util').format;
var _template = require('lodash.template');
var Model = require('./model');
var debug = require('debug')('electron-installer-squirrel-windows');
var os = require('os');

const NUGET_EXE = path.resolve(__dirname, '..', 'vendor', 'nuget.exe');
const SYNC_RELEASES_EXE = path.resolve(__dirname, '..', 'vendor', 'SyncReleases.exe');
const UPDATE_EXE = path.resolve(__dirname, '..', 'vendor', 'Update.exe');
const UPDATE_COM = path.resolve(__dirname, '..', 'vendor', 'Update.com');
const NUSPEC_TEMPLATE = path.resolve(__dirname, '..', 'template.nuspec');

function exec(cmd, args, done) {
  debug('exec `%s` with args `%s`', cmd, args.join(' '));

  fs.exists(cmd, function(exists) {
    if (!exists) {
      return done(new Error('File does not exist at ' + cmd));
    }
    cp.execFile(cmd, args, function(err, stdout, stderr) {
      if (err) {
        console.error('Error ', err);
      }
      if (stderr) {
        console.error(stderr);
      }
      console.log('stdout', stdout);
      return done(err);
    });
  });
}

function syncReleases(app, done) {
  if (!app.remote_releases) {
    debug('no remote releases.  skipping sync.');
    return process.nextTick(function() {
      return done();
    });
  }

  var syncArguments = ['-u', app.remote_releases, '-r', app.out];
  if (app.token) {
    syncArguments.push.apply(syncArguments, ['-t', app.token]);
  }
  exec(SYNC_RELEASES_EXE, syncArguments, done);
}

function createTempDirectory(app, done) {
  debug('creating temp directory');
  var res = os.tmpdir();
    app.nuget_out = res;
    app.nuspec_path = path.join(app.nuget_out, app.nuspec_filename);
    app.nupkg_path = path.join(app.nuget_out, app.nupkg_filename);
    done();
}

function createNugetPkg(app, done) {
  debug('generating .nuspec file contents');
  fs.readFile(NUSPEC_TEMPLATE, function(err, buf) {
    if (err) return done(err);

    var template = _template(buf);
    var nuspecContent = template(app.serialize());

    debug('.nuspec file contents:\n', nuspecContent);

    debug('writing nuspec file to `%s`', app.nuspec_path);
    fs.writeFile(app.nuspec_path, nuspecContent, function(err) {
      if (err) return done(err);

      var dest = path.join(app.path, 'Update.exe');
      debug('copying `%s` -> `%s`', UPDATE_EXE, dest);
      fs.copy(UPDATE_EXE, dest, function(err) {
        if (err) return done(err);

        debug('generating `%s`...', app.nuget_out);
        exec(NUGET_EXE, [
          'pack',
          app.nuspec_path,
          '-BasePath',
          app.path,
          '-OutputDirectory',
          app.nuget_out,
          '-NoDefaultExcludes'
        ], done);
      });
    });
  });
}

function createSetupExe(app, done) {
  var args = [
    '--releasify',
    app.nupkg_path,
    '--releaseDir',
    app.out,
    '--loadingGif',
    app.loading_gif
  ];

  if (app.sign_with_params) {
    args.push.apply(args, ['--signWithParams', app.sign_with_params]);
  } else if (app.cert_path && app.cert_password) {
    args.push.apply(args, [
      '--signWithParams',
      format('/a /f "%s" /p "%s"', path.resolve(app.cert_path), app.cert_password)
    ]);
  }

  if (app.setup_icon) {
    args.push.apply(args, ['--setupIcon', path.resolve(app.setup_icon)]);
  }

  return exec(UPDATE_COM, args, function(err) {
    if (err) return done(err);
    debug('mv `%s` -> `%s`', path.join(app.out, 'Setup.exe'), app.setup_path);
    fs.rename(path.join(app.out, 'Setup.exe'), app.setup_path, function(err) {
      if (err) return done(err);
      done();
    });
  });
}

// @todo (imlucas): Move to its own module `electron-installer-overwrite-check`
function checkForExisting(app, done) {
  var check = function(filename) {
    return function(cb) {
      var src = path.join(app.out, filename);

      fs.exists(src, function(exists) {
        if (!exists) return cb();

        if (exists && !app.overwrite) {
          var msg = format('`%s` already exists!'
            + ' Run electron-installer-squirrel-windows again with'
            + ' `--overwrite` or just remove the file at `%s` yourself'
            + ' and run again.', filename, src);
          return cb(new Error(msg));
        }
        debug('Removing existing `%s`', filename);
        fs.unlink(src, cb);
      });
    };
  };

  series([
    check(app.nupkg_filename),
    check(app.setup_filename),
    check('RELEASES')
  ], done);
}

// @todo (imlucas): Add chokadir to watch `out` for nupkg, RELEASES and setup.exe
// to be created so we can get rid of this silly 20second set timeout in functional tests.
module.exports = function(opts, done) {
  debug('generating squirrel-windows installer for', JSON.stringify(opts, null, 2));
  var app = new Model(opts, function(err) {
    if (err) return done(err);
    series([
      checkForExisting.bind(null, app),
      createTempDirectory.bind(null, app),
      createNugetPkg.bind(null, app),
      syncReleases.bind(null, app),
      createSetupExe.bind(null, app)
    ], done);
  });
};

module.exports.NUGET_EXE = NUGET_EXE;
module.exports.SYNC_RELEASES_EXE = SYNC_RELEASES_EXE;
module.exports.UPDATE_EXE = UPDATE_EXE;
module.exports.UPDATE_COM = UPDATE_COM;
module.exports.NUSPEC_TEMPLATE = NUSPEC_TEMPLATE;

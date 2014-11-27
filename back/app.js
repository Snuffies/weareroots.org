/**
 * wearetech.io
 * Your amazing app
 * http://www.app.app
 *
 * Copyright (c) 2014 Thanasis Polychronakis
 * Licensed under the MIT OSS
 */

/**
 * Module dependencies.
 */
var util = require('util');

var BPromise = require('bluebird');
var log = require('logg').getLogger('app.boot');

var globals = require('./core/globals');
var AppServices = require('./app-services');
var logger = require('./util/logger');

/**
 * The master boot.
 *
 */
var app = module.exports = {};

// define stand alone status
globals.isStandAlone = require.main === module;

var initialized = false;

/** @type {?app.boot.services} The services boot */
app.boot = null;

/**
 * Master bootstrap module.
 *
 * Available options to pass on the first arg:
 *
 * @param {Object=} optOpts init params.
 * @return {BPromise} A Promise.
 */
app.init = BPromise.method(function(optOpts) {
  if (initialized) { return BPromise.resolve(); }
  initialized = true;

  app.boot = AppServices.getInstance();
  app.boot.setup(optOpts);

  // assign to globals the boot options
  globals.bootOpts = app.boot.options;

  // Initialize logging facilities
  logger.init();

  if (!app.boot.options.log || process.env.NODE_NOLOG) {
    // TODO figure out wtf
    // logger.removeConsole();
  }

  log.info('Initializing... standAlone:', globals.isStandAlone,
    ':: System NODE_ENV:', process.env.NODE_ENV, ':: App Environment:', globals.env,
    ':: Server ID:', globals.serverId, ':: On Heroku:', globals.isHeroku,
    ':: Security:', app.boot.options.security);

  // Global exception handler
  process.on('uncaughtException', app.onNodeFail);

  return app.boot.initServices()
    .catch(function(err){
      log.error('Error on boot:', err);
      app.die(-1);
    });
});

/**
 * Catch-all for all unhandled exceptions
 *
 * @param {Error} err An error object.
 */
app.onNodeFail = function(err) {
  log.error('onNodeFail() :: Unhandled Exception. Error:', util.inspect(err), err);
  app.die(1);
};

/**
 * It's time to die...
 *
 * @param {number=} optExitCode optionally define an exit code.
 */
app.die = function(optExitCode) {
  var exitCode = 1;
  if (typeof optExitCode === 'number') {
    exitCode = optExitCode;
  }
  setTimeout(function() {
    process.exit(exitCode);
  }, 1000);
};


// ignition
if (globals.isStandAlone) {
  app.init();
}


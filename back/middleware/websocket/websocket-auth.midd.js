/**
 * @fileOverview Websockets authentication mechanism, determine if the socket
 *   comes from a reliable source and figure out who is the user.
 */
var __ = require('lodash');
var cip = require('cip');
var Promise = require('bluebird');
var log = require('logg').getLogger('app.ctrl.websocket.main');
var config = require('config');

var appError = require('../../util/error');
var SessionStore = require('../../core/session-store.core');

/**
 * Websockets authentication mechanism, determine if the socket
 *   comes from a reliable source and figure out who is the user.
 *
 * @param {socket.io} socket The socket instance.
 * @contructor
 */
var SockAuth = module.exports = cip.extend(function(socket, role) {
  this.socket = socket;

  this.defer = Promise.defer();

  this.decided = false;
  console.log('websocket auth Ctor:', role);

  this.sessionStore = new SessionStore(role);
  console.log('SESSIONSTORE:', this.sessionStore);

  /** @type {?Object} The setTimeout resource */
  this._challengeTimeout = null;
});

/**
 * The auth challenge middleware, invoke on top of middleware sequence.
 *
 * @param {socket.io} socket The socket instance.
 * @param {Function} next Pass control.
 * @return {Promise} A Promise.
 * @static
 */
SockAuth.challenge = function(socket, next) {
  var sockAuth = new SockAuth(socket, next);
  return sockAuth.challenge();
};


/**
 * Start the after-connection handshake to authenticate the client and user.
 *
 * @return {Promise} a promise.
 */
SockAuth.prototype.challenge = function() {
  // challenge the client
  this.socket.emit('challenge', null, this._onChallengeReply.bind(this));
  this._challengeTimeout = setTimeout(this._abortChallenge.bind(this),
    config.websocket.challengeTimeout);

  return this.defer.promise;
};

/**
 * Client responds to the challenge sent, examine and reject or allow.
 *
 * @param {Object} clientResponse the client's response.
 * @private
 */
SockAuth.prototype._onChallengeReply = function(clientResponse) {
  if (this.decided) { return; }
  this.decided = true;

  // clear handshake timeout
  clearTimeout(this._challengeTimeout);
  this._challengeTimeout = null;

  var appErr;
  if (!__.isString(clientResponse)) {
    log.warn('_onChallengeReply() :: Client response not a string. Sockid:',
      this.socket.id);
    appErr = new appError.Error('Wrong response format');
    this.defer.reject(appErr);
  }

  var self = this;
  this.sessionStore.redisStore.get(clientResponse, function(err, res) {
    if (err) {
      log.warn('_onChallengeReply() :: Redis query error:', err.message,
        'SockId:', self.socket.id);
      self.defer.reject(err);
      return;
    }

    if (!__.isObject(res)) {
      log.warn('_onChallengeReply() :: Session Token not found in Redis.',
        'Token:', clientResponse, 'SockId:', self.socket.id);
      appErr = new appError.Error('Session Token not found');
      self.defer.reject(appErr);
      return;
    }

    self.socket.emit('authorized');

    self.defer.resolve();
  });

};

/**
 * Abort a Challenge operation due to timeout.
 *
 * @private
 */
SockAuth.prototype._abortChallenge = function() {
  if (this.decided) { return; }
  this.decided = true;

  var appErr = new appError.Error('Challenge timeout');
  this.defer.reject(appErr);
};

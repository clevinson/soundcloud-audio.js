'use strict';

var SOUNDCLOUD_API_URL = 'https://api.soundcloud.com';

var anchor;
var keys = 'protocol hostname host pathname port search hash href'.split(' ');
function _parseURL(url) {
  if (!anchor) {
    anchor = document.createElement('a');
  }

  var result = {};

  anchor.href = url || '';

  for (var i = 0, len = keys.length; i < len; i++) {
    var key = keys[i];
    result[key] = anchor[key];
  }

  return result;
}

function _appendQueryParam(url, param, value) {
  var U = _parseURL(url);
  var regex = /\?(?:.*)$/;
  var chr = regex.test(U.search) ? '&' : '?';
  var result =
    U.protocol +
    '//' +
    U.host +
    U.port +
    U.pathname +
    U.search +
    chr +
    param +
    '=' +
    value +
    U.hash;

  return result;
}

function _getAccessToken(clientId, clientSecret, callback) {
  var xhr = new XMLHttpRequest();

  var oauthUrl = SOUNDCLOUD_API_URL + "/oauth2/token";

  var data = new FormData();
  data.append("client_id", clientId);
  data.append("client_secret", clientSecret);
  data.append("grant_type", "client_credentials");


  xhr.open('POST', oauthUrl);
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        var resp = {};
        try {
          resp = JSON.parse(xhr.responseText);
        } catch (err) {
          // fail silently
        }
        callback(resp);
      }
    }
  };

  xhr.send(data);
}

function SoundCloud(clientId, clientSecret, apiUrl) {
  if (!(this instanceof SoundCloud)) {
    return new SoundCloud(clientId, apiUrl);
  }

  if (!(clientId && clientSecret) && !apiUrl) {
    console.info('SoundCloud API requires clientId with clientSecret or custom apiUrl');
  }

  this._events = {};

  this._clientId = clientId;
  this._clientSecret = clientSecret;
  this._baseUrl = apiUrl || SOUNDCLOUD_API_URL;

  this.playing = false;
  this.duration = 0;

  this.audio = document.createElement('audio');
}

SoundCloud.prototype.resolve = function(url, callback) {
  var resolveUrl = url;
    //this._baseUrl + '/resolve.json?url=' + encodeURIComponent(url);


  this._authAndJson(
    resolveUrl,
    function(data) {
      this.cleanData();

      if (Array.isArray(data)) {
        data = { tracks: data };
      }

      if (data.tracks) {
        data.tracks = data.tracks.map(this._transformTrack.bind(this));
        this._playlist = data;
      } else {
        this._track = this._transformTrack(data);

        // save timings
        var U = _parseURL(url);
        this._track.stream_url += U.hash;
      }

      this.duration =
        data.duration && !isNaN(data.duration)
          ? data.duration / 1000 // convert to seconds
          : 0; // no duration is zero

      callback(data);
    }.bind(this)
  );
};

// deprecated
SoundCloud.prototype._jsonp = function(url, callback) {
  var target = document.getElementsByTagName('script')[0] || document.head;
  var script = document.createElement('script');
  var id =
    'jsonp_callback_' + new Date().valueOf() + Math.floor(Math.random() * 1000);

  window[id] = function(data) {
    if (script.parentNode) {
      script.parentNode.removeChild(script);
    }
    window[id] = function() {};
    callback(data);
  };

  script.src = _appendQueryParam(url, 'callback', id);
  target.parentNode.insertBefore(script, target);
};


SoundCloud.prototype._authAndJson = function(url, callback) {
  if (this._accessToken != null) {
    this._json(url, callback)
  } else {
    let scObj = this;
    console.log("getting access token!");
    _getAccessToken(this._clientId, this._clientSecret, function(response) {
      console.log(response.access_token)
      scObj._accessToken = response.access_token;
      console.log("got access token!");
      scObj._json(url, callback)
    });
  }


}

SoundCloud.prototype._json = function(url, callback) {
  var xhr = new XMLHttpRequest();

  xhr.open('GET', url);
  xhr.setRequestHeader("Authorization", `OAuth ${this._accessToken}`)
  xhr.onreadystatechange = function() {
    console.log("DONE!")
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        var resp = {};
        try {
          resp = JSON.parse(xhr.responseText);
        } catch (err) {
          // fail silently
        }
        callback(resp);
      } else {
        console.log('non 200 status!')
        console.log(xhr)
      }
    }
  };

  xhr.send(null);
};

SoundCloud.prototype._transformTrack = function(track) {
  if (this._baseUrl !== SOUNDCLOUD_API_URL) {
    track.original_stream_url = track.stream_url;
    track.stream_url = track.stream_url.replace(
      SOUNDCLOUD_API_URL,
      this._baseUrl
    );
  }

  return track;
};

SoundCloud.prototype.on = function(e, fn) {
  this._events[e] = fn;
  this.audio.addEventListener(e, fn, false);
};

SoundCloud.prototype.off = function(e, fn) {
  this._events[e] = null;
  this.audio.removeEventListener(e, fn);
};

SoundCloud.prototype.unbindAll = function() {
  for (var e in this._events) {
    var fn = this._events[e];
    if (fn) {
      this.off(e, fn);
    }
  }
};

SoundCloud.prototype.preload = function(streamUrl, preloadType) {
  this._track = { stream_url: streamUrl };

  if (preloadType) {
    this.audio.preload = preloadType;
  }

  this.audio.src = streamUrl;
};

SoundCloud.prototype.play = function(options) {
  options = options || {};
  var src;

  if (options.streamUrl) {
    src = options.streamUrl;
  } else if (this._playlist) {
    var length = this._playlist.tracks.length;

    if (length) {
      if (options.playlistIndex === undefined) {
        this._playlistIndex = this._playlistIndex || 0;
      } else {
        this._playlistIndex = options.playlistIndex;
      }

      // be silent if index is out of range
      if (this._playlistIndex >= length || this._playlistIndex < 0) {
        this._playlistIndex = 0;
        return;
      }

      src = this._playlist.tracks[this._playlistIndex].stream_url;
    }
  } else if (this._track) {
    src = this._track.stream_url;
  }

  if (!src) {
    throw new Error(
      'There is no tracks to play, use `streamUrl` option or `load` method'
    );
  }

  if (src !== this.audio.src) {
    this.audio.src = src;
  }

  this.playing = src;

  return this.audio.play();
};

SoundCloud.prototype.pause = function() {
  this.audio.pause();
  this.playing = false;
};

SoundCloud.prototype.stop = function() {
  this.audio.pause();
  this.audio.currentTime = 0;
  this.playing = false;
};

SoundCloud.prototype.next = function(options) {
  options = options || {};
  var tracksLength = this._playlist.tracks.length;

  if (this._playlistIndex >= tracksLength - 1) {
    if (options.loop) {
      this._playlistIndex = -1;
    } else {
      return;
    }
  }

  if (this._playlist && tracksLength) {
    return this.play({ playlistIndex: ++this._playlistIndex });
  }
};

SoundCloud.prototype.previous = function() {
  if (this._playlistIndex <= 0) {
    return;
  }

  if (this._playlist && this._playlist.tracks.length) {
    return this.play({ playlistIndex: --this._playlistIndex });
  }
};

SoundCloud.prototype.seek = function(e) {
  if (!this.audio.readyState) {
    return false;
  }

  var percent =
    e.offsetX / e.target.offsetWidth ||
    (e.layerX - e.target.offsetLeft) / e.target.offsetWidth;

  this.audio.currentTime = percent * (this.audio.duration || 0);
};

SoundCloud.prototype.cleanData = function() {
  this._track = void 0;
  this._playlist = void 0;
};

SoundCloud.prototype.setVolume = function(volumePercentage) {
  if (!this.audio.readyState) {
    return;
  }

  this.audio.volume = volumePercentage;
};

SoundCloud.prototype.setTime = function(seconds) {
  if (!this.audio.readyState) {
    return;
  }

  this.audio.currentTime = seconds;
};

module.exports = SoundCloud;

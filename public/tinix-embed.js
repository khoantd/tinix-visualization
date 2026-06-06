/**
 * TiniX Embed SDK — authenticated BI dashboard embedding
 * Usage: TinixEmbed.render({ container, dashboardId, token, baseUrl })
 */
(function (global) {
  'use strict';

  var LOADER_CLASS = 'tinix-embed-loader';
  var IFRAME_CLASS = 'tinix-embed-iframe';

  function normalizeBaseUrl(baseUrl) {
    return (baseUrl || window.location.origin).replace(/\/$/, '');
  }

  function resolveContainer(container) {
    if (!container) throw new Error('container is required');
    if (typeof container === 'string') {
      var el = document.querySelector(container);
      if (!el) throw new Error('container not found: ' + container);
      return el;
    }
    return container;
  }

  function buildEmbedUrl(baseUrl, dashboardId, token) {
    return baseUrl + '/#/embed/' + encodeURIComponent(dashboardId) + '?token=' + encodeURIComponent(token);
  }

  function createLoader() {
    var loader = document.createElement('div');
    loader.className = LOADER_CLASS;
    loader.setAttribute('role', 'status');
    loader.setAttribute('aria-live', 'polite');
    loader.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;min-height:200px;' +
      'font-family:system-ui,sans-serif;color:#1e3a8a;background:#f8fafc;border-radius:8px;">' +
      '<span>Loading dashboard…</span></div>';
    return loader;
  }

  function matchesOrigin(eventOrigin, baseUrl) {
    try {
      var expected = new URL(baseUrl).origin;
      return eventOrigin === expected;
    } catch (e) {
      return false;
    }
  }

  function render(options) {
    var opts = options || {};
    var container = resolveContainer(opts.container);
    var dashboardId = opts.dashboardId;
    var token = opts.token;
    var baseUrl = normalizeBaseUrl(opts.baseUrl);
    var autoHeight = opts.autoHeight !== false;
    var height = opts.height || '600px';
    var onReady = typeof opts.onReady === 'function' ? opts.onReady : null;
    var onError = typeof opts.onError === 'function' ? opts.onError : null;
    var onTokenExpired = typeof opts.onTokenExpired === 'function' ? opts.onTokenExpired : null;

    if (!dashboardId) throw new Error('dashboardId is required');
    if (!token) throw new Error('token is required');

    container.innerHTML = '';
    var loader = createLoader();
    container.appendChild(loader);

    var iframe = document.createElement('iframe');
    iframe.className = IFRAME_CLASS;
    iframe.title = opts.title || 'TiniX Dashboard';
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.style.width = '100%';
    iframe.style.height = typeof height === 'number' ? height + 'px' : height;
    iframe.style.border = '0';
    iframe.style.display = 'none';
    iframe.src = buildEmbedUrl(baseUrl, dashboardId, token);

    var ready = false;

    function handleMessage(event) {
      if (!matchesOrigin(event.origin, baseUrl)) return;
      var data = event.data;
      if (!data || typeof data.type !== 'string') return;

      if (data.type === 'tinix:ready') {
        ready = true;
        loader.remove();
        iframe.style.display = 'block';
        if (onReady) onReady();
      }

      if (data.type === 'tinix:resize' && autoHeight && typeof data.height === 'number') {
        iframe.style.height = Math.max(200, data.height) + 'px';
      }

      if (data.type === 'tinix:error') {
        if (onError) onError(data);
        if (data.code === '401' && onTokenExpired) onTokenExpired();
      }
    }

    window.addEventListener('message', handleMessage);

    iframe.addEventListener('error', function () {
      if (onError) onError({ code: 'load_error', message: 'Failed to load embed iframe' });
    });

    container.appendChild(iframe);

    return {
      iframe: iframe,
      destroy: function () {
        window.removeEventListener('message', handleMessage);
        container.innerHTML = '';
      },
      isReady: function () {
        return ready;
      },
    };
  }

  var TinixEmbed = { render: render, buildEmbedUrl: buildEmbedUrl };
  global.TinixEmbed = TinixEmbed;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TinixEmbed;
  }
})(typeof window !== 'undefined' ? window : global);

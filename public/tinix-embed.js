/**
 * TiniX Embed SDK — authenticated BI dashboard embedding
 * Usage: TinixEmbed.render({ container, dashboardId, token, baseUrl })
 */
(function (global) {
  'use strict';

  var LOADER_CLASS = 'tinix-embed-loader';
  var IFRAME_CLASS = 'tinix-embed-iframe';
  var ERROR_CLASS = 'tinix-embed-error';
  var LOAD_TIMEOUT_MS = 15000;

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

  function prefersReducedMotion() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function createLoader() {
    var loader = document.createElement('div');
    loader.className = LOADER_CLASS;
    loader.setAttribute('role', 'status');
    loader.setAttribute('aria-live', 'polite');
    loader.setAttribute('aria-label', 'Loading dashboard');

    var pulse = prefersReducedMotion() ? '' : 'animation:tinix-pulse 1.5s ease-in-out infinite;';
    loader.innerHTML =
      '<style>' +
      '@keyframes tinix-pulse{0%,100%{opacity:1}50%{opacity:.45}}' +
      '.tinix-sk{background:#e2e8f0;border-radius:6px;' + pulse + '}' +
      '</style>' +
      '<div style="padding:16px;font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;border-radius:8px;min-height:200px;">' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;">' +
      '<div class="tinix-sk" style="height:52px;"></div>' +
      '<div class="tinix-sk" style="height:52px;"></div>' +
      '<div class="tinix-sk" style="height:52px;"></div>' +
      '</div>' +
      '<div class="tinix-sk" style="height:140px;margin-bottom:10px;"></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
      '<div class="tinix-sk" style="height:100px;"></div>' +
      '<div class="tinix-sk" style="height:100px;"></div>' +
      '</div>' +
      '<p style="margin:14px 0 0;text-align:center;font-size:13px;color:#1e40af;">Loading dashboard…</p>' +
      '</div>';
    return loader;
  }

  function createErrorPanel(message) {
    var panel = document.createElement('div');
    panel.className = ERROR_CLASS;
    panel.setAttribute('role', 'alert');
    panel.innerHTML =
      '<div style="padding:24px;text-align:center;font-family:system-ui,sans-serif;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">' +
      '<p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#1e3a8a;">Unable to load dashboard</p>' +
      '<p style="margin:0;font-size:13px;color:#64748b;">' + (message || 'Please try again.') + '</p>' +
      '</div>';
    return panel;
  }

  function matchesOrigin(eventOrigin, baseUrl) {
    try {
      var expected = new URL(baseUrl).origin;
      if (eventOrigin === expected) return true;
      // Dev fallback: localhost vs 127.0.0.1
      var a = new URL(expected);
      var b = new URL(eventOrigin);
      var localHosts = { localhost: true, '127.0.0.1': true };
      return a.port === b.port && localHosts[a.hostname] && localHosts[b.hostname];
    } catch (e) {
      return false;
    }
  }

  function showErrorState(container, loader, iframe, message, onError, payload, cleanupFn) {
    if (cleanupFn) cleanupFn();
    if (loader && loader.parentNode) loader.remove();
    if (iframe && iframe.parentNode) iframe.remove();
    container.innerHTML = '';
    container.appendChild(createErrorPanel(message));
    if (onError) onError(payload || { code: 'error', message: message });
  }

  function render(options) {
    var opts = options || {};
    var container = resolveContainer(opts.container);
    var dashboardId = opts.dashboardId;
    var token = opts.token;
    var baseUrl = normalizeBaseUrl(opts.baseUrl);
    var autoHeight = opts.autoHeight !== false;
    var height = opts.height || '600px';
    var eager = opts.eager !== false;
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
    if (eager) {
      iframe.setAttribute('loading', 'eager');
    } else {
      iframe.setAttribute('loading', 'lazy');
    }
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.style.width = '100%';
    iframe.style.height = typeof height === 'number' ? height + 'px' : height;
    iframe.style.border = '0';
    iframe.style.display = 'none';
    iframe.src = buildEmbedUrl(baseUrl, dashboardId, token);

    var ready = false;
    var timeoutId = null;

    var cleanedUp = false;

    function cleanup() {
      if (cleanedUp) return;
      cleanedUp = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      window.removeEventListener('message', handleMessage);
    }

    function markReady() {
      if (ready) return;
      ready = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      loader.remove();
      iframe.style.display = 'block';
      if (onReady) onReady();
    }

    function handleMessage(event) {
      if (!matchesOrigin(event.origin, baseUrl)) return;
      var data = event.data;
      if (!data || typeof data.type !== 'string') return;

      if (data.type === 'tinix:ready') {
        markReady();
      }

      if (data.type === 'tinix:resize' && autoHeight && typeof data.height === 'number') {
        iframe.style.height = Math.max(200, data.height) + 'px';
      }

      if (data.type === 'tinix:error') {
        var errMsg = data.message || 'Embed failed';
        showErrorState(container, loader, iframe, errMsg, onError, data, cleanup);
        if (String(data.code) === '401' && onTokenExpired) onTokenExpired();
      }
    }

    window.addEventListener('message', handleMessage);

    timeoutId = setTimeout(function () {
      if (!ready) {
        showErrorState(
          container,
          loader,
          iframe,
          'Dashboard took too long to load. Check publish status and try again.',
          onError,
          { code: 'timeout', message: 'Load timeout exceeded' },
          cleanup
        );
      }
    }, LOAD_TIMEOUT_MS);

    iframe.addEventListener('error', function () {
      showErrorState(container, loader, iframe, 'Failed to load embed iframe.', onError, {
        code: 'load_error',
        message: 'Failed to load embed iframe',
      }, cleanup);
    });

    container.appendChild(iframe);

    return {
      iframe: iframe,
      destroy: function () {
        cleanup();
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

// ══════════════════════════════════════════════════════════════
// NitroPixel — Script Server
// ══════════════════════════════════════════════════════════════
// GET /api/pixel/script?org={orgId}
// Sirve el snippet JS del pixel, configurado con el orgId.
// Se instala via GTM como <script src="..."></script>

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get('org');

  if (!orgId) {
    return new NextResponse('// NitroPixel: missing org parameter', {
      status: 200,
      headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
    });
  }

  // Sanitize orgId: only allow alphanumeric + cuid chars to prevent XSS injection
  // orgId is interpolated directly into JavaScript source, so must be safe
  const safeOrgId = orgId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (safeOrgId !== orgId || safeOrgId.length === 0) {
    return new NextResponse('// NitroPixel: invalid org parameter', {
      status: 200,
      headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
    });
  }

  const script = generatePixelScript(safeOrgId);

  return new NextResponse(script, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'Access-Control-Allow-Origin': '*',
    }
  });
}

function generatePixelScript(orgId: string): string {
  // El endpoint donde enviamos eventos
  const endpoint = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/pixel/event`
    : 'https://nitrosales.vercel.app/api/pixel/event';

  return `
(function() {
  'use strict';
  try {
    // ─── Config ───
    var ENDPOINT = '${endpoint}';
    var ORG_ID = '${orgId}';
    var COOKIE_DAYS_VID = 365;
    var COOKIE_DAYS_CLICK = 30;
    var BATCH_DELAY = 2000; // ms antes de enviar batch
    var MAX_BATCH = 5;

    // ─── Utils ───
    function uuid() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    }

    // ─── Root domain detection (cross-subdomain cookies) ───
    // Handles LATAM multi-part TLDs: .com.ar, .com.br, .com.mx, etc.
    // Returns ".mitienda.com.ar" from "www.mitienda.com.ar"
    var _rootDomain = (function() {
      try {
        var host = window.location.hostname;
        if (!host || /^\\d+\\./.test(host) || host === 'localhost') return ''; // IP or localhost: no domain attr
        var multiTld = /\\.(com|co|net|org|edu|gov|gob)\\.(ar|br|mx|cl|co|pe|uy|py|ec|ve|bo)$/;
        var parts = host.split('.');
        if (multiTld.test(host) && parts.length >= 3) {
          return '.' + parts.slice(-3).join('.');
        }
        if (parts.length >= 2) {
          return '.' + parts.slice(-2).join('.');
        }
        return '';
      } catch(e) { return ''; }
    })();

    function getCookie(name) {
      var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    }

    function setCookie(name, value, days) {
      var d = new Date();
      var domainStr = _rootDomain ? ';domain=' + _rootDomain : '';
      if (days > 0) {
        d.setTime(d.getTime() + days * 86400000);
        document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax' + domainStr;
      } else {
        // Session cookie (no expires)
        document.cookie = name + '=' + encodeURIComponent(value) + ';path=/;SameSite=Lax' + domainStr;
      }
    }

    // ─── Visitor ID (persiste 365 dias) ───
    var vid = getCookie('_np_vid');
    if (!vid) {
      vid = uuid();
      setCookie('_np_vid', vid, COOKIE_DAYS_VID);
    }

    // ─── Click IDs & UTMs — MUST be parsed BEFORE session logic ───
    // We need to know if there are fresh click IDs in the URL to decide whether
    // to force a new session (like Triple Whale does).
    var clickIds = {};
    var utmParams = {};
    var _signalsFresh = false;
    try {
      var params = new URLSearchParams(window.location.search);
      var clickKeys = ['fbclid', 'gclid', 'ttclid', 'li_fat_id', 'msclkid'];
      var utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

      clickKeys.forEach(function(k) {
        var v = params.get(k);
        if (v) clickIds[k] = v;
      });

      utmKeys.forEach(function(k) {
        var v = params.get(k);
        if (v) utmParams[k.replace('utm_', '')] = v;
      });
    } catch(e) {}

    var hasUrlClickIds = Object.keys(clickIds).length > 0;
    var hasUrlUtms = Object.keys(utmParams).length > 0;
    _signalsFresh = hasUrlClickIds || hasUrlUtms;

    // ─── Session ID — with forced reset on new ad clicks ───
    // CRITICAL for cross-platform attribution: when a user clicks a NEW ad
    // (different click ID than what's in the cookie), we MUST start a new session.
    // Without this, a Google Ads click at 14:00 and a Meta Ads click at 16:00
    // stay in the same session, and only Google gets credit.
    // This mirrors Triple Whale's behavior.
    var sid = getCookie('_np_sid');
    var _forceNewSession = false;

    if (sid && hasUrlClickIds) {
      // Check if the new click IDs differ from what's stored
      var savedClickRaw = getCookie('_np_click');
      if (savedClickRaw) {
        try {
          var savedClicks = JSON.parse(savedClickRaw);
          // Compare: if any click ID key changed value, or a new platform appeared
          var isDifferentClick = false;
          for (var ck in clickIds) {
            if (!savedClicks[ck] || savedClicks[ck] !== clickIds[ck]) {
              isDifferentClick = true;
              break;
            }
          }
          // Also check if platform changed entirely (e.g., had gclid, now has fbclid)
          if (!isDifferentClick) {
            for (var sk in savedClicks) {
              if (savedClicks[sk] && !clickIds[sk]) {
                isDifferentClick = true;
                break;
              }
            }
          }
          if (isDifferentClick) {
            _forceNewSession = true;
          }
        } catch(e) {
          _forceNewSession = true; // Can't parse old cookie → treat as new
        }
      }
      // No saved clicks but URL has clicks → also force new session
      // (could be first paid click after organic sessions)
      if (!savedClickRaw && hasUrlClickIds) {
        _forceNewSession = true;
      }
    }

    // Also force new session if URL has fresh UTMs and they differ from saved
    if (sid && hasUrlUtms && !_forceNewSession) {
      var savedUtmRaw = getCookie('_np_utm');
      if (savedUtmRaw) {
        try {
          var savedUtms = JSON.parse(savedUtmRaw);
          if (utmParams.source !== savedUtms.source || utmParams.medium !== savedUtms.medium || utmParams.campaign !== savedUtms.campaign) {
            _forceNewSession = true;
          }
        } catch(e) { _forceNewSession = true; }
      } else {
        _forceNewSession = true; // Had no UTMs, now has → new campaign click
      }
    }

    var _isNewSession = !sid || _forceNewSession;
    if (_isNewSession) {
      sid = uuid();
      setCookie('_np_sid', sid, 0);
    }

    var _isLanding = _isNewSession;

    // ─── Persist click IDs & UTMs ───
    try {
      if (hasUrlClickIds) {
        setCookie('_np_click', JSON.stringify(clickIds), COOKIE_DAYS_CLICK);
        try { localStorage.setItem('_np_click', JSON.stringify(clickIds)); } catch(e) {}
      } else {
        // Recuperar de cookie primero, luego localStorage (cross-domain)
        var saved = getCookie('_np_click');
        if (!saved) { try { saved = localStorage.getItem('_np_click'); } catch(e) {} }
        if (saved) {
          try { clickIds = JSON.parse(saved); } catch(e) {}
        }
      }

      if (hasUrlUtms) {
        setCookie('_np_utm', JSON.stringify(utmParams), COOKIE_DAYS_CLICK);
        try { localStorage.setItem('_np_utm', JSON.stringify(utmParams)); } catch(e) {}
      } else {
        var savedUtm = getCookie('_np_utm');
        if (!savedUtm) { try { savedUtm = localStorage.getItem('_np_utm'); } catch(e) {} }
        if (savedUtm) {
          try { utmParams = JSON.parse(savedUtm); } catch(e) {}
        }
      }

      // Persist visitor ID in localStorage too (survives cross-domain)
      try {
        var storedVid = localStorage.getItem('_np_vid');
        if (!getCookie('_np_vid') && storedVid && storedVid.length > 10) {
          vid = storedVid;
          setCookie('_np_vid', vid, COOKIE_DAYS_VID);
        }
        if (vid && vid.length > 10) {
          localStorage.setItem('_np_vid', vid);
        }
      } catch(e) {}
    } catch(e) {}

    // ─── Device detection ───
    var deviceType = /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' :
                     /Tablet|iPad/i.test(navigator.userAgent) ? 'tablet' : 'desktop';

    // ─── Browser Fingerprint (lightweight, for analytics only) ───
    // Generates a stable hash from canvas, screen, timezone, language, WebGL.
    // Stored in cookie + localStorage for cross-session persistence.
    // IMPORTANT: This is DATA-ONLY — never used for visitor merge/lookup.
    // Sent as _fp in event props for future cross-session analysis.
    var _fingerprint = (function() {
      try {
        // Check cached first
        var cached = getCookie('_np_fp');
        if (!cached) { try { cached = localStorage.getItem('_np_fp'); } catch(e) {} }
        if (cached && cached.length > 10) return cached;

        var components = [];

        // Canvas fingerprint
        try {
          var c = document.createElement('canvas');
          c.width = 200; c.height = 30;
          var ctx = c.getContext('2d');
          if (ctx) {
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125,1,62,20);
            ctx.fillStyle = '#069';
            ctx.fillText('NP.fp', 2, 15);
            ctx.fillStyle = 'rgba(102,204,0,0.7)';
            ctx.fillText('NP.fp', 4, 17);
            components.push(c.toDataURL().slice(0, 100));
          } else { components.push('no-canvas'); }
        } catch(e) { components.push('no-canvas'); }

        // Screen
        components.push(screen.width + 'x' + screen.height + 'x' + (screen.colorDepth || 24));

        // Timezone
        try {
          components.push(Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown-tz');
        } catch(e) { components.push('no-tz'); }

        // Language
        components.push(navigator.languages ? navigator.languages.join(',') : (navigator.language || 'unknown'));

        // Platform + cores
        components.push((navigator.platform || 'unknown') + '|' + (navigator.hardwareConcurrency || 0));

        // WebGL renderer
        try {
          var gl = document.createElement('canvas').getContext('webgl');
          if (gl) {
            var ext = gl.getExtension('WEBGL_debug_renderer_info');
            components.push(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'no-webgl-ext');
          } else { components.push('no-webgl'); }
        } catch(e) { components.push('no-webgl'); }

        // Simple hash (djb2)
        var raw = components.join('|||');
        var hash = 5381;
        for (var i = 0; i < raw.length; i++) {
          hash = ((hash << 5) + hash) + raw.charCodeAt(i);
          hash = hash & hash; // Convert to 32bit int
        }
        var fp = 'fp_' + (hash >>> 0).toString(36) + '_' + raw.length.toString(36);

        // Persist
        setCookie('_np_fp', fp, 365);
        try { localStorage.setItem('_np_fp', fp); } catch(e) {}
        return fp;
      } catch(e) { return null; }
    })();

    // ─── Event queue + batching ───
    var queue = [];
    var timer = null;

    function flush() {
      if (queue.length === 0) return;
      timer = null; // Reset timer so enqueue can set new ones
      var batch = queue.splice(0, MAX_BATCH);
      var payload = JSON.stringify({ events: batch });

      // Enviar con text/plain para evitar CORS preflight
      // (application/json triggerea preflight que VTEX checkout bloquea silenciosamente)
      // fetch+keepalive es más confiable que sendBeacon (Triple Whale pattern)
      var sent = false;
      try {
        if (typeof fetch !== 'undefined') {
          fetch(ENDPOINT + '?org=' + ORG_ID, {
            method: 'POST',
            body: payload,
            keepalive: true,
            headers: { 'Content-Type': 'text/plain' }
          }).catch(function(err) {
            // fetch falló — fallback a sendBeacon
            if (!sent && navigator.sendBeacon) {
              var blob = new Blob([payload], { type: 'text/plain' });
              navigator.sendBeacon(ENDPOINT + '?org=' + ORG_ID, blob);
            }
          });
          sent = true;
        }
      } catch(e) {}
      // Último fallback: sendBeacon
      if (!sent && navigator.sendBeacon) {
        var blob = new Blob([payload], { type: 'text/plain' });
        navigator.sendBeacon(ENDPOINT + '?org=' + ORG_ID, blob);
      }

      // Si quedan eventos, programar otro flush
      if (queue.length > 0) {
        timer = setTimeout(flush, BATCH_DELAY);
      }
    }

    function enqueue(event) {
      queue.push(event);
      if (queue.length >= MAX_BATCH) {
        if (timer) clearTimeout(timer);
        flush();
      } else if (!timer) {
        timer = setTimeout(flush, BATCH_DELAY);
      }
    }

    // ─── Track event ───
    var _eventIndex = 0; // Tracks event order within this page load
    function trackEvent(type, props) {
      var isFirstEvent = (_eventIndex === 0);
      _eventIndex++;
      var mergedProps = props || {};
      if (_fingerprint) mergedProps._fp = _fingerprint;
      enqueue({
        type: type,
        props: mergedProps,
        visitor_id: vid,
        session_id: sid,
        click_ids: clickIds,
        utm_params: utmParams,
        signals_fresh: _signalsFresh, // TRUE = click IDs/UTMs from current URL, not cookie
        is_landing: _isLanding && isFirstEvent, // TRUE = first event of a new session
        timestamp: Date.now(),
        page_url: window.location.href,
        referrer: (function() {
          try {
            var ref = document.referrer || '';
            if (!ref) return '';
            var refHost = new URL(ref).hostname.toLowerCase().replace(/^www\\./, '');
            var ownHost = window.location.hostname.toLowerCase().replace(/^www\\./, '');
            return refHost === ownHost ? '' : ref;
          } catch(e) { return document.referrer || ''; }
        })(),
        device_type: deviceType
      });
    }

    // ─── Identify ───
    function identify(props) {
      if (!props || !props.email) return;
      enqueue({
        type: 'IDENTIFY',
        props: { email: props.email },
        visitor_id: vid,
        session_id: sid,
        click_ids: clickIds,
        utm_params: utmParams,
        timestamp: Date.now(),
        page_url: window.location.href,
        referrer: '',
        device_type: deviceType
      });
    }

    // ─── API publica ───
    window.NitroPixel = function(action, eventNameOrProps, props) {
      try {
        if (action === 'track') {
          trackEvent(eventNameOrProps, props || {});
        } else if (action === 'identify') {
          identify(eventNameOrProps);
        }
      } catch(e) { /* silencioso */ }
    };

    // ─── Dedup: evitar enviar el mismo evento 2 veces ───
    var _sentPurchases = {};

    // ─── PageView automatico ───
    trackEvent('PAGE_VIEW', { title: document.title });

    // ─── SPA Navigation Tracking ───
    // VTEX is a Single Page Application — internal navigation (category browsing,
    // product clicks, search) uses pushState/replaceState without full page reloads.
    // Without this hook, NitroPixel only tracks the initial page load (~1.9 pages/session
    // vs GA4's ~10.5). This intercepts History API to fire PAGE_VIEW on each navigation.
    (function() {
      try {
        var _lastUrl = window.location.href;
        var _lastTitle = document.title;

        function onUrlChange() {
          var newUrl = window.location.href;
          if (newUrl === _lastUrl) return; // Same URL, ignore
          _lastUrl = newUrl;
          // Wait a tick for the page title to update
          setTimeout(function() {
            var newTitle = document.title || _lastTitle;
            _lastTitle = newTitle;
            trackEvent('PAGE_VIEW', { title: newTitle, spa: true });

            // Check if new URL is a product page → fire VIEW_PRODUCT
            var pathname = window.location.pathname;
            var isProduct = /\\/p\\/?$/.test(pathname) || /\\/p\\?/.test(window.location.href);
            if (isProduct) {
              setTimeout(function() {
                // Only if dataLayer didn't generate a VIEW_PRODUCT for this product
                var productName = document.title.replace(/\\s*[-|].*$/, '').trim();
                var dedupKey = productName || pathname;
                if (!_sentProductViews[dedupKey]) {
                  _sentProductViews[dedupKey] = true;
                  trackEvent('VIEW_PRODUCT', {
                    productName: productName || '',
                    source: 'spa_navigation'
                  });
                }
              }, 1500); // Wait for page content to render
            }
          }, 100);
        }

        // Intercept pushState
        var origPushState = history.pushState;
        history.pushState = function() {
          var result = origPushState.apply(this, arguments);
          onUrlChange();
          return result;
        };

        // Intercept replaceState
        var origReplaceState = history.replaceState;
        history.replaceState = function() {
          var result = origReplaceState.apply(this, arguments);
          onUrlChange();
          return result;
        };

        // Listen for popstate (back/forward navigation)
        window.addEventListener('popstate', onUrlChange);

        // Also watch for hashchange (VTEX checkout uses #/cart, #/payment, etc.)
        window.addEventListener('hashchange', onUrlChange);
      } catch(e) {}
    })();

    // ══════════════════════════════════════════════════════════════
    // LAYER 1: VTEX dataLayer — orderPlaced purchase detection
    // ══════════════════════════════════════════════════════════════
    // VTEX pushes an orderPlaced event to window.dataLayer when a
    // customer completes checkout. This contains transactionId,
    // transactionTotal, visitorContactInfo (email), and products.
    // We intercept this to fire IDENTIFY + PURCHASE immediately.
    // This is the PRIMARY and most reliable purchase tracking method.
    // ══════════════════════════════════════════════════════════════

    function processOrderPlaced(dl) {
      try {
        if (!dl) return;

        // ─── Extract orderId from ALL possible VTEX formats ───
        var orderId = dl.transactionId;  // Flat format (checkout6)
        // VTEX IO Enhanced Ecommerce format
        if (!orderId && dl.ecommerce && dl.ecommerce.purchase && dl.ecommerce.purchase.actionField) {
          orderId = dl.ecommerce.purchase.actionField.id;
        }
        // GA4 format
        if (!orderId && dl.ecommerce) {
          orderId = dl.ecommerce.transaction_id;
        }
        // orderGroup fallback (VTEX confirmation page)
        if (!orderId && dl.orderGroup) {
          orderId = dl.orderGroup;
        }
        if (!orderId) return;

        if (_sentPurchases[orderId]) return;
        _sentPurchases[orderId] = true;

        // ─── Extract email from ALL possible locations ───
        var email = null;
        // Flat format: visitorContactInfo
        if (dl.visitorContactInfo) {
          var vci = dl.visitorContactInfo;
          if (Array.isArray(vci)) {
            for (var i = 0; i < vci.length; i++) {
              if (typeof vci[i] === 'string' && vci[i].indexOf('@') > -1) {
                email = vci[i]; break;
              }
            }
          } else if (typeof vci === 'string' && vci.indexOf('@') > -1) {
            email = vci;
          }
        }
        if (!email && dl.visitorEmail) email = dl.visitorEmail;
        // Enhanced Ecommerce format
        if (!email && dl.ecommerce && dl.ecommerce.purchase && dl.ecommerce.purchase.actionField) {
          email = dl.ecommerce.purchase.actionField.email;
        }

        // IDENTIFY first (so server links visitor to email before PURCHASE)
        if (email) {
          identify({ email: email });
        }

        // ─── Extract total from ALL possible locations ───
        var total = dl.transactionTotal || 0;
        if (!total && dl.ecommerce && dl.ecommerce.purchase && dl.ecommerce.purchase.actionField) {
          total = parseFloat(dl.ecommerce.purchase.actionField.revenue) || 0;
        }
        if (!total && dl.ecommerce && dl.ecommerce.value) {
          total = parseFloat(dl.ecommerce.value) || 0;
        }

        // ─── Extract products from ALL possible formats ───
        var products = [];
        // Flat format (checkout6)
        if (dl.transactionProducts && Array.isArray(dl.transactionProducts)) {
          dl.transactionProducts.forEach(function(p) {
            products.push({
              id: p.id || p.sku || '',
              name: p.name || '',
              price: p.sellingPrice || p.price || 0,
              quantity: p.quantity || 1
            });
          });
        }
        // Enhanced Ecommerce format
        if (products.length === 0 && dl.ecommerce && dl.ecommerce.purchase && dl.ecommerce.purchase.products) {
          dl.ecommerce.purchase.products.forEach(function(p) {
            products.push({
              id: p.id || p.sku || '',
              name: p.name || '',
              price: parseFloat(p.price) || 0,
              quantity: parseInt(p.quantity) || 1
            });
          });
        }
        // GA4 items format
        if (products.length === 0 && dl.ecommerce && dl.ecommerce.items) {
          dl.ecommerce.items.forEach(function(p) {
            products.push({
              id: p.item_id || p.id || '',
              name: p.item_name || p.name || '',
              price: parseFloat(p.price) || 0,
              quantity: parseInt(p.quantity) || 1
            });
          });
        }

        // Fire PURCHASE event with full order data
        trackEvent('PURCHASE', {
          orderId: orderId,
          total: total,
          shipping: dl.transactionShipping || 0,
          tax: dl.transactionTax || 0,
          currency: dl.transactionCurrency || dl.currency || 'ARS',
          email: email || '',
          products: products,
          source: 'dataLayer'
        });

        // Force flush immediately (user may close tab)
        setTimeout(flush, 100);
      } catch(e) {}
    }

    // ══════════════════════════════════════════════════════════════
    // LAYER 1.5: VTEX dataLayer — Product View & Add to Cart
    // ══════════════════════════════════════════════════════════════
    // VTEX pushes ecommerce events to dataLayer for product views
    // and cart interactions. Without intercepting these, the funnel
    // shows 0 for "Vieron Producto" and "Carrito".
    //
    // VTEX formats:
    // - checkout6 flat: { event: 'productView', ... }
    // - Enhanced Ecommerce: { ecommerce: { detail: {...} } }
    // - GA4: { event: 'view_item', ecommerce: { items: [...] } }
    // - addToCart: { event: 'addToCart', ... } or { event: 'add_to_cart', ... }
    // ══════════════════════════════════════════════════════════════

    var _sentProductViews = {}; // Dedup: productId → true (avoid counting same product twice per session)

    function processProductView(dl) {
      try {
        if (!dl) return;

        // Extract product info from ALL possible VTEX formats
        var productId = null;
        var productName = null;
        var productPrice = null;
        var productCategory = null;

        // Format 1: VTEX checkout6 flat (productView event)
        if (dl.productId || dl.productName) {
          productId = dl.productId || dl.skuId || null;
          productName = dl.productName || dl.productTitle || null;
          productPrice = dl.productPrice || null;
          productCategory = dl.productCategory || dl.productDepartment || null;
        }

        // Format 2: Enhanced Ecommerce detail action
        if (!productId && dl.ecommerce && dl.ecommerce.detail) {
          var products = dl.ecommerce.detail.products || dl.ecommerce.detail.items || [];
          if (products.length > 0) {
            var p = products[0];
            productId = p.id || p.item_id || null;
            productName = p.name || p.item_name || null;
            productPrice = parseFloat(p.price) || null;
            productCategory = p.category || p.item_category || null;
          }
        }

        // Format 3: GA4 view_item
        if (!productId && dl.ecommerce && dl.ecommerce.items) {
          var items = dl.ecommerce.items;
          if (items.length > 0) {
            productId = items[0].item_id || items[0].id || null;
            productName = items[0].item_name || items[0].name || null;
            productPrice = parseFloat(items[0].price) || null;
            productCategory = items[0].item_category || null;
          }
        }

        // Dedup: same product in same session = 1 event
        var dedupKey = productId || productName || '';
        if (!dedupKey || _sentProductViews[dedupKey]) return;
        _sentProductViews[dedupKey] = true;

        trackEvent('VIEW_PRODUCT', {
          productId: productId || '',
          productName: productName || '',
          price: productPrice || 0,
          category: productCategory || '',
          source: 'dataLayer'
        });
      } catch(e) {}
    }

    function processAddToCart(dl) {
      try {
        if (!dl) return;

        var products = [];

        // Format 1: VTEX checkout6 flat (addToCart event with productId)
        if (dl.productId || dl.skuId) {
          products.push({
            id: dl.productId || dl.skuId || '',
            name: dl.productName || '',
            price: dl.productPrice || 0,
            quantity: dl.quantity || 1
          });
        }

        // Format 2: Enhanced Ecommerce add action
        if (products.length === 0 && dl.ecommerce && dl.ecommerce.add) {
          var addProducts = dl.ecommerce.add.products || dl.ecommerce.add.items || [];
          addProducts.forEach(function(p) {
            products.push({
              id: p.id || p.item_id || '',
              name: p.name || p.item_name || '',
              price: parseFloat(p.price) || 0,
              quantity: parseInt(p.quantity) || 1
            });
          });
        }

        // Format 3: GA4 add_to_cart with ecommerce.items
        if (products.length === 0 && dl.ecommerce && dl.ecommerce.items) {
          dl.ecommerce.items.forEach(function(p) {
            products.push({
              id: p.item_id || p.id || '',
              name: p.item_name || p.name || '',
              price: parseFloat(p.price) || 0,
              quantity: parseInt(p.quantity) || 1
            });
          });
        }

        if (products.length === 0) return;

        trackEvent('ADD_TO_CART', {
          products: products,
          totalValue: products.reduce(function(sum, p) { return sum + (p.price * p.quantity); }, 0),
          source: 'dataLayer'
        });
      } catch(e) {}
    }

    // Detect product view entries in dataLayer
    function isProductViewEntry(entry) {
      if (!entry) return false;
      // VTEX checkout6: event = 'productView'
      if (entry.event === 'productView') return true;
      // GA4: event = 'view_item'
      if (entry.event === 'view_item') return true;
      // Enhanced Ecommerce: ecommerce.detail present
      if (entry.ecommerce && entry.ecommerce.detail) return true;
      return false;
    }

    // Detect add-to-cart entries in dataLayer
    function isAddToCartEntry(entry) {
      if (!entry) return false;
      // VTEX: event = 'addToCart'
      if (entry.event === 'addToCart') return true;
      // GA4: event = 'add_to_cart'
      if (entry.event === 'add_to_cart') return true;
      // Enhanced Ecommerce: ecommerce.add present
      if (entry.ecommerce && entry.ecommerce.add) return true;
      return false;
    }

    // Helper: check if a dataLayer entry looks like a purchase event
    function isPurchaseEntry(entry) {
      if (!entry) return false;
      // VTEX checkout6 flat format
      if (entry.event === 'orderPlaced') return true;
      if (entry.transactionId) return true;
      // GA4 / VTEX IO format
      if (entry.event === 'purchase') return true;
      // Enhanced Ecommerce with nested purchase data
      if (entry.ecommerce && entry.ecommerce.purchase) return true;
      // VTEX orderGroup present
      if (entry.orderGroup) return true;
      return false;
    }

    // Scan existing dataLayer entries (events may already be there)
    function scanDataLayer() {
      try {
        if (!window.dataLayer || !Array.isArray(window.dataLayer)) return;
        for (var i = 0; i < window.dataLayer.length; i++) {
          var entry = window.dataLayer[i];
          if (isPurchaseEntry(entry)) {
            processOrderPlaced(entry);
          } else if (isProductViewEntry(entry)) {
            processProductView(entry);
          } else if (isAddToCartEntry(entry)) {
            processAddToCart(entry);
          }
        }
      } catch(e) {}
    }

    // Intercept future dataLayer.push calls
    function hookDataLayer() {
      try {
        if (!window.dataLayer) window.dataLayer = [];
        var originalPush = window.dataLayer.push;
        window.dataLayer.push = function() {
          var result = originalPush.apply(window.dataLayer, arguments);
          for (var i = 0; i < arguments.length; i++) {
            var arg = arguments[i];
            if (isPurchaseEntry(arg)) {
              processOrderPlaced(arg);
            } else if (isProductViewEntry(arg)) {
              processProductView(arg);
            } else if (isAddToCartEntry(arg)) {
              processAddToCart(arg);
            }
          }
          return result;
        };
      } catch(e) {}
    }

    scanDataLayer();
    hookDataLayer();

    // ── URL-based product page fallback ──
    // If we're on a VTEX product page (URL ends in /p or matches product pattern)
    // and dataLayer didn't fire a productView within 2s, fire VIEW_PRODUCT from URL.
    // This ensures product views are tracked even if dataLayer is broken or delayed.
    (function() {
      try {
        var url = window.location.pathname;
        // VTEX product pages: /product-name/p or /product-name-SKU/p
        var isProductPage = /\\/p\\/?$/.test(url) || /\\/p\\?/.test(window.location.href);
        if (isProductPage) {
          setTimeout(function() {
            // Only fire if dataLayer didn't already generate a VIEW_PRODUCT
            if (Object.keys(_sentProductViews).length === 0) {
              // Extract product name from page title or URL
              var name = document.title.replace(/\\s*[-|].*$/, '').trim();
              trackEvent('VIEW_PRODUCT', {
                productName: name || '',
                source: 'url_fallback'
              });
            }
          }, 2000);
        }
      } catch(e) {}
    })();

    // ── ADD_TO_CART: Intercept VTEX orderForm API calls ──
    // VTEX adds items to cart via POST /api/checkout/pub/orderForm/{id}/items
    // We intercept fetch() to detect this without requiring dataLayer/GTM support.
    // Also intercept "buy button" clicks as a fallback.
    (function() {
      try {
        // Method 1: Intercept fetch() for VTEX orderForm items endpoint
        if (typeof window.fetch === 'function') {
          var _originalFetch = window.fetch;
          window.fetch = function(url, opts) {
            var result = _originalFetch.apply(this, arguments);
            try {
              var urlStr = typeof url === 'string' ? url : (url && url.url ? url.url : '');
              // VTEX add-to-cart: POST /api/checkout/pub/orderForm/{id}/items
              if (opts && opts.method && opts.method.toUpperCase() === 'POST' &&
                  urlStr.indexOf('/api/checkout/pub/orderForm/') > -1 &&
                  urlStr.indexOf('/items') > -1) {
                result.then(function(response) {
                  try {
                    // Clone response so original consumer isn't affected
                    response.clone().json().then(function(data) {
                      if (data && data.items && data.items.length > 0) {
                        var products = data.items.map(function(item) {
                          return {
                            id: item.productId || item.id || '',
                            name: item.name || '',
                            price: (item.sellingPrice || item.price || 0) / 100,
                            quantity: item.quantity || 1
                          };
                        });
                        trackEvent('ADD_TO_CART', {
                          products: products,
                          totalValue: products.reduce(function(s, p) { return s + p.price * p.quantity; }, 0),
                          source: 'vtex_orderform_api'
                        });
                      }
                    }).catch(function() {});
                  } catch(e) {}
                }).catch(function() {});
              }
            } catch(e) {}
            return result;
          };
        }

        // Method 2: Intercept XMLHttpRequest for older VTEX implementations
        if (typeof XMLHttpRequest !== 'undefined') {
          var _origOpen = XMLHttpRequest.prototype.open;
          var _origSend = XMLHttpRequest.prototype.send;
          XMLHttpRequest.prototype.open = function(method, url) {
            this._npMethod = method;
            this._npUrl = url;
            return _origOpen.apply(this, arguments);
          };
          XMLHttpRequest.prototype.send = function() {
            var self = this;
            try {
              if (self._npMethod && self._npMethod.toUpperCase() === 'POST' &&
                  self._npUrl && self._npUrl.indexOf('/api/checkout/pub/orderForm/') > -1 &&
                  self._npUrl.indexOf('/items') > -1) {
                self.addEventListener('load', function() {
                  try {
                    var data = JSON.parse(self.responseText);
                    if (data && data.items && data.items.length > 0) {
                      var products = data.items.map(function(item) {
                        return {
                          id: item.productId || item.id || '',
                          name: item.name || '',
                          price: (item.sellingPrice || item.price || 0) / 100,
                          quantity: item.quantity || 1
                        };
                      });
                      trackEvent('ADD_TO_CART', {
                        products: products,
                        totalValue: products.reduce(function(s, p) { return s + p.price * p.quantity; }, 0),
                        source: 'vtex_orderform_xhr'
                      });
                    }
                  } catch(e) {}
                });
              }
            } catch(e) {}
            return _origSend.apply(this, arguments);
          };
        }
      } catch(e) {}
    })();

    // Re-scan dataLayer agresivamente en orderPlaced pages (VTEX puede pushear tarde)
    if (/orderPlaced/i.test(window.location.href)) {
      setTimeout(scanDataLayer, 500);
      setTimeout(scanDataLayer, 1000);
      setTimeout(scanDataLayer, 2000);
      setTimeout(scanDataLayer, 3000);
      setTimeout(scanDataLayer, 5000);
      setTimeout(scanDataLayer, 8000);
    }

    // ══════════════════════════════════════════════════════════════
    // LAYER 2: VTEX Checkout — email identification + orderForm
    // ══════════════════════════════════════════════════════════════
    // Captures customer email during checkout flow (before purchase).
    // Works on /checkout/ pages via vtexjs, orderForm API, and DOM.
    // ══════════════════════════════════════════════════════════════

    var _identifiedEmail = null;

    function tryVtexIdentify() {
      try {
        // Method 1: vtexjs global (available on VTEX checkout pages)
        if (window.vtexjs && window.vtexjs.checkout && window.vtexjs.checkout.orderForm) {
          var cpd = window.vtexjs.checkout.orderForm.clientProfileData;
          if (cpd && cpd.email && cpd.email !== _identifiedEmail) {
            _identifiedEmail = cpd.email;
            identify({ email: cpd.email });
            return;
          }
        }

        // Method 2: VTEX orderForm REST API
        fetch('/api/checkout/pub/orderForm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: '{}'
        }).then(function(r) { return r.json(); }).then(function(of) {
          if (of && of.clientProfileData && of.clientProfileData.email) {
            if (of.clientProfileData.email !== _identifiedEmail) {
              _identifiedEmail = of.clientProfileData.email;
              identify({ email: of.clientProfileData.email });
            }
          }
        }).catch(function() {});
      } catch(e) {}
    }

    // Method 3: Observe DOM for email input in checkout
    function observeCheckoutEmail() {
      try {
        var emailInput = document.querySelector('#client-email, input[name="email"], .client-profile-data input[type="email"]');
        if (emailInput && emailInput.value && emailInput.value.indexOf('@') > -1) {
          if (emailInput.value !== _identifiedEmail) {
            _identifiedEmail = emailInput.value;
            identify({ email: emailInput.value });
          }
        }
      } catch(e) {}
    }

    // Method 4: Listen for orderFormUpdated events (jQuery or vanilla)
    function listenOrderFormUpdated() {
      try {
        // jQuery event (VTEX standard)
        if (window.$ || window.jQuery) {
          var jq = window.$ || window.jQuery;
          jq(window).on('orderFormUpdated.vtex', function(_, of) {
            if (of && of.clientProfileData && of.clientProfileData.email) {
              if (of.clientProfileData.email !== _identifiedEmail) {
                _identifiedEmail = of.clientProfileData.email;
                identify({ email: of.clientProfileData.email });
              }
            }
          });
        }
        // Vanilla event listener fallback
        window.addEventListener('message', function(e) {
          try {
            if (e.data && typeof e.data === 'string') {
              var msg = JSON.parse(e.data);
              if (msg.eventName === 'vtex:orderPlaced' || msg.event === 'orderPlaced') {
                processOrderPlaced(msg);
              }
            }
          } catch(ex) {}
        });
      } catch(e) {}
    }

    // ══════════════════════════════════════════════════════════════
    // AGGRESSIVE CHECKOUT IDENTIFICATION
    // ══════════════════════════════════════════════════════════════
    // Problem: passive detection (timeouts at 2/5/10s) only captures 13%
    // of checkout visitors. Users take 30+ seconds to enter email.
    // Solution: continuous polling + hash change + MutationObserver
    // ══════════════════════════════════════════════════════════════

    if (/checkout|orderPlaced|gatewayCallback/i.test(window.location.href)) {
      // Initial detection attempts
      tryVtexIdentify();
      observeCheckoutEmail();
      listenOrderFormUpdated();

      // Continuous orderForm polling — every 5s for 2 minutes
      var _identifyPollCount = 0;
      var _identifyPollInterval = setInterval(function() {
        _identifyPollCount++;
        if (_identifyPollCount > 24 || _identifiedEmail) {
          clearInterval(_identifyPollInterval);
          return;
        }
        tryVtexIdentify();
        observeCheckoutEmail();
      }, 5000);

      // Hash change detection — VTEX navigates: #/email → #/profile → #/shipping
      // When user moves past email step, the orderForm should have their email
      window.addEventListener('hashchange', function() {
        if (_identifiedEmail) return;
        var h = window.location.hash;
        // User passed email step or is on profile/shipping/payment
        if (/\/(profile|shipping|payment)/i.test(h)) {
          tryVtexIdentify();
          // Also try after a delay (orderForm might need time to update)
          setTimeout(tryVtexIdentify, 1000);
          setTimeout(tryVtexIdentify, 3000);
        }
        // User is ON the email step — start watching for email input
        if (/\/email/i.test(h)) {
          observeCheckoutEmail();
          setTimeout(observeCheckoutEmail, 2000);
          setTimeout(observeCheckoutEmail, 5000);
        }
      });

      // MutationObserver — watches for DOM changes on checkout forms
      // Catches email field population that other methods miss
      try {
        var _emailObserver = new MutationObserver(function(mutations) {
          if (_identifiedEmail) { _emailObserver.disconnect(); return; }
          observeCheckoutEmail();
        });
        // Observe the main checkout container
        var checkoutContainer = document.querySelector('.orderform-template, #orderform, .checkout-container, body');
        if (checkoutContainer) {
          _emailObserver.observe(checkoutContainer, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['value']
          });
          // Auto-disconnect after 3 minutes to save resources
          setTimeout(function() { _emailObserver.disconnect(); }, 180000);
        }
      } catch(e) {}

      // VTEX cookie detection — after login, VTEX sets VtexIdclientAutCookie
      // Poll for this cookie and use profile API to get email
      var _cookiePollCount = 0;
      var _cookiePollInterval = setInterval(function() {
        _cookiePollCount++;
        if (_cookiePollCount > 30 || _identifiedEmail) {
          clearInterval(_cookiePollInterval);
          return;
        }
        if (getCookie('VtexIdclientAutCookie') && !_identifiedEmail) {
          tryVtexProfileIdentify();
          tryVtexIdentify();
        }
      }, 4000);

      // Input event listener — catch email typing in real-time
      try {
        document.addEventListener('change', function(e) {
          if (_identifiedEmail) return;
          var target = e.target;
          if (target && target.tagName === 'INPUT' &&
              (target.type === 'email' || target.name === 'email' || target.id === 'client-email' ||
               target.className.indexOf('email') > -1)) {
            var val = target.value;
            if (val && val.indexOf('@') > -1 && val !== _identifiedEmail) {
              _identifiedEmail = val;
              identify({ email: val });
            }
          }
        }, true);

        // Also listen for blur on email-like inputs (captures autocomplete)
        document.addEventListener('blur', function(e) {
          if (_identifiedEmail) return;
          var target = e.target;
          if (target && target.tagName === 'INPUT' &&
              (target.type === 'email' || target.name === 'email' || target.id === 'client-email')) {
            var val = target.value;
            if (val && val.indexOf('@') > -1 && val !== _identifiedEmail) {
              _identifiedEmail = val;
              identify({ email: val });
            }
          }
        }, true);
      } catch(e) {}
    }

    // ══════════════════════════════════════════════════════════════
    // LAYER 2.3: VTEX Checkout Step Tracking
    // ══════════════════════════════════════════════════════════════
    // Detects VTEX Smart Checkout steps via hash changes:
    //   #/cart → #/profile → #/shipping → #/payment → orderPlaced
    // Fires CHECKOUT_SHIPPING and CHECKOUT_PAYMENT events.
    // ══════════════════════════════════════════════════════════════

    var _firedCheckoutSteps = {};

    function detectCheckoutStep(hash) {
      try {
        if (!hash) hash = window.location.hash;
        // VTEX shipping step: user selects delivery method
        if (/\\/shipping/i.test(hash) && !_firedCheckoutSteps['shipping']) {
          _firedCheckoutSteps['shipping'] = true;
          trackEvent('CHECKOUT_SHIPPING', { step: 'shipping', detection: 'hash' });
        }
        // VTEX payment step: user selects payment method
        if (/\\/payment/i.test(hash) && !_firedCheckoutSteps['payment']) {
          _firedCheckoutSteps['payment'] = true;
          trackEvent('CHECKOUT_PAYMENT', { step: 'payment', detection: 'hash' });
        }
      } catch(e) {}
    }

    // Track checkout steps — detect via pathname OR hash (VTEX Smart Checkout uses both)
    var _isCheckoutPage = /checkout/i.test(window.location.pathname) || /checkout/i.test(window.location.href);
    if (_isCheckoutPage) {
      // Check current hash on load (user may have landed directly on #/shipping)
      detectCheckoutStep();
      // Listen for hash changes (VTEX SPA navigation within checkout)
      window.addEventListener('hashchange', function() {
        detectCheckoutStep();
      });
      // Also poll for VTEX step detection via DOM (fallback)
      // VTEX sometimes updates steps without hash change
      var _checkoutPollCount = 0;
      var _checkoutPollInterval = setInterval(function() {
        _checkoutPollCount++;
        if (_checkoutPollCount > 90) { clearInterval(_checkoutPollInterval); return; }
        // Check for shipping step via DOM — extended selectors for different VTEX themes
        if (!_firedCheckoutSteps['shipping']) {
          var shippingEl = document.querySelector(
            '.shipping-data .vtex-omnishipping-1-x-deliveryGroup, ' +
            '.shipping-data .shp-option-text, ' +
            '#shipping-option-delivery, ' +
            '.vtex-omnishipping-1-x-container, ' +
            '[data-i18n="shipping.chooseDeliveryOption"], ' +
            '.shipping-container .box-step, ' +
            '.step.shipping.active'
          );
          if (shippingEl) {
            _firedCheckoutSteps['shipping'] = true;
            trackEvent('CHECKOUT_SHIPPING', { step: 'shipping', detection: 'dom' });
          }
        }
        // Check for payment step via DOM — extended selectors
        if (!_firedCheckoutSteps['payment']) {
          var paymentEl = document.querySelector(
            '.payment-group .payment-group-item, ' +
            '#payment-group-creditCardPaymentGroup, ' +
            '.PaymentCardNumber, ' +
            '.payment-group-list-btn, ' +
            '.payment-body .payment-group, ' +
            '.step.payment.active, ' +
            '[data-i18n="paymentData.title"]'
          );
          if (paymentEl) {
            _firedCheckoutSteps['payment'] = true;
            trackEvent('CHECKOUT_PAYMENT', { step: 'payment', detection: 'dom' });
          }
        }
        // All steps detected, stop polling
        if (_firedCheckoutSteps['shipping'] && _firedCheckoutSteps['payment']) {
          clearInterval(_checkoutPollInterval);
        }
      }, 2000);
    }

    // ══════════════════════════════════════════════════════════════
    // LAYER 2.5: Early Identification — login & account pages
    // ══════════════════════════════════════════════════════════════
    // Identifies visitors BEFORE checkout to improve cross-device
    // and cross-session attribution. Captures email from:
    // 1. VTEX authentication cookie (VtexIdclientAutCookie)
    // 2. VTEX profile API (already logged-in users)
    // 3. Account/login page DOM (email fields)
    // 4. Generic login form detection on any page
    // ══════════════════════════════════════════════════════════════

    // Method A: VTEX profile API (works if user is logged in, any page)
    function tryVtexProfileIdentify() {
      try {
        // Only try if VTEX auth cookie exists (avoid unnecessary API calls)
        if (!getCookie('VtexIdclientAutCookie')) return;
        if (_identifiedEmail) return; // Already identified

        fetch('/api/vtexid/pub/authenticated/user', {
          headers: { 'Accept': 'application/json' },
          credentials: 'same-origin'
        }).then(function(r) {
          if (!r.ok) return;
          return r.json();
        }).then(function(user) {
          if (user && user.user && user.user.indexOf('@') > -1) {
            if (user.user !== _identifiedEmail) {
              _identifiedEmail = user.user;
              identify({ email: user.user });
            }
          }
        }).catch(function() {});
      } catch(e) {}
    }

    // Method B: Observe login/register form submissions on any page
    function observeLoginForms() {
      try {
        // Watch for form submissions that contain email fields
        document.addEventListener('submit', function(e) {
          try {
            var form = e.target;
            if (!form || !form.querySelectorAll) return;
            var emailInputs = form.querySelectorAll('input[type="email"], input[name="email"], input[name="userName"], input[id*="email"], input[id*="Email"]');
            for (var i = 0; i < emailInputs.length; i++) {
              var val = emailInputs[i].value;
              if (val && val.indexOf('@') > -1 && val !== _identifiedEmail) {
                _identifiedEmail = val;
                identify({ email: val });
                return;
              }
            }
          } catch(ex) {}
        }, true); // capture phase to catch before SPA prevents default

        // Also check for VTEX login success via cookie appearance
        // Poll VtexIdclientAutCookie for 30s after page load (covers SPA login)
        var _loginPollCount = 0;
        var _loginPollTimer = setInterval(function() {
          _loginPollCount++;
          if (_loginPollCount > 10 || _identifiedEmail) {
            clearInterval(_loginPollTimer);
            return;
          }
          if (getCookie('VtexIdclientAutCookie') && !_identifiedEmail) {
            tryVtexProfileIdentify();
          }
        }, 3000);
      } catch(e) {}
    }

    // Method C: Account page email extraction (VTEX /account, /profile)
    function tryAccountPageIdentify() {
      try {
        // Look for email in common VTEX account page selectors
        var selectors = [
          '.vtex-profile-form__email input',
          '.vtex-my-account__email',
          '[data-testid="email-display"]',
          '.profile-email',
          '.client-profile-data .email',
          'input[name="email"][readonly]',
          'input[name="email"][disabled]'
        ];
        for (var i = 0; i < selectors.length; i++) {
          var el = document.querySelector(selectors[i]);
          if (!el) continue;
          var val = el.value || el.textContent || el.innerText || '';
          val = val.trim();
          if (val && val.indexOf('@') > -1 && val !== _identifiedEmail) {
            _identifiedEmail = val;
            identify({ email: val });
            return;
          }
        }
      } catch(e) {}
    }

    // Run early identification on ALL pages (not just checkout)
    // Delayed to not compete with initial page load
    setTimeout(tryVtexProfileIdentify, 2000);
    observeLoginForms();

    // ── FASE 3: orderForm polling on ALL pages (not just checkout) ──
    // VTEX remembers customer email in orderForm even on product pages
    // if the user logged in or entered email previously. This recovers
    // identity for ~15% more visitors without requiring checkout.
    if (!_identifiedEmail && !_isCheckoutPage) {
      setTimeout(function() {
        try {
          fetch('/api/checkout/pub/orderForm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: '{}'
          }).then(function(r) { return r.json(); }).then(function(of) {
            if (of && of.clientProfileData && of.clientProfileData.email) {
              var em = of.clientProfileData.email;
              if (em && em.indexOf('@') > -1 && em !== _identifiedEmail) {
                _identifiedEmail = em;
                identify({ email: em });
              }
            }
          }).catch(function() {});
        } catch(e) {}
      }, 3000); // 3s delay to not block page load
    }

    // ── FASE 3: Global email blur/change listener on ALL pages ──
    // Captures email from ANY form: newsletter, contact, popup, quiz, etc.
    // Uses capture phase to fire before SPA frameworks prevent default.
    if (!_isCheckoutPage) {
      try {
        function _globalEmailCapture(e) {
          if (_identifiedEmail) return;
          var el = e.target;
          if (!el || el.tagName !== 'INPUT') return;
          var isEmail = el.type === 'email'
            || (el.name && el.name.toLowerCase().indexOf('email') > -1)
            || (el.id && el.id.toLowerCase().indexOf('email') > -1)
            || (el.placeholder && el.placeholder.toLowerCase().indexOf('email') > -1);
          if (!isEmail) return;
          var val = (el.value || '').trim();
          if (val && val.indexOf('@') > -1 && val.indexOf('.') > -1 && val !== _identifiedEmail) {
            _identifiedEmail = val;
            identify({ email: val });
          }
        }
        document.addEventListener('change', _globalEmailCapture, true);
        document.addEventListener('blur', _globalEmailCapture, true);
      } catch(e) {}
    }

    // Extra detection on account/profile pages
    if (/account|profile|login|registro|mi-cuenta/i.test(window.location.href)) {
      setTimeout(tryAccountPageIdentify, 1000);
      setTimeout(tryAccountPageIdentify, 3000);
      setTimeout(tryAccountPageIdentify, 6000);
    }

    // ══════════════════════════════════════════════════════════════
    // LAYER 3: VTEX OMS orderPlaced page direct scraping
    // ══════════════════════════════════════════════════════════════
    // On the VTEX orderPlaced confirmation page, order data is
    // also available via the OMS API. This is the LAST RESORT
    // backup if dataLayer didn't fire.
    // ══════════════════════════════════════════════════════════════

    function tryOrderPlacedPageScrape() {
      try {
        var url = window.location.href;
        // VTEX orderPlaced URL pattern: /checkout/orderPlaced/?og=ORDER_GROUP_ID
        var match = url.match(/[?&]og=([^&]+)/);
        if (!match) return;
        var orderGroupId = match[1];

        // Already captured via dataLayer?
        if (_sentPurchases[orderGroupId]) return;

        // Try to get order data from VTEX API
        fetch('/api/checkout/pub/orders/order-group/' + orderGroupId, {
          headers: { 'Accept': 'application/json' }
        }).then(function(r) { return r.json(); }).then(function(orders) {
          if (!Array.isArray(orders) || orders.length === 0) return;
          orders.forEach(function(order) {
            if (_sentPurchases[order.orderId]) return;
            _sentPurchases[order.orderId] = true;

            var email = null;
            if (order.clientProfileData && order.clientProfileData.email) {
              email = order.clientProfileData.email;
            }

            if (email) identify({ email: email });

            var products = [];
            if (order.items) {
              order.items.forEach(function(item) {
                products.push({
                  id: String(item.id || item.productId || ''),
                  name: item.name || '',
                  price: (item.sellingPrice || item.price || 0) / 100,
                  quantity: item.quantity || 1
                });
              });
            }

            trackEvent('PURCHASE', {
              orderId: order.orderId,
              total: (order.value || 0) / 100,
              shipping: 0,
              tax: 0,
              currency: 'ARS',
              email: email || '',
              products: products,
              source: 'orderPlacedAPI'
            });

            setTimeout(flush, 100);
          });
        }).catch(function() {});
      } catch(e) {}
    }

    // Fire on orderPlaced page after a delay (let dataLayer fire first)
    if (/orderPlaced/i.test(window.location.href)) {
      setTimeout(tryOrderPlacedPageScrape, 3000);

      // DEBUG: If no purchase captured after 10s, send debug info
      setTimeout(function() {
        try {
          if (Object.keys(_sentPurchases).length === 0) {
            var dlInfo = [];
            if (window.dataLayer) {
              for (var i = 0; i < Math.min(window.dataLayer.length, 30); i++) {
                var e = window.dataLayer[i];
                dlInfo.push({
                  idx: i,
                  event: e.event || null,
                  hasTxId: !!e.transactionId,
                  hasEcom: !!e.ecommerce,
                  hasOG: !!e.orderGroup,
                  keys: Object.keys(e).slice(0, 15).join(',')
                });
              }
            }
            trackEvent('DEBUG_NO_PURCHASE', {
              message: 'orderPlaced page loaded but no purchase detected',
              url: window.location.href,
              dataLayerLength: window.dataLayer ? window.dataLayer.length : 0,
              entries: dlInfo
            });
            setTimeout(flush, 100);
          }
        } catch(ex) {}
      }, 10000);
    }

    // ─── Flush antes de cerrar pagina ───
    window.addEventListener('beforeunload', function() {
      try { flush(); } catch(e) {}
    });

    // ─── Process queued calls ───
    if (window._npq && Array.isArray(window._npq)) {
      window._npq.forEach(function(args) {
        try { window.NitroPixel.apply(null, args); } catch(e) {}
      });
    }

  } catch(e) {
    // Error total — falla silencioso, no afecta la pagina
  }
})();
`.trim();
}

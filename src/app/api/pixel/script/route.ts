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

    // ─── Session ID (cookie de sesion, expira al cerrar browser) ───
    var sid = getCookie('_np_sid');
    var _isNewSession = !sid; // MUST be computed BEFORE creating the session cookie
    if (!sid) {
      sid = uuid();
      setCookie('_np_sid', sid, 0);
    }

    // ─── Click IDs & UTMs — with fresh vs stale tracking ───
    // CRITICAL: We must distinguish signals from the CURRENT URL (fresh = user just
    // clicked an ad) vs signals recovered from cookies (stale = from a previous session).
    // Without this, returning organic/direct visitors get falsely attributed to old ads.
    var clickIds = {};
    var utmParams = {};
    var _signalsFresh = false; // TRUE = click IDs or UTMs came from current URL
    var _isLanding = _isNewSession; // TRUE = first page of a new session (computed before cookie creation)
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

      // Determine if signals are fresh (from URL) or stale (from cookie)
      var hasUrlClickIds = Object.keys(clickIds).length > 0;
      var hasUrlUtms = Object.keys(utmParams).length > 0;
      _signalsFresh = hasUrlClickIds || hasUrlUtms;

      // Guardar FRESH click IDs en cookie + localStorage (cross-domain fallback)
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

      // Guardar FRESH UTMs en cookie + localStorage
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
      enqueue({
        type: type,
        props: props || {},
        visitor_id: vid,
        session_id: sid,
        click_ids: clickIds,
        utm_params: utmParams,
        signals_fresh: _signalsFresh, // TRUE = click IDs/UTMs from current URL, not cookie
        is_landing: _isLanding && isFirstEvent, // TRUE = first event of a new session
        timestamp: Date.now(),
        page_url: window.location.href,
        referrer: document.referrer || '',
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

    // Scan existing dataLayer entries (orderPlaced may already be there)
    function scanDataLayer() {
      try {
        if (!window.dataLayer || !Array.isArray(window.dataLayer)) return;
        for (var i = 0; i < window.dataLayer.length; i++) {
          var entry = window.dataLayer[i];
          if (isPurchaseEntry(entry)) {
            processOrderPlaced(entry);
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
            }
          }
          return result;
        };
      } catch(e) {}
    }

    scanDataLayer();
    hookDataLayer();

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

    // Run checkout detection on checkout/orderPlaced pages
    if (/checkout|orderPlaced|gatewayCallback/i.test(window.location.href)) {
      tryVtexIdentify();
      setTimeout(tryVtexIdentify, 2000);
      setTimeout(tryVtexIdentify, 5000);
      setTimeout(tryVtexIdentify, 10000);
      observeCheckoutEmail();
      setTimeout(observeCheckoutEmail, 3000);
      setTimeout(observeCheckoutEmail, 8000);
      listenOrderFormUpdated();
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

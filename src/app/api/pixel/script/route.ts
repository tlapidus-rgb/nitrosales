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

  const script = generatePixelScript(orgId);

  return new NextResponse(script, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
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

    function getCookie(name) {
      var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    }

    function setCookie(name, value, days) {
      var d = new Date();
      if (days > 0) {
        d.setTime(d.getTime() + days * 86400000);
        document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
      } else {
        // Session cookie (no expires)
        document.cookie = name + '=' + encodeURIComponent(value) + ';path=/;SameSite=Lax';
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
    if (!sid) {
      sid = uuid();
      setCookie('_np_sid', sid, 0);
    }

    // ─── Click IDs de la URL ───
    var clickIds = {};
    var utmParams = {};
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

      // Guardar click IDs en cookie si hay alguno
      if (Object.keys(clickIds).length > 0) {
        setCookie('_np_click', JSON.stringify(clickIds), COOKIE_DAYS_CLICK);
      } else {
        // Recuperar de cookie previo
        var saved = getCookie('_np_click');
        if (saved) {
          try { clickIds = JSON.parse(saved); } catch(e) {}
        }
      }

      // Guardar UTMs en cookie
      if (Object.keys(utmParams).length > 0) {
        setCookie('_np_utm', JSON.stringify(utmParams), COOKIE_DAYS_CLICK);
      } else {
        var savedUtm = getCookie('_np_utm');
        if (savedUtm) {
          try { utmParams = JSON.parse(savedUtm); } catch(e) {}
        }
      }
    } catch(e) {}

    // ─── Device detection ───
    var deviceType = /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' :
                     /Tablet|iPad/i.test(navigator.userAgent) ? 'tablet' : 'desktop';

    // ─── Event queue + batching ───
    var queue = [];
    var timer = null;

    function flush() {
      if (queue.length === 0) return;
      var batch = queue.splice(0, MAX_BATCH);
      var payload = JSON.stringify({ events: batch });

      // Usar sendBeacon (no bloquea navegacion)
      if (navigator.sendBeacon) {
        var blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(ENDPOINT + '?org=' + ORG_ID, blob);
      } else {
        // Fallback a fetch fire-and-forget
        try {
          fetch(ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-np-org': ORG_ID
            },
            body: payload,
            keepalive: true
          }).catch(function() {});
        } catch(e) {}
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
    function trackEvent(type, props) {
      enqueue({
        type: type,
        props: props || {},
        visitor_id: vid,
        session_id: sid,
        click_ids: clickIds,
        utm_params: utmParams,
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
        if (!dl || !dl.transactionId) return;
        if (_sentPurchases[dl.transactionId]) return;
        _sentPurchases[dl.transactionId] = true;

        // Extract email from visitorContactInfo array or string
        var email = null;
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
        // Fallback: visitorContactPhone might contain email in some VTEX configs
        if (!email && dl.visitorEmail) email = dl.visitorEmail;

        // IDENTIFY first (so server links visitor to email before PURCHASE)
        if (email) {
          identify({ email: email });
        }

        // Build products array
        var products = [];
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

        // Fire PURCHASE event with full order data
        trackEvent('PURCHASE', {
          orderId: dl.transactionId,
          total: dl.transactionTotal || 0,
          shipping: dl.transactionShipping || 0,
          tax: dl.transactionTax || 0,
          currency: dl.transactionCurrency || 'ARS',
          email: email || '',
          products: products,
          source: 'dataLayer'
        });

        // Force flush immediately (user may close tab)
        setTimeout(flush, 100);
      } catch(e) {}
    }

    // Scan existing dataLayer entries (orderPlaced may already be there)
    function scanDataLayer() {
      try {
        if (!window.dataLayer || !Array.isArray(window.dataLayer)) return;
        for (var i = 0; i < window.dataLayer.length; i++) {
          var entry = window.dataLayer[i];
          if (entry && (entry.event === 'orderPlaced' || entry.transactionId)) {
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
            if (arg && (arg.event === 'orderPlaced' || arg.transactionId)) {
              processOrderPlaced(arg);
            }
          }
          return result;
        };
      } catch(e) {}
    }

    scanDataLayer();
    hookDataLayer();

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
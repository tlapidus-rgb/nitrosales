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

    // ─── PageView automatico ───
    trackEvent('PAGE_VIEW', { title: document.title });

    // ─── VTEX Checkout: auto-detect email ───
    // En VTEX Smart Checkout, el email del comprador esta en el orderForm.
    // Lo intentamos capturar para vincular visitante anonimo con email.
    function tryVtexIdentify() {
      try {
        // Method 1: vtexjs global (disponible en checkout VTEX)
        if (window.vtexjs && window.vtexjs.checkout && window.vtexjs.checkout.orderForm) {
          var em = window.vtexjs.checkout.orderForm.clientProfileData;
          if (em && em.email) { identify({ email: em.email }); return; }
        }
        // Method 2: VTEX orderForm API (funciona en cualquier pagina del dominio)
        fetch('/api/checkout/pub/orderForm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: '{}'
        }).then(function(r) { return r.json(); }).then(function(of) {
          if (of && of.clientProfileData && of.clientProfileData.email) {
            identify({ email: of.clientProfileData.email });
          }
        }).catch(function() {});
      } catch(e) {}
    }

    // Solo intentar en paginas de checkout o order confirmation
    if (/checkout|orderPlaced|gatewayCallback/i.test(window.location.href)) {
      // Intentar inmediatamente
      tryVtexIdentify();
      // Reintentar despues de 3s (el email puede cargarse despues)
      setTimeout(tryVtexIdentify, 3000);
      // Escuchar cambios en orderForm (VTEX emite evento custom)
      try {
        $(window).on('orderFormUpdated.vtex', function(_, of) {
          if (of && of.clientProfileData && of.clientProfileData.email) {
            identify({ email: of.clientProfileData.email });
          }
        });
      } catch(e) {}
    }

    // ─── Flush antes de cerrar pagina ───
    window.addEventListener('beforeunload', function() {
      try { flush(); } catch(e) {}
    });

    // ─── Process queued calls (si alguien llamo NitroPixel antes de que cargue el script) ───
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

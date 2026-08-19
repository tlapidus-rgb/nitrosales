# Metodología de clasificación de canales (NitroPixel)

> Criterio único para convertir un **origen crudo** `(source, medium, campaign[, señal de pago])`
> en un **canal** legible. Escrito 2026-08-19 a pedido de Tomy: la clasificación tiene que salir
> de UN modelo consistente, no de una pila de reglas por plataforma. Grounding: así lo define
> **GA4** (default channel group), que es el estándar que Triple Whale sigue por debajo.

## El principio: 2 ejes ortogonales, una sola función

Un origen se describe por **dos cosas independientes**. El canal es la **composición** de ambas.

### Eje A — PLATAFORMA / SUPERFICIE (*de dónde* vino)
Una tabla `source → familia` (NO `source → canal`):

| source (crudo) | familia | categoría | superficie |
|---|---|---|---|
| `meta` | META | social | — (solo pauta) |
| `facebook`, `fb` | META | social | Facebook |
| `instagram`, `ig` | META | social | Instagram |
| `tiktok` | TIKTOK | social | TikTok |
| `google`, `adwords`, `gads`, `pmax` | GOOGLE | search | — |
| `bing`, `msn`, `microsoft` | MICROSOFT | search | — |
| `youtube` | GOOGLE | video | YouTube |

### Eje B — PAGO u ORGÁNICO (*cómo* llegó) — por SEÑAL, en jerarquía de confianza

1. **Click-id** (`fbclid`/`gclid`/`ttclid`/`msclkid`) presente → **PAGO** (prueba, no heurística). *[Fase B: vive en el ingest]*
2. **Medium de pauta** — regex GA4 `^(.*cp.*|ppc|retargeting|paid.*|paid_social)$` → **PAGO**.
3. **Source = marca de pauta** (`meta`, `adwords`, `gads`, `pmax`, `*_ads`) → **PAGO**.
4. **Nada de lo anterior** → **ORGÁNICO** (default).

**Regla de oro:** el **pago hay que PROBARLO**; el **orgánico es el estado por defecto**.
Un medium ambiguo (`video`, `trafico`, `social`) es **NEUTRO** — NO afirma pago por sí solo.

## La composición → canal

```
si EJE_B == PAGO:
    canal = nombreDePlataformaAds(familia)     // META → "Meta Ads"
                                                // GOOGLE+search → "Google Ads"
                                                // TIKTOK → "TikTok Ads"
si EJE_B == ORGÁNICO:
    // NO existe plataforma de pauta → se nombra la SUPERFICIE
    canal = superficie + " Orgánico"           // "Facebook Orgánico" / "Instagram Orgánico"
    // si no hay superficie identificable (source="meta" crudo, orgánico):
    //   → "Social Orgánico" (NUNCA "Meta Orgánico")
```

**Asimetría (y por qué NO es arbitraria):**
- **PAGO se consolida** → `Meta Ads` (FB + IG + meta juntos): es UN presupuesto / una subasta
  cross-superficie (Advantage+). La unidad de decisión es la plataforma de pauta, no la superficie.
- **ORGÁNICO se separa por superficie** → `Facebook Orgánico` vs `Instagram Orgánico`: son
  audiencias y esfuerzos distintos, y no hay plataforma de pauta que los una.

### Invariante duro: **"Meta Orgánico" NO existe.**
"Meta" es el nombre de la plataforma de PAUTA; solo se gana cuando hay pago. Si es orgánico, el
origen honesto es la **superficie** (Facebook/Instagram) o, si no se puede saber, `Social Orgánico`.

## Fuera del modelo de 2 ejes: "nombre = canal"

Vendors de email/SMS (Klaviyo, Mailchimp, Attentive…), pasarelas (GoCuotas, Mercado Pago, MODO),
y códigos propios del cliente NO son plataformas de pauta con eje pago/orgánico: se mapean
`source → canal` directo (principio de Tomy: "si es Icomm, que diga Icomm"). Lo no reconocido
queda en **passthrough** ("sin clasificar") — nunca se fuerza a un canal (como GA4 con "Unassigned").

## Matriz de casos (la verdad de referencia — son tests)

| source | medium | señal | canal esperado |
|---|---|---|---|
| `meta` | — | source marca-de-pauta | **Meta Ads** |
| `meta` | `cpc` | medium pago | **Meta Ads** |
| `meta` | `trafico` | source marca-de-pauta (trafico neutro) | **Meta Ads** |
| `facebook` | `cpc` | medium pago | **Meta Ads** |
| `facebook` | `trafico` | ninguna (neutro) → orgánico | **Facebook Orgánico** |
| `facebook` | — | ninguna → orgánico | **Facebook Orgánico** |
| `instagram` | `video` | ninguna (neutro) → orgánico | **Instagram Orgánico** |
| `facebook` | — | `fbclid` presente *(Fase B)* | **Meta Ads** |
| `google` | `cpc` | medium pago | **Google Ads** |
| `google` | `organic` / — | orgánico | **Google Orgánico** |
| `tiktok` | `video` | neutro → orgánico | **TikTok Orgánico** |
| `tiktok` | `cpc` | medium pago | **TikTok Ads** |

## El label del medium en el panel

El tag "Ads / Orgánico / Directo" al lado del origen DEBE reflejar el **eje resuelto** (la misma
lógica de arriba: pago si medium-pago **o** source marca-de-pauta), NO el medium a solas. Si no,
se ve la contradicción "tag Orgánico" al lado del canal "Meta Ads" (bug que reportó Tomy).

## Roadmap

- **Fase A** (esta): reglas consistentes con este modelo (tests-invariante) + label por eje resuelto
  + garantía "nunca Meta Orgánico". Sin tocar el ingest.
- **Fase B**: `paid_signal` (presencia de click-id) calculado y persistido en la dim del ingest,
  pasado como 4ta señal a las reglas → cierra el caso `facebook + fbclid` sin medium.

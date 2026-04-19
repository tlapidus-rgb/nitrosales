# Mapa: skills.sh × NitroSales

**Fecha:** 2026-04-18
**Status:** Research inicial — fase "cruce y decidir"

Este documento mapea las skills que existen en [skills.sh](https://skills.sh) (Vercel Labs + comunidad) contra el mapa de 42 skills propio que armamos para la operación comercial de NitroSales.

---

## Packs relevantes encontrados en skills.sh

| Pack | Autor / nivel de señal | # skills | Relevancia |
|---|---|---|---|
| `coreyhaines31/marketingskills` | Corey Haines — marketer B2B SaaS prominente (Swipe Files, Refactoring Growth). 1.4M installs. | 35 | ⭐⭐⭐ núcleo de marketing |
| `refoundai/lenny-skills` | Lenny Rachitsky — referente global SaaS/producto. Cubre producto + GTM + liderazgo. 88K installs. | 86 | ⭐⭐⭐ estrategia y founder-sales |
| `manojbajaj95/claude-gtm-plugin` | GTM broad pack. | 62 | ⭐⭐ utm-builder, launch, LinkedIn, PH |
| `sales-skills/sales` | Enorme colección de connectors + frameworks founder. | 252 | ⭐⭐ tool connectors + joyas sueltas |
| `onewave-ai/claude-skills` | Pack chico. | ~5 | ⭐ sales-methodology-implementer |
| `anthropics/skills` | Oficial: skill-creator, frontend-design, pdf, pptx. | — | ⭐⭐⭐ infra |

**Observación importante:** sales-skills/sales tiene 200+ skills, pero ~180 son solo connectors de tools (sales-apollo, sales-salesloft, sales-mailshake, etc.). Las valiosas son ~15 founder-level: `positioning-basics`, `marketing-principles`, `voice-extractor`, `de-ai-ify`, `homepage-audit`, `linkedin-authority-builder`, `meeting-prep-cc`, `case-study-builder`, `newsletter-creation-curation`, `cold-outreach-sequence`, `plan-my-day`, `daily-briefing-builder`, `last30days`, `testimonial-collector`, `go-mode`.

---

## Cruce: mapa NitroSales × skills.sh

Columnas: **Skill NitroSales** · **Match externo** · **Decisión**

Decisiones posibles:
- **Adoptar** → instalar tal cual + inyectar contexto NitroSales via `positioning-canon`
- **Mergear** → tomar estructura externa + reescribir contenido para NitroSales
- **Construir** → no hay equivalente externo, hacer desde cero
- **Descartar** → no necesaria en Fase 1

### Capa 0 — Fundación

| NitroSales | Match externo | Decisión |
|---|---|---|
| positioning-canon | `positioning-messaging` (Lenny) + `positioning-basics` (sales-skills) | **Mergear** — estos dos son el andamio, el canon de NitroSales es el contenido |
| brand-voice | `brand-storytelling` (Lenny) + `voice-extractor` (sales-skills) + `marketing-psychology` (Corey) | **Mergear** |
| naming-lab | ninguno | **Construir** |

### Capa 1 — Intelligence / Research

| NitroSales | Match externo | Decisión |
|---|---|---|
| icp-profiler | `customer-research` (Corey) + `conducting-user-interviews` (Lenny) + `market-research-analysis` (Manoj) | **Mergear** |
| account-research | `competitor-analysis` (Lenny) + `competitor-alternatives` (Corey) | **Mergear** |
| competitive-intel | `competitive-analysis` (Lenny) | **Adoptar + extender** |
| category-monitor | ninguno | **Construir** |

### Capa 2 — Messaging / Copy

| NitroSales | Match externo | Decisión |
|---|---|---|
| landing-copy | `page-cro` (Corey) + `landing-page-optimization` (Manoj) + `homepage-audit` (sales-skills) + `copywriting` (Corey) | **Mergear** |
| email-copy | `email-sequence` (Corey) + `cold-email` (Corey) + `cold-outreach-sequence` (sales-skills) + `outbound-email-strategy` (Manoj) | **Mergear** |
| ad-copy | `paid-ads` (Corey) + `ad-creative` (Corey) | **Mergear** |
| whatsapp-copy | ninguno | **Construir** (LATAM-specific) |
| sales-collateral | `sales-enablement` (Corey) + `sales-proposal-template` + `case-study-builder` | **Mergear** |

### Capa 3 — Content / SEO

| NitroSales | Match externo | Decisión |
|---|---|---|
| content-calendar | `content-strategy` (Corey) + `content-strategy-and-planning` (Manoj) | **Adoptar + extender** |
| blog-writer | `blog-writing-specialist` (Manoj) + `copywriting` (Corey) | **Mergear** |
| seo-researcher | `seo-audit` (Corey) + `programmatic-seo` (Corey) + `ai-seo` (Corey) + `keyword-research-and-clustering` (Manoj) | **Adoptar** (4 skills especializadas) |
| social-content | `social-content` (Corey) + `linkedin-content` + `linkedin-personal-branding` + `twitter-algorithm-optimizer` | **Adoptar + extender** |
| video-script | `youtube-plan-new-video` + `youtube-video-hook` (Manoj) | **Adoptar** |
| newsletter-writer | `newsletter-creation-curation` (sales-skills) | **Mergear** |

### Capa 4 — Outbound / Prospecting

| NitroSales | Match externo | Decisión |
|---|---|---|
| prospect-list-builder | `sales-prospect-list` + `lead-generation-and-demand` (Manoj) | **Mergear** |
| personalized-outreach | `cold-email` + `cold-outreach-sequence` + `personalization-at-scale` (Manoj) | **Mergear** |
| multi-touch-sequence | `sales-cadence` (sales-skills) | **Adoptar + extender** |
| referral-orchestrator | `referral-program` (Corey/Manoj) | **Adoptar** |

### Capa 5 — Sales Execution

| NitroSales | Match externo | Decisión |
|---|---|---|
| discovery-prep | `meeting-prep-cc` + `sales-call-review` (sales-skills) | **Adoptar + extender** |
| demo-script | ninguno directo | **Construir** |
| objection-handler | ninguno directo | **Construir** |
| proposal-generator | `sales-proposal-page` + `sales-proposal-template` + `sales-proposal-analytics` | **Mergear** |
| follow-up-orchestrator | ninguno | **Construir** |
| deal-desk | `sales-deal-inspect` + `sales-deal-room` | **Adoptar** |
| **+ founder-sales** ⭐ (Lenny) | NUEVA — no estaba en mi mapa | **Adoptar** (crítico para vos como founder solo) |
| **+ sales-qualification** (Lenny) | NUEVA — framework BANT/MEDDIC | **Adoptar** |
| **+ enterprise-sales** (Lenny) | NUEVA — para cuentas grandes | **Adoptar (Fase 2+)** |
| **+ product-led-sales** (Lenny) | NUEVA — si vas PLG | **Adoptar (Fase 2+)** |
| **+ sales-methodology-implementer** (onewave) | NUEVA | **Evaluar** |

### Capa 6 — Inbound / Conversion

| NitroSales | Match externo | Decisión |
|---|---|---|
| lead-qualifier | `sales-lead-score` + `sales-qualification` (Lenny) | **Mergear** |
| inbound-triage | `sales-lead-routing` | **Adoptar** |
| chat-agent | `sales-live-chat` + `sales-chatbot` | **Adoptar** |

### Capa 7 — Onboarding / Activation

| NitroSales | Match externo | Decisión |
|---|---|---|
| implementation-playbook | `user-onboarding` (Corey/Lenny/Manoj) + `onboarding-cro` (Corey) | **Mergear** |
| pixel-install-guide | ninguno | **Construir** |
| aha-moment-tracker | ninguno | **Construir** |
| data-quality-auditor | ninguno | **Construir** |

### Capa 8 — CS / Retention

| NitroSales | Match externo | Decisión |
|---|---|---|
| qbr-generator | ninguno directo; parcial `executive-dashboard-generator` | **Construir** |
| health-score | ninguno | **Construir** |
| churn-risk-detector | `churn-prevention` (Corey) + `retention-engagement` (Lenny) | **Mergear** |
| expansion-opportunity | ninguno | **Construir** (Aurum/Bondly/Aura-specific) |
| case-study-builder | `case-study-builder` (sales-skills) + `testimonial-collector` | **Mergear** |

### Capa 9 — Pricing / Packaging

| NitroSales | Match externo | Decisión |
|---|---|---|
| pricing-modeler | `pricing-strategy` (Corey/Lenny/Manoj — todos lo tienen) | **Adoptar + extender** |
| commercial-policy | ninguno | **Construir** |

### Capa 10 — Events / Community

| NitroSales | Match externo | Decisión |
|---|---|---|
| event-prep | `giving-presentations` (Lenny) | **Adoptar** |
| webinar-runner | `sales-webinar` + `product-hunt-launch` (Manoj) | **Adoptar** |
| community-manager | `community-building` (Lenny/Manoj) | **Adoptar** |

### Capa 11 — Gobernanza / Ops

| NitroSales | Match externo | Decisión |
|---|---|---|
| sales-dashboard | `data-and-funnel-analytics` (Manoj) + `analytics-tracking` (Corey) + `executive-dashboard-generator` (Manoj) | **Mergear** |
| pipeline-reviewer | `sales-forecast` + `sales-forecast-builder` + `sales-and-revenue-operations` + `revops` (Corey) | **Mergear** |
| marketing-dashboard | `data-and-funnel-analytics` | **Adoptar** |
| handoff-claude-to-claude | ninguno (Cowork-specific) | **Construir** |
| memory-keeper | `consolidate-memory` (ya instalado en tu Cowork) | **Adoptar** |

---

## Skills nuevas a sumar al mapa (no estaban en mis 42)

Tesoros que el cruce con skills.sh reveló y que deberían entrar al stack:

1. **founder-sales** (Lenny) — oro puro para un founder solo vendiendo el producto. Fase 1.
2. **marketing-psychology** (Corey) — sesgos cognitivos aplicados a copy. Fase 1.
3. **marketing-principles** (sales-skills) — heurísticas fundacionales. Fase 1.
4. **positioning-basics** (sales-skills) — refuerzo de canon. Fase 1.
5. **voice-extractor** (sales-skills) — capturar voz del cliente desde entrevistas → alimenta copy. Fase 2.
6. **de-ai-ify** (sales-skills) — anti-texto-robótico. Crítico para no sonar a commodity AI. Fase 1.
7. **utm-builder** (Manoj) — CRÍTICO dado que NitroSales es 100% atribución. Fase 1.
8. **ab-test-setup** (Corey/Manoj) — necesario para probar copy y landings. Fase 2.
9. **page-cro / form-cro / popup-cro / signup-flow-cro / paywall-upgrade-cro** (Corey) — set completo de CRO. Fase 2.
10. **free-tool-strategy** (Corey/Manoj) — poderoso GTM para NitroSales: "calculadora de Break-even ROAS gratis". Fase 2. ⭐
11. **lead-magnets** (Corey) — contenido descargable para captar. Fase 2.
12. **product-hunt-launch** + **ph-community-outreach** (Manoj) — para el lanzamiento. Fase 2.
13. **linkedin-authority-builder** (sales-skills) — construir autoridad personal de Tomy. Fase 1. ⭐
14. **linkedin-personal-branding** (Manoj) — mismo ángulo. Fase 1.
15. **twitter-algorithm-optimizer** (Manoj) — distribución. Fase 2.
16. **plan-my-day** / **daily-briefing-builder** / **last30days** (sales-skills) — cadencia operativa de founder solo. Fase 1.
17. **designing-growth-loops** (Lenny) — estratégico. Fase 2.
18. **measuring-product-market-fit** (Lenny) — clave pre-PMF. Fase 1.
19. **fundraising** (Lenny) — cuando/si aplique. Fase 3.
20. **partnership-bd** (Lenny) — para VTEX, agencias, ISVs. Fase 2.
21. **challenge-funnel** (Manoj) — framework de lead gen agresivo. Fase 2.

---

## Skills que puedo descartar del mapa original

- `category-monitor` → redundante con `competitive-analysis` (Lenny)
- `commercial-policy` → puede vivir dentro de `proposal-generator` + `deal-desk`
- `follow-up-orchestrator` → puede absorberse en `multi-touch-sequence` + `sales-cadence`

---

## Próximos pasos

1. Decidir qué packs instalar primero (propuesta: Corey + Lenny + Anthropic oficial).
2. Construir `positioning-canon` + `brand-voice` desde cero — son el cimiento y transforman todo lo externo en "NitroSales".
3. Para cada skill externa que adoptemos, el `positioning-canon` inyecta el contexto (archetype, pilares, voz, antiejemplos) en runtime.
4. Las skills propias (pixel-install-guide, handoff-claude-to-claude, aha-moment-tracker, etc.) se construyen con `skill-creator` usando el canon como input.

---

## Fórmula final (refinada)

```
skill externa curada (70% del stack)
  × positioning-canon (inyecta contexto NitroSales)
  × brand-voice (inyecta tono)
  = skill potente, personalizada, no-commodity

know-how NitroSales puro (30% del stack)
  + positioning-canon
  + brand-voice
  = skill propietaria (pixel-install-guide, handoff, etc.)
```

Tu fórmula original era correcta. Lo único que cambia: no es 100% externo + know-how; es 70/30, y el "pegamento" crítico es el canon + voice.

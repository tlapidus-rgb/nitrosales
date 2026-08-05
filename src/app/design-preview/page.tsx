// Preview del "después": la pantalla de Atribución en el design system enterprise.
// Contenido realista (data de TeVe), sin data real / sin fetch — es una demo para
// que Tomy vea la dirección en vivo. NO toca las páginas de prod.
import { Sidebar, type NavGroup } from "@/components/enterprise/Sidebar";
import { Button, Card, CardHeader, CardBody, Badge, Stat, LivePulse } from "@/components/enterprise/ui";

const NAV: NavGroup[] = [
  {
    label: "NitroPixel",
    items: [
      { label: "Analytics", href: "/pixel/analytics", icon: "chart" },
      { label: "Atribución", href: "/pixel", icon: "target" },
      { label: "Canales", href: "/pixel/canales", icon: "link" },
      { label: "Journeys", href: "/pixel/journeys", icon: "route" },
      { label: "Configuración", href: "/pixel/configuracion", icon: "gear" },
    ],
  },
  {
    label: "Comercial",
    items: [
      { label: "Centro de control", href: "/dashboard", icon: "gauge" },
      { label: "Pedidos", href: "/orders", icon: "bag" },
      { label: "Productos", href: "/products", icon: "box" },
    ],
  },
  {
    label: "Fidelización",
    items: [
      { label: "Bondly", href: "/bondly", icon: "users" },
      { label: "Alertas", href: "/alertas", icon: "bell" },
    ],
  },
];

const CHANNELS = [
  { name: "Google Ads", value: "$121,5M", pct: 30.9 },
  { name: "Meta Ads", value: "$80,1M", pct: 20.4 },
  { name: "Google Orgánico", value: "$80,1M", pct: 20.4 },
  { name: "TV", value: "$32,7M", pct: 8.3 },
  { name: "Email Marketing", value: "$26,5M", pct: 6.7 },
  { name: "Directo", value: "$26,4M", pct: 6.7 },
  { name: "WhatsApp", value: "$4,3M", pct: 1.1 },
];

const MODELS = [
  { m: "Nitro", v: "$375,4M", note: "activo" },
  { m: "Last Click", v: "$376,1M" },
  { m: "First Click", v: "$374,9M" },
  { m: "Linear", v: "$375,4M" },
];

const maxPct = Math.max(...CHANNELS.map((c) => c.pct));

export default function DesignPreviewPage() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar groups={NAV} active="/pixel" />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 shrink-0 flex items-center justify-between gap-4 px-7 border-b border-hairline bg-canvas/80 backdrop-blur-sm">
          <div className="flex items-baseline gap-3">
            <h1 className="text-[15px] font-semibold text-ink tracking-[-.02em]">Atribución</h1>
            <span className="font-geistmono text-[11px] text-ink-40">modelo y canales</span>
          </div>
          <div className="flex items-center gap-3">
            <LivePulse status="LIVE" />
            <div className="flex items-center rounded-lg border border-hairline bg-white overflow-hidden text-[12px] font-medium">
              {["7d", "30d", "90d"].map((d) => (
                <span key={d} className={d === "90d" ? "px-2.5 py-1 bg-surface-2 text-ink" : "px-2.5 py-1 text-ink-40"}>{d}</span>
              ))}
            </div>
            <Button variant="ghost" className="text-[13px] px-3 py-1.5">Actualizar</Button>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 overflow-y-auto px-7 py-7">
          <div className="max-w-[1100px] mx-auto">
            {/* KPIs */}
            <div className="flex flex-wrap gap-x-10 gap-y-6 mb-8">
              <Stat label="Revenue atribuido" value="$406,5M" delta="+52,3%" deltaUp />
              <Stat label="ROAS blended" value="4,2x" />
              <Stat label="Órdenes" value="2.487" delta="+60,5%" deltaUp />
              <Stat label="Cobertura" value="100%" delta="sobre lo asignado" />
              <Stat label="Inversión" value="$96,7M" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5">
              {/* Revenue por canal — barras near-black (monocromo, sin glow) */}
              <Card>
                <CardHeader title="Revenue por canal" aside="modelo Nitro · 90 días" />
                <CardBody className="flex flex-col gap-3.5">
                  {CHANNELS.map((c) => (
                    <div key={c.name} className="flex items-center gap-3">
                      <div className="w-32 shrink-0 text-[13px] text-ink-60 truncate">{c.name}</div>
                      <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                        <div className="h-full rounded-full bg-ink" style={{ width: `${(c.pct / maxPct) * 100}%` }} />
                      </div>
                      <div className="w-20 text-right text-[13px] font-medium text-ink tabular-nums">{c.value}</div>
                      <div className="w-11 text-right font-geistmono text-[11px] text-ink-40 tabular-nums">{c.pct}%</div>
                    </div>
                  ))}
                </CardBody>
              </Card>

              {/* Comparación de modelos */}
              <Card>
                <CardHeader title="Comparación de modelos" aside="revenue total" />
                <CardBody className="flex flex-col">
                  {MODELS.map((m, i) => (
                    <div key={m.m} className={`flex items-center justify-between py-2.5 ${i < MODELS.length - 1 ? "border-b border-hairline" : ""}`}>
                      <span className="flex items-center gap-2 text-[13px] text-ink">
                        {m.m}
                        {m.note && <Badge tone="accent">activo</Badge>}
                      </span>
                      <span className="text-[13px] font-medium text-ink tabular-nums">{m.v}</span>
                    </div>
                  ))}
                  <p className="text-[11px] text-ink-40 leading-relaxed mt-3">El total de revenue queda igual (mismas órdenes). Lo que cambia es cómo se reparte el crédito entre canales.</p>
                </CardBody>
              </Card>
            </div>

            {/* Órdenes en vivo */}
            <Card className="mt-5">
              <CardHeader title="Órdenes en vivo" aside={<span className="inline-flex items-center gap-2"><LivePulse status="LIVE" label="conectado" /></span>} />
              <CardBody className="p-0">
                <div className="divide-y divide-hairline">
                  {[
                    { id: "#48213", ch: "Meta Ads", tp: 3, v: "$142.900", t: "hace 2 min" },
                    { id: "#48212", ch: "Google Ads", tp: 1, v: "$89.500", t: "hace 6 min" },
                    { id: "#48210", ch: "Directo", tp: 2, v: "$54.200", t: "hace 11 min" },
                  ].map((o) => (
                    <div key={o.id} className="flex items-center gap-4 px-5 py-3 text-[13px]">
                      <span className="font-geistmono text-ink-40 w-16">{o.id}</span>
                      <span className="text-ink flex-1">{o.ch}</span>
                      <Badge tone="neutral">{o.tp} touchpoints</Badge>
                      <span className="font-medium text-ink tabular-nums w-24 text-right">{o.v}</span>
                      <span className="font-geistmono text-[11px] text-ink-40 w-20 text-right">{o.t}</span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>

            <div className="mt-6 flex items-center justify-between">
              <p className="font-geistmono text-[11px] text-ink-40">Preview del design system enterprise · inspo appstack.tech · warm + Geist + acento solo-status</p>
              <div className="flex gap-2">
                <Button variant="subtle" className="text-[12px]">Exportar</Button>
                <Button className="text-[13px] px-3.5 py-1.5">Ver reporte</Button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

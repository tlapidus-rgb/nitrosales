import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { leerRespuestaContextual } from "@/lib/aurum/respuesta-contextual";
import { AurumQuotaNotice } from "@/components/aurum/AurumQuotaNotice";
const response = (data: unknown, status = 200) => Response.json(data, { status });
it("preserves reply and exposes the quota notice", async () => {
 expect(await leerRespuestaContextual(response({ reply: "Ventas: 10", cuota: { aviso: "Consumo pendiente de conciliar" } })))
  .toEqual({ reply: "Ventas: 10", aviso: "Consumo pendiente de conciliar" });
});
it("does not add a notice to an ordinary successful reply", async () => {
 expect(await leerRespuestaContextual(response({ reply: "test" }))).toEqual({ reply: "test", aviso: null });
});
it.each([429, 503])("preserves intentional quota errors for HTTP %s", async status => {
 await expect(leerRespuestaContextual(response({ error: "Aviso de cupo" }, status))).rejects.toThrow("Aviso de cupo");
});
it.each([429, 503])("handles non-JSON proxy failures for HTTP %s", async status => {
 await expect(leerRespuestaContextual(new Response("<html>proxy</html>", { status }))).rejects.toThrow(/Aurum/);
});
it("does not expose internal server errors", async () => {
 await expect(leerRespuestaContextual(response({ error: "database password" }, 500))).rejects.toThrow("No pude responder ahora");
});
it("does not treat malformed success as an empty answer", async () => {
 await expect(leerRespuestaContextual(response({ reply: "" }))).rejects.toThrow("respuesta incompleta");
});
it("provides an unavailable-consumption fallback", async () => {
 expect((await leerRespuestaContextual(response({ reply: "test", cuota: { medicionDisponible: false } }))).aviso).toContain("no está disponible");
});
it("renders notices accessibly as escaped text", () => {
 const html = renderToStaticMarkup(<AurumQuotaNotice aviso="<script>quota</script>" />);
 expect(html).toContain('role="status"'); expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
 expect(renderToStaticMarkup(<AurumQuotaNotice aviso={null} />)).toBe("");
});
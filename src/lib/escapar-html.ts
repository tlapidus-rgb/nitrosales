// ══════════════════════════════════════════════════════════════════════════
// src/lib/escapar-html.ts — texto que se mete en HTML armado a mano
// ══════════════════════════════════════════════════════════════════════════
// Varias rutas devuelven páginas HTML o mails armados con template strings. Todo
// valor que no escribimos nosotros (parámetros de la URL, el nombre de una
// organización, un email que cargó el cliente, el mensaje de un error) pasa por
// acá antes de entrar al HTML. Si no, un nombre de organización como
// `<img src=x onerror=…>` ejecuta JavaScript en nuestro dominio con la sesión de
// quien abre la página (el staff, en las páginas de confirmación).
// ══════════════════════════════════════════════════════════════════════════

export function escaparHtml(texto: unknown): string {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

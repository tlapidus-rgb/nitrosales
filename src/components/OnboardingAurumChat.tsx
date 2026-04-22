// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// OnboardingAurumChat — drawer lateral con chat de Aurum
// ══════════════════════════════════════════════════════════════
// Fase 0 del roadmap de onboarding. Boton abajo del overlay →
// click → abre este drawer con chat de Aurum en modo "Onboarding
// Assistant". Soporta texto + screenshots (paste o attach).
// ══════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from "react";
import { X, Paperclip, Send, Image as ImageIcon, Loader2 } from "lucide-react";
import { AurumOrb } from "./aurum/AurumOrb";

const BRAND_ORANGE = "#FF5E1A";
const CREATOR_GRADIENT = "linear-gradient(135deg, #ff0080 0%, #a855f7 50%, #00d4ff 100%)";

type ImgAttachment = { base64: string; mediaType: string; preview: string };
type UiMessage = {
  role: "user" | "assistant";
  text?: string;
  images?: Array<{ preview: string }>;
};

const QUICK_PROMPTS: Array<{ emoji: string; text: string }> = [
  { emoji: "📸", text: "Te comparto un screenshot de lo que veo" },
  { emoji: "🤷", text: "No sé cómo seguir desde acá" },
  { emoji: "🔑", text: "¿Cómo encuentro mi App Key de VTEX?" },
  { emoji: "⏰", text: "¿Cuánto tarda el backfill?" },
  { emoji: "🔒", text: "¿Qué hacen con mis credenciales?" },
  { emoji: "💡", text: "¿Qué voy a poder hacer cuando termine?" },
];

export default function OnboardingAurumChat({
  open,
  onClose,
  currentPhase,
  currentStep,
}: {
  open: boolean;
  onClose: () => void;
  currentPhase?: string | null;
  currentStep?: string | null;
}) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ImgAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll al fondo cuando llegan mensajes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  // ESC cierra
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus al textarea al abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  async function fileToAttachment(file: File): Promise<ImgAttachment | null> {
    if (!file.type.startsWith("image/")) return null;
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const base64 = btoa(bin);
    const preview = URL.createObjectURL(file);
    return { base64, mediaType: file.type, preview };
  }

  async function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items);
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          const att = await fileToAttachment(file);
          if (att) setAttachments((prev) => [...prev, att]);
          e.preventDefault();
        }
      }
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      const att = await fileToAttachment(f);
      if (att) setAttachments((prev) => [...prev, att]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSend(customText?: string) {
    const text = (customText ?? input).trim();
    if (!text && attachments.length === 0) return;
    if (sending) return;

    const myMsg: UiMessage = {
      role: "user",
      text: text || undefined,
      images: attachments.map((a) => ({ preview: a.preview })),
    };
    setMessages((prev) => [...prev, myMsg]);
    setInput("");
    const imgsToSend = attachments.map((a) => ({ base64: a.base64, mediaType: a.mediaType }));
    setAttachments([]);
    setSending(true);

    try {
      const res = await fetch("/api/onboarding/aurum-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          images: imgsToSend,
          conversationId,
          currentPhase,
          currentStep,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: `Ups, algo falló: ${json.error || "error desconocido"}. Probá de nuevo en un rato.` },
        ]);
        return;
      }
      setConversationId(json.conversationId);
      setMessages((prev) => [...prev, { role: "assistant", text: json.reply }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "No pude conectarme. Chequeá tu conexión y probá de nuevo." },
      ]);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop sutil */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          backdropFilter: "blur(2px)",
          zIndex: 10000,
          animation: "oacFadeIn 200ms ease-out",
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(480px, 100vw)",
          background: "#0F0F14",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "-20px 0 60px rgba(0,0,0,0.5)",
          zIndex: 10001,
          display: "flex",
          flexDirection: "column",
          animation: "oacSlideIn 280ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "linear-gradient(180deg, rgba(168,85,247,0.08) 0%, transparent 100%)",
          }}
        >
          <AurumOrb size={36} thinking={sending} />
          <div style={{ flex: 1 }}>
            <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>Aurum</div>
            <div style={{ color: "#9CA3AF", fontSize: 11.5 }}>
              {sending ? "Pensando…" : "Te ayudo con dudas del onboarding"}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              color: "#9CA3AF",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Lista de mensajes o quick prompts */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {messages.length === 0 && (
            <div>
              {/* Bienvenida */}
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: 14,
                  background: "rgba(168,85,247,0.08)",
                  border: "1px solid rgba(168,85,247,0.18)",
                  color: "#E5E7EB",
                  fontSize: 13,
                  lineHeight: 1.55,
                  marginBottom: 18,
                }}
              >
                Hola, soy Aurum. Estoy acá para ayudarte a terminar de conectar tus plataformas. Podés mandarme screenshots o preguntarme lo que no entiendas del onboarding.
              </div>

              <div
                style={{
                  fontSize: 11,
                  color: "#6B7280",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                  marginBottom: 10,
                }}
              >
                Probá preguntarme
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {QUICK_PROMPTS.map((qp, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(qp.text)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "11px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.03)",
                      color: "#D1D5DB",
                      fontSize: 12.5,
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(168,85,247,0.08)";
                      e.currentTarget.style.borderColor = "rgba(168,85,247,0.25)";
                      e.currentTarget.style.color = "#fff";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                      e.currentTarget.style.color = "#D1D5DB";
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{qp.emoji}</span>
                    <span>{qp.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, idx) => (
            <MessageBubble key={idx} message={m} />
          ))}

          {sending && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <AurumOrb size={24} thinking />
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  color: "#9CA3AF",
                  fontSize: 12.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ animation: "oacBlink 1.4s ease-in-out infinite" }}>●</span>
                <span style={{ animation: "oacBlink 1.4s ease-in-out infinite 0.2s" }}>●</span>
                <span style={{ animation: "oacBlink 1.4s ease-in-out infinite 0.4s" }}>●</span>
              </div>
            </div>
          )}
        </div>

        {/* Previews de attachments pendientes */}
        {attachments.length > 0 && (
          <div
            style={{
              padding: "10px 16px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {attachments.map((a, i) => (
              <div
                key={i}
                style={{
                  position: "relative",
                  width: 54,
                  height: 54,
                  borderRadius: 8,
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <img src={a.preview} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button
                  onClick={() => removeAttachment(i)}
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "rgba(0,0,0,0.75)",
                    border: "none",
                    color: "#fff",
                    fontSize: 10,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  aria-label="Quitar imagen"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input */}
        <div
          style={{
            padding: "12px 16px 16px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              color: "#9CA3AF",
              cursor: sending ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
            title="Adjuntar imagen"
          >
            <Paperclip size={16} />
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Escribí o pegá un screenshot con Ctrl+V…"
            disabled={sending}
            rows={1}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              color: "#E5E7EB",
              fontSize: 13,
              resize: "none",
              maxHeight: 120,
              outline: "none",
              fontFamily: "inherit",
              lineHeight: 1.5,
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(168,85,247,0.4)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
          />

          <button
            onClick={() => handleSend()}
            disabled={sending || (!input.trim() && attachments.length === 0)}
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              border: "none",
              background:
                !input.trim() && attachments.length === 0
                  ? "rgba(255,255,255,0.08)"
                  : CREATOR_GRADIENT,
              color: "#fff",
              cursor: sending || (!input.trim() && attachments.length === 0) ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "transform 0.1s",
            }}
            title="Enviar"
          >
            {sending ? <Loader2 size={15} className="oac-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes oacFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes oacSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes oacBlink { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }
        .oac-spin { animation: spin 1s linear infinite; }
      `}</style>
    </>
  );
}

function MessageBubble({ message }: { message: UiMessage }) {
  const isUser = message.role === "user";
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        flexDirection: isUser ? "row-reverse" : "row",
      }}
    >
      {!isUser && <AurumOrb size={24} />}
      <div style={{ maxWidth: "82%" }}>
        {message.images && message.images.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6, justifyContent: isUser ? "flex-end" : "flex-start" }}>
            {message.images.map((im, i) => (
              <img
                key={i}
                src={im.preview}
                style={{
                  maxWidth: 160,
                  maxHeight: 160,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              />
            ))}
          </div>
        )}
        {message.text && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              background: isUser ? "rgba(255,94,26,0.14)" : "rgba(255,255,255,0.04)",
              border: isUser ? "1px solid rgba(255,94,26,0.3)" : "1px solid rgba(255,255,255,0.06)",
              color: isUser ? "#FFD9C4" : "#E5E7EB",
              fontSize: 13,
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {renderInlineMarkdown(message.text)}
          </div>
        )}
      </div>
    </div>
  );
}

function renderInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<React.Fragment key={key++}>{text.slice(last, m.index)}</React.Fragment>);
    parts.push(
      <strong key={key++} style={{ color: "#FF9A5E" }}>
        {m[1]}
      </strong>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<React.Fragment key={key++}>{text.slice(last)}</React.Fragment>);
  return parts;
}

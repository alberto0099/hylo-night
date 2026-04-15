"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { supabase } from "./lib/supabase";


type EventHylo = {
  id: number;
  body: string;
  created_at: string;
  image_url?: string | null;
  is_anonymous: boolean;
  author_name?: string | null;
};

const MAX_CHARS = 600;

function formatHyloDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();

  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);

  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);

  const hour = d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (d >= startToday) return hour;
  if (d >= startYesterday) return `Ayer ${hour}`;

  if (days < 7) {
    const weekday = d.toLocaleDateString("es-ES", { weekday: "long" });
    return `${weekday} ${hour}`;
  }

  return d.toLocaleDateString("es-ES");
}

export default function EventFeedPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [rows, setRows] = useState<EventHylo[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const [blockedMsg, setBlockedMsg] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmClosing, setConfirmClosing] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successClosing, setSuccessClosing] = useState(false);
  const [posting, setPosting] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createClosing, setCreateClosing] = useState(false);

  const particles = useMemo(() => Array.from({ length: 24 }), []);
  const overLimit = body.length > MAX_CHARS;

  useEffect(() => {
    fetchRows();
  }, []);

  async function fetchRows() {
    setLoading(true);

    const { data, error } = await supabase
      .from("panel_posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error) {
      setRows((data as EventHylo[]) ?? []);
    }

    setLoading(false);
  }

  function openCreate() {
    setCreateClosing(false);
    setCreateOpen(true);
  }

  function closeCreate() {
    setCreateClosing(true);
    window.setTimeout(() => {
      setCreateOpen(false);
      setCreateClosing(false);
      setBlockedMsg("");
    }, 180);
  }

  function openConfirm() {
    const cleanBody = body.trim();

    if (!cleanBody) {
      setBlockedMsg("Escribe algo antes de publicar.");
      return;
    }

    if (cleanBody.length > MAX_CHARS) {
      setBlockedMsg(`Máximo ${MAX_CHARS} caracteres.`);
      return;
    }

    setBlockedMsg("");
    setConfirmClosing(false);
    setConfirmOpen(true);
  }

  function closeConfirm() {
    setConfirmClosing(true);
    window.setTimeout(() => {
      setConfirmOpen(false);
      setConfirmClosing(false);
    }, 180);
  }

  function closeSuccess() {
    setSuccessClosing(true);
    window.setTimeout(() => {
      setSuccessOpen(false);
      setSuccessClosing(false);
    }, 180);
  }

  function handlePickFile(nextFile?: File | null) {
    if (!nextFile) return;

    if (!nextFile.type.startsWith("image/")) {
      setBlockedMsg("Solo se permiten imágenes.");
      return;
    }

    setBlockedMsg("");
    setFile(nextFile);
  }

  async function publishHylo() {
    const cleanBody = body.trim();
    const cleanName = name.trim();

    if (!cleanBody) {
      setBlockedMsg("Escribe algo antes de publicar.");
      closeConfirm();
      return;
    }

    if (cleanBody.length > MAX_CHARS) {
      setBlockedMsg(`Máximo ${MAX_CHARS} caracteres.`);
      closeConfirm();
      return;
    }

    setPosting(true);

    try {
      let imageUrl: string | null = null;

      if (file) {
        const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const fileName = `event-${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("panel-images")
          .upload(fileName, file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from("panel-images")
          .getPublicUrl(fileName);

        imageUrl = publicUrlData.publicUrl;
      }

      const payload = {
        name: isAnonymous ? "" : cleanName || "Usuario",
        body: cleanBody,
        category: "fiestas",
        is_anonymous: isAnonymous,
        image_url: imageUrl,
      };

      const { error } = await supabase
        .from("panel_posts")
        .insert([payload]);

      if (error) throw error;

      closeConfirm();
      closeCreate();

      setName("");
      setBody("");
      setIsAnonymous(false);
      setFile(null);
      setBlockedMsg("");

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setSuccessClosing(false);
      setSuccessOpen(true);
      await fetchRows();
    } catch (error: any) {
      setBlockedMsg("No se pudo publicar el hylo.");
      closeConfirm();
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="event-page">
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />
      <div className="bg-orb bg-orb-3" />

      <div className="particles" aria-hidden="true">
        {particles.map((_, i) => (
          <span
            key={i}
            className={`particle particle-${(i % 6) + 1}`}
            style={
              {
                "--left": `${4 + ((i * 11) % 88)}%`,
                "--size": `${4 + (i % 4) * 2}px`,
                "--delay": `${(i % 7) * 0.8}s`,
                "--duration": `${8 + (i % 5)}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <header className="event-header">
        <img src="/hylo_logo.png" alt="Hylo" className="event-logo" />
      </header>

      <main className="event-feed">
        {loading ? null : rows.map((r) => (
          <article key={r.id} className="event-hylo-card">
            <div className="event-hylo-top">
              <div className="event-hylo-author">
                {r.is_anonymous ? "Anónimo" : (r.author_name || "Usuario")}
              </div>
              <div className="event-hylo-time">{formatHyloDate(r.created_at)}</div>
            </div>

            <p className="event-hylo-body">{r.body}</p>

            {r.image_url ? (
              <img src={r.image_url} alt="" className="event-hylo-image" />
            ) : null}
          </article>
        ))}
      </main>

      <button type="button" className="event-plus-btn" onClick={openCreate}>
        +
      </button>

      {createOpen && (
        <div className={`hylo-modal-backdrop ${createClosing ? "is-closing" : ""}`} onClick={closeCreate}>
          <div
            className={`hylo-modal ${createClosing ? "is-closing" : ""}`}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 420, margin: "0 auto" }}
          >
            <div className="hylo-modal-title" style={{ marginBottom: 18 }}>
              Publicar hylo
            </div>

            <div className="field-block">
              <input
                className="name-input"
                type="text"
                placeholder="Tu nombre"
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isAnonymous || posting}
              />
            </div>

            <div className="textarea-wrap">
              <textarea
                placeholder="Escribe tu hylo..."
                maxLength={MAX_CHARS + 200}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  if (blockedMsg) setBlockedMsg("");
                }}
                disabled={posting}
                style={{
                  borderColor: overLimit ? "rgba(255,90,90,0.45)" : undefined,
                }}
              />
              <div className="counter">
                <span className={overLimit ? "counter-over" : ""}>
                  {body.length}/{MAX_CHARS}
                </span>
              </div>
            </div>

            {blockedMsg ? <div className="error-box">{blockedMsg}</div> : null}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const nextFile = e.target.files?.[0] ?? null;
                handlePickFile(nextFile);
                e.currentTarget.value = "";
              }}
              disabled={posting}
            />

            <div className="image-upload-block">
              <button
                className="secondary-btn"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={posting}
              >
                Subir imagen
              </button>

              {file ? (
                <div className="file-pill" style={{ marginLeft: 12 }}>
                  <span className="file-pill-text">Imagen</span>
                  <button
                    type="button"
                    className="file-pill-remove"
                    onClick={() => setFile(null)}
                    aria-label="Quitar imagen"
                    disabled={posting}
                  >
                    ✕
                  </button>
                </div>
              ) : null}
            </div>

            <label className="check-row">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => {
                  setIsAnonymous(e.target.checked);
                  if (e.target.checked) setName("");
                }}
                disabled={posting}
              />
              <span className="custom-check" />
              <span className="check-label">Anónimo</span>
            </label>

            <button
              className="publish-btn"
              type="button"
              onClick={openConfirm}
              disabled={!body.trim() || overLimit || posting}
            >
              Publicar
            </button>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div
          className={`hylo-modal-backdrop ${confirmClosing ? "is-closing" : ""}`}
          onClick={closeConfirm}
        >
          <div
            className={`hylo-modal hylo-confirm ${confirmClosing ? "is-closing" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hylo-modal-title" style={{ marginBottom: 10 }}>
              Confirmación
            </div>

            <p className="hylo-confirm-text">
              Al publicar confirmas que no estás compartiendo contenido sensible,
              ilegal, ni información personal de terceros.
            </p>

            <div className="hylo-confirm-actions">
              <button className="hylo-btn" type="button" onClick={closeConfirm} disabled={posting}>
                Cancelar
              </button>

              <button className="hylo-btn hylo-btn-primary" type="button" onClick={publishHylo} disabled={posting}>
                {posting ? "Publicando…" : "Acepto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {successOpen && (
        <div
          className={`hylo-modal-backdrop ${successClosing ? "is-closing" : ""}`}
          onClick={closeSuccess}
        >
          <div
            className={`hylo-modal hylo-confirm ${successClosing ? "is-closing" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hylo-modal-title" style={{ marginBottom: 10 }}>
              Hylo enviado
            </div>

            <p className="hylo-confirm-text">
              Tu hylo se ha enviado correctamente.
            </p>

            <div className="hylo-confirm-actions">
              <button className="hylo-btn hylo-btn-primary" type="button" onClick={closeSuccess}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
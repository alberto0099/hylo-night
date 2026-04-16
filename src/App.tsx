import { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase";
import "./index.css";

type EventPostRow = {
  id: number;
  name: string | null;
  body: string;
  is_anonymous: boolean;
  image_url: string | null;
  created_at: string;
};

const MAX_CHARS = 600;

const BLOCKED_NAMES = [
  "maria", "maria carmen", "carmen", "ana", "ana maria", "laura", "marta",
  "lucia", "sofia", "paula", "elena", "isabel", "patricia", "sara", "alba",
  "cristina", "laura", "irene", "claudia", "beatriz", "julia", "andrea",
  "noelia", "alicia", "sandra", "eva", "rocio", "silvia", "nuria", "rosa",
  "teresa", "pilar", "lorena", "veronica", "monica", "raquel", "francisca",

  "antonio", "manuel", "jose", "francisco", "david", "juan", "javier",
  "daniel", "jose antonio", "jose luis", "carlos", "alejandro", "jesus",
  "miguel", "rafael", "pedro", "pablo", "sergio", "fernando", "jorge",
  "alberto", "adrian", "ruben", "ivan", "victor", "roberto", "diego",
  "mario", "angel", "andres", "marcos"
];

const BLOCKED_INSULTS = [
  "puta", "puto", "gilipollas", "idiota", "imbecil", "subnormal", "retrasado",
  "payaso", "payasa", "mierda", "cabron", "cabrona", "hijo de puta",
  "hija de puta", "zorra", "perra", "cerda", "mongolo", "mongola",
  "malparido", "malparida", "tonto", "tonta", "capullo", "capulla",
  "asqueroso", "asquerosa", "basura", "fracasado", "fracasada",
  "chupapollas", "comepollas", "maricon", "maricona", "bollera",

  "bitch", "slut", "whore", "asshole", "idiot", "stupid", "dumbass", "moron",
  "piece of shit", "son of a bitch", "motherfucker", "fucker", "fuck you",
  "fuck off", "dickhead", "jackass", "bastard", "loser", "trash", "scumbag",
  "creep", "pervert", "retard", "stfu"
];

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

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsBlockedTerm(text: string, terms: string[]) {
  const normalized = normalizeText(text);

  return terms.some((term) => {
    const normalizedTerm = normalizeText(term);
    const regex = new RegExp(`(^|\\s)${escapeRegExp(normalizedTerm)}(?=\\s|$)`, "i");
    return regex.test(normalized);
  });
}

function validateHyloContent(body: string, name: string) {
  const normalizedBody = normalizeText(body);
  const normalizedName = normalizeText(name);

  if (!normalizedBody) {
    return "Escribe algo antes de publicar.";
  }

  if (normalizedBody.length > MAX_CHARS) {
    return `Máximo ${MAX_CHARS} caracteres.`;
  }

  if (containsBlockedTerm(normalizedBody, BLOCKED_INSULTS)) {
    return "Tu hylo contiene insultos o lenguaje no permitido.";
  }

  if (containsBlockedTerm(normalizedBody, BLOCKED_NAMES)) {
    return "No se permiten nombres propios en el contenido del hylo.";
  }

  if (normalizedName && containsBlockedTerm(normalizedName, BLOCKED_INSULTS)) {
    return "El nombre contiene lenguaje no permitido.";
  }

  if (normalizedName && containsBlockedTerm(normalizedName, BLOCKED_NAMES)) {
    return "No se permiten nombres reales en el campo de nombre.";
  }

  return "";
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);


  const [rows, setRows] = useState<EventPostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openImageUrl, setOpenImageUrl] = useState<string | null>(null);

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

  const overLimit = body.length > MAX_CHARS;
  const lockPage = createOpen || confirmOpen || successOpen || !!openImageUrl;

  useEffect(() => {
    fetchPosts();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("event-posts-feed")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_posts",
        },
        () => {
          fetchPosts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const bodyEl = document.body;

    if (lockPage) {
      bodyEl.style.overflow = "hidden";
    } else {
      bodyEl.style.overflowX = "hidden";
      bodyEl.style.overflowY = "auto";
    }

    return () => {
      bodyEl.style.overflowX = "hidden";
      bodyEl.style.overflowY = "auto";
    };
  }, [lockPage]);

  async function fetchPosts() {
    const { data, error } = await supabase
      .from("event_posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("FETCH EVENT POSTS ERROR:", error);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data as EventPostRow[]) ?? []);
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
    const cleanName = name.trim();

    const validationError = validateHyloContent(cleanBody, cleanName);

    if (validationError) {
      setBlockedMsg(validationError);
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

    const validationError = validateHyloContent(cleanBody, cleanName);

    if (validationError) {
      setBlockedMsg(validationError);
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

        if (uploadError) {
          console.error("UPLOAD ERROR:", uploadError);
          throw uploadError;
        }

        const { data: publicUrlData } = supabase.storage
          .from("panel-images")
          .getPublicUrl(fileName);

        imageUrl = publicUrlData.publicUrl;
      }

      const payload = {
        name: isAnonymous ? "" : cleanName || "Usuario",
        body: cleanBody,
        is_anonymous: isAnonymous,
        image_url: imageUrl,
      };

      const { error } = await supabase.from("event_posts").insert([payload]);

      if (error) {
        console.error("INSERT EVENT POST ERROR:", error);
        throw error;
      }

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
      await fetchPosts();
    } catch (error) {
      console.error("PUBLISH EVENT HYLO ERROR:", error);
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

      <header className="event-header">
        <img src="/hylonight.png" alt="Hylo Night" className="event-logo" />
      </header>

      <div className="event-header-spacer" />

      <main className="event-feed">
        {loading ? (
          <div className="event-empty">Cargando hylos...</div>
        ) : rows.length === 0 ? (
          <div className="event-empty">Aún no hay hylos en este evento.</div>
        ) : (
          rows.map((r) => {
            const authorName = r.is_anonymous ? "Anónimo" : r.name?.trim() || "Usuario";

            return (
              <article
                key={r.id}
                className={`event-hylo-card ${r.image_url ? "event-hylo-card--image" : ""}`}
              >
                <div className="event-hylo-overlay" />
                <div className="event-hylo-shine" />

                <div className="event-hylo-content">
                  <div className="event-hylo-badge">
                    <span className="event-hylo-badge-emoji" aria-hidden="true">
                      💘
                    </span>
                    <span>Hylo Night</span>
                  </div>

                  <div className="event-hylo-top">
                    <div className="event-hylo-author">{authorName}</div>
                    <div className="event-hylo-time">{formatHyloDate(r.created_at)}</div>
                  </div>

                  <p className="event-hylo-body">{r.body}</p>

                  {r.image_url ? (
                    <div className="event-hylo-image-wrap">
                      <img
                        src={r.image_url}
                        alt=""
                        className="event-hylo-image"
                        loading="lazy"
                        onClick={() => setOpenImageUrl(r.image_url)}
                      />
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </main>

      <button
        type="button"
        className="event-plus-btn event-plus-btn--fab"
        onClick={openCreate}
        aria-label="Publicar hylo"
      >
        <img src="/addhylo.svg" alt="" className="event-plus-icon" />
      </button>

      {createOpen && (
        <div
          className={`hylo-modal-backdrop ${createClosing ? "is-closing" : ""}`}
          onClick={closeCreate}
        >
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
              Al publicar confirmas que no estás compartiendo contenido sensible, ilegal, ni información personal de terceros.
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

            <p className="hylo-confirm-text">Tu hylo se ha enviado correctamente.</p>

            <div className="hylo-confirm-actions">
              <button className="hylo-btn hylo-btn-primary" type="button" onClick={closeSuccess}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {openImageUrl && (
        <div onClick={() => setOpenImageUrl(null)} className="event-image-viewer">
          <img src={openImageUrl} alt="" className="event-image-viewer-img" />

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpenImageUrl(null);
            }}
            className="event-image-viewer-close"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
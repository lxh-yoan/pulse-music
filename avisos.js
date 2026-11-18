// avisos.js — Sistema de Avisos para PulseMusic (Solo Admins y Owner)

(function () {
  const AVISOS_DB_KEY = "pulsemusic_avisos_v1";
  const SESSION_KEY = "pulsemusic_active_session_v1";

  const VERIFIED_SVG = `<span class="verified-badge" title="Staff Verificado"><svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z"/></svg></span>`;

  const memoryFallback = {};
  function safeGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return memoryFallback[key] || null; }
  }
  function safeSet(key, val) {
    memoryFallback[key] = val;
    try { window.localStorage.setItem(key, val); } catch (e) {}
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatNow() {
    return new Date().toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function getSession() {
    const raw = safeGet(SESSION_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function isStaff() {
    const s = getSession();
    return Boolean(s && (s.role === "Owner" || s.role === "Admin"));
  }

  function getAvisos() {
    const raw = safeGet(AVISOS_DB_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveAvisos(list) {
    safeSet(AVISOS_DB_KEY, JSON.stringify(list));
  }

  const TYPE_META = {
    info: { label: "📢 Información", cls: "pm-aviso-info" },
    importante: { label: "🚨 Importante", cls: "pm-aviso-importante" },
    evento: { label: "🔥 Evento / Estreno", cls: "pm-aviso-evento" },
    mantenimiento: { label: "🛠️ Mantenimiento", cls: "pm-aviso-mant" }
  };

  let editingAvisoId = null;
  let dismissedIds = new Set();

  function injectStyles() {
    if (document.getElementById("pm-avisos-styles")) return;
    const style = document.createElement("style");
    style.id = "pm-avisos-styles";
    style.textContent = `
      .pm-avisos-wrap {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-bottom: 22px;
      }
      .pm-avisos-wrap:empty {
        display: none;
        margin-bottom: 0;
      }
      .pm-aviso-card {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-left: 4px solid var(--accent);
        border-radius: 14px;
        padding: 14px 16px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
      }
      .pm-aviso-card.pm-aviso-info { border-left-color: #06b6d4; background: linear-gradient(90deg, rgba(6,182,212,0.10), var(--bg-card) 45%); }
      .pm-aviso-card.pm-aviso-importante { border-left-color: #f43f5e; background: linear-gradient(90deg, rgba(244,63,94,0.14), var(--bg-card) 45%); }
      .pm-aviso-card.pm-aviso-evento { border-left-color: #f59e0b; background: linear-gradient(90deg, rgba(245,158,11,0.12), var(--bg-card) 45%); }
      .pm-aviso-card.pm-aviso-mant { border-left-color: #10b981; background: linear-gradient(90deg, rgba(16,185,129,0.12), var(--bg-card) 45%); }
      .pm-aviso-top {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 5px;
      }
      .pm-aviso-tag {
        font-size: 0.72rem;
        font-weight: 700;
        padding: 3px 9px;
        border-radius: 999px;
        background: rgba(255,255,255,0.08);
        color: var(--text-main);
      }
      .pm-aviso-title {
        font-size: 0.98rem;
        font-weight: 800;
        color: var(--text-main);
      }
      .pm-aviso-msg {
        font-size: 0.88rem;
        color: #d4d4d8;
        line-height: 1.45;
        margin-bottom: 6px;
        word-break: break-word;
      }
      .pm-aviso-meta {
        font-size: 0.75rem;
        color: var(--text-muted);
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .pm-aviso-dismiss {
        background: transparent;
        border: 1px solid var(--border);
        color: var(--text-muted);
        width: 28px;
        height: 28px;
        border-radius: 50%;
        cursor: pointer;
        flex-shrink: 0;
        display: grid;
        place-items: center;
      }
      .pm-aviso-dismiss:hover {
        color: var(--text-main);
        border-color: var(--accent);
      }
      .pm-aviso-admin-form {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        background: var(--bg-card);
        border: 1px solid var(--border);
        padding: 16px;
        border-radius: 14px;
        margin-bottom: 16px;
      }
      .pm-aviso-admin-form .full-span {
        grid-column: 1 / -1;
      }
      @media (max-width: 640px) {
        .pm-aviso-admin-form { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function renderPublicBanner() {
    const main = document.querySelector(".main-content");
    const topbar = document.querySelector(".main-content .topbar");
    if (!main || !topbar) return;

    let wrap = document.getElementById("pmAvisosBanner");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "pmAvisosBanner";
      wrap.className = "pm-avisos-wrap";
      topbar.insertAdjacentElement("afterend", wrap);
    }

    const activeAvisos = getAvisos().filter(a => a.active && !dismissedIds.has(a.id));
    if (activeAvisos.length === 0) {
      wrap.innerHTML = "";
      return;
    }

    wrap.innerHTML = activeAvisos.map(a => {
      const meta = TYPE_META[a.type] || TYPE_META.info;
      return `
        <div class="pm-aviso-card ${meta.cls}">
          <div style="flex:1; min-width:0;">
            <div class="pm-aviso-top">
              <span class="pm-aviso-tag">${meta.label}</span>
              <span class="pm-aviso-title">${escapeHTML(a.title)}</span>
            </div>
            <div class="pm-aviso-msg">${escapeHTML(a.message)}</div>
            <div class="pm-aviso-meta">
              <span>Publicado por <strong style="color:var(--text-main);">${escapeHTML(a.author)}</strong> (${escapeHTML(a.authorRole)})${VERIFIED_SVG}</span>
              <span>•</span>
              <span>${escapeHTML(a.createdAt)}</span>
            </div>
          </div>
          <button class="pm-aviso-dismiss" data-dismiss-aviso="${escapeHTML(a.id)}" title="Ocultar aviso">✕</button>
        </div>
      `;
    }).join("");

    wrap.querySelectorAll("[data-dismiss-aviso]").forEach(btn => {
      btn.addEventListener("click", () => {
        dismissedIds.add(btn.getAttribute("data-dismiss-aviso"));
        renderPublicBanner();
      });
    });
  }

  function injectAdminTabAndSection() {
    const adminModal = document.getElementById("adminModal");
    const adminNavTabs = document.getElementById("adminNavTabs");
    const modalCard = adminModal ? adminModal.querySelector(".modal-card") : null;
    if (!adminModal || !adminNavTabs || !modalCard) return;

    let tabBtn = adminNavTabs.querySelector('[data-admin-tab="avisos"]');
    let secDiv = document.getElementById("admin-sec-avisos");

    // Mostrar solo si es Owner o Admin
    if (!isStaff()) {
      if (tabBtn) tabBtn.remove();
      if (secDiv) secDiv.remove();
      return;
    }

    if (!tabBtn) {
      tabBtn = document.createElement("button");
      tabBtn.className = "admin-nav-tab";
      tabBtn.setAttribute("data-admin-tab", "avisos");
      tabBtn.textContent = "📢 Avisos";
      adminNavTabs.appendChild(tabBtn);
    }

    if (!secDiv) {
      secDiv = document.createElement("div");
      secDiv.className = "admin-section";
      secDiv.id = "admin-sec-avisos";
      secDiv.innerHTML = `
        <form class="pm-aviso-admin-form" id="pmAvisoForm">
          <div class="input-group">
            <label for="pmAvisoTitle">Título del aviso</label>
            <input type="text" id="pmAvisoTitle" class="input-field" maxlength="70" placeholder="Ej: ¡Nueva música disponible!" required />
          </div>
          <div class="input-group">
            <label for="pmAvisoType">Tipo de aviso</label>
            <select id="pmAvisoType" class="input-field">
              <option value="info">📢 Información</option>
              <option value="importante">🚨 Importante</option>
              <option value="evento">🔥 Evento / Estreno</option>
              <option value="mantenimiento">🛠️ Mantenimiento</option>
            </select>
          </div>
          <div class="input-group full-span">
            <label for="pmAvisoMessage">Mensaje del aviso</label>
            <textarea id="pmAvisoMessage" class="input-field" rows="2" maxlength="300" placeholder="Escribe el comunicado que verán todos en la página..." required style="resize:vertical;"></textarea>
          </div>
          <div class="full-span" style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
            <span id="pmAvisoFeedback" style="font-size:0.82rem; color:#4ade80;"></span>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn-ghost" id="pmAvisoCancelEdit" style="display:none; border-radius:10px;">Cancelar edición</button>
              <button type="submit" class="btn-primary" id="pmAvisoSubmitBtn" style="padding:10px 18px; border-radius:10px;">📢 Subir Aviso</button>
            </div>
          </div>
        </form>

        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Título y Mensaje</th>
                <th>Publicado por</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="pmAvisosTableBody"></tbody>
          </table>
        </div>
      `;
      modalCard.appendChild(secDiv);

      // Conectar eventos del formulario
      const form = document.getElementById("pmAvisoForm");
      const titleInput = document.getElementById("pmAvisoTitle");
      const typeInput = document.getElementById("pmAvisoType");
      const msgInput = document.getElementById("pmAvisoMessage");
      const feedback = document.getElementById("pmAvisoFeedback");
      const submitBtn = document.getElementById("pmAvisoSubmitBtn");
      const cancelBtn = document.getElementById("pmAvisoCancelEdit");

      cancelBtn.addEventListener("click", () => {
        editingAvisoId = null;
        form.reset();
        submitBtn.textContent = "📢 Subir Aviso";
        cancelBtn.style.display = "none";
        feedback.textContent = "";
      });

      form.addEventListener("submit", e => {
        e.preventDefault();
        if (!isStaff()) {
          alert("Solo Admins y el Owner pueden subir avisos.");
          return;
        }
        const session = getSession();
        const title = titleInput.value.trim();
        const message = msgInput.value.trim();
        const type = typeInput.value;
        if (!title || !message) return;

        const list = getAvisos();
        if (editingAvisoId) {
          const idx = list.findIndex(x => x.id === editingAvisoId);
          if (idx !== -1) {
            list[idx] = {
              ...list[idx],
              title,
              message,
              type,
              createdAt: formatNow() + " (editado)"
            };
          }
          editingAvisoId = null;
          submitBtn.textContent = "📢 Subir Aviso";
          cancelBtn.style.display = "none";
          feedback.textContent = "✅ Aviso actualizado en la página.";
        } else {
          list.unshift({
            id: `aviso-${Date.now()}`,
            title,
            message,
            type,
            author: session.name,
            authorRole: session.role,
            createdAt: formatNow(),
            active: true
          });
          feedback.textContent = "✅ Aviso publicado en la página.";
        }

        saveAvisos(list);
        form.reset();
        renderAdminAvisosTable();
        renderPublicBanner();
      });
    }

    // Manejo limpio de pestañas en Admin Modal (incluyendo la nueva pestaña)
    if (!adminNavTabs.dataset.avisosTabsBound) {
      adminNavTabs.dataset.avisosTabsBound = "1";
      adminNavTabs.addEventListener("click", e => {
        const clickedTab = e.target.closest(".admin-nav-tab");
        if (!clickedTab) return;
        const target = clickedTab.getAttribute("data-admin-tab");

        adminNavTabs.querySelectorAll(".admin-nav-tab").forEach(t => t.classList.remove("active"));
        modalCard.querySelectorAll(".admin-section").forEach(s => s.classList.remove("active"));

        clickedTab.classList.add("active");
        const targetSec = document.getElementById(`admin-sec-${target}`);
        if (targetSec) targetSec.classList.add("active");

        if (target === "avisos") renderAdminAvisosTable();
      });
    }

    renderAdminAvisosTable();
  }

  function renderAdminAvisosTable() {
    const tbody = document.getElementById("pmAvisosTableBody");
    if (!tbody) return;
    const list = getAvisos();

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">No hay avisos publicados todavía. ¡Sube el primero arriba!</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(a => {
      const meta = TYPE_META[a.type] || TYPE_META.info;
      const shortMsg = a.message.length > 48 ? a.message.slice(0, 48) + "..." : a.message;
      return `
        <tr>
          <td><span class="pm-aviso-tag">${meta.label}</span></td>
          <td>
            <strong>${escapeHTML(a.title)}</strong>
            <div style="font-size:0.76rem; color:var(--text-muted);">${escapeHTML(shortMsg)}</div>
          </td>
          <td>${escapeHTML(a.author)} <span style="color:var(--text-muted); font-size:0.75rem;">(${escapeHTML(a.authorRole)})</span>${VERIFIED_SVG}</td>
          <td style="color:var(--text-muted);">${escapeHTML(a.createdAt)}</td>
          <td>
            <span class="status-dot ${a.active ? "" : "offline"}">${a.active ? "Visible" : "Oculto"}</span>
          </td>
          <td>
            <div style="display:flex; gap:6px;">
              <button class="btn-mini-accent" data-toggle-aviso="${escapeHTML(a.id)}">${a.active ? "Ocultar" : "Mostrar"}</button>
              <button class="btn-mini-accent" data-edit-aviso="${escapeHTML(a.id)}">✏️</button>
              <button class="btn-mini-danger" data-del-aviso="${escapeHTML(a.id)}">Eliminar</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("[data-toggle-aviso]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!isStaff()) return;
        const id = btn.getAttribute("data-toggle-aviso");
        const list = getAvisos();
        const idx = list.findIndex(x => x.id === id);
        if (idx !== -1) {
          list[idx].active = !list[idx].active;
          saveAvisos(list);
          renderAdminAvisosTable();
          renderPublicBanner();
        }
      });
    });

    tbody.querySelectorAll("[data-edit-aviso]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!isStaff()) return;
        const id = btn.getAttribute("data-edit-aviso");
        const found = getAvisos().find(x => x.id === id);
        if (!found) return;
        editingAvisoId = found.id;
        document.getElementById("pmAvisoTitle").value = found.title;
        document.getElementById("pmAvisoType").value = found.type;
        document.getElementById("pmAvisoMessage").value = found.message;
        document.getElementById("pmAvisoSubmitBtn").textContent = "💾 Guardar Aviso";
        document.getElementById("pmAvisoCancelEdit").style.display = "inline-flex";
      });
    });

    tbody.querySelectorAll("[data-del-aviso]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!isStaff()) return;
        const id = btn.getAttribute("data-del-aviso");
        saveAvisos(getAvisos().filter(x => x.id !== id));
        renderAdminAvisosTable();
        renderPublicBanner();
      });
    });
  }

  function init() {
    injectStyles();
    renderPublicBanner();
    injectAdminTabAndSection();

    // Sincronizar automáticamente cuando el modal Admin se abre o cambia la sesión
    const adminModal = document.getElementById("adminModal");
    if (adminModal) {
      const observer = new MutationObserver(() => {
        if (adminModal.classList.contains("open")) {
          injectAdminTabAndSection();
        }
      });
      observer.observe(adminModal, { attributes: true, attributeFilter: ["class"] });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

// api/audius.js — Integración de Audius API para PulseMusic
<script src="api/audius.js"></script>
  <script src="app.js"></script>
(function () {
  const AUDIUS_TOKEN = "2cc593fc814461263d282a84286fd4f72c79562e";
  const AUDIUS_BASE_URL = "https://api.audius.co/v1";
  const APP_NAME = "PulseMusic";

  const GENRE_MAP = {
    "Todo": "",
    "Pop": "Pop",
    "Hip Hop": "Hip-Hop/Rap",
    "Electrónica": "Electronic"
  };

  let discoveryHost = null;
  let tracksList = [];
  let likedIds = new Set();
  let currentIndex = -1;
  let isPlaying = false;
  let isShuffle = false;
  let isRepeat = false;
  let searchTimer = null;

  const audio = new Audio();
  audio.volume = 0.8;

  // Cargar favoritos guardados
  try {
    const savedLikes = JSON.parse(localStorage.getItem("pulsemusic_audius_likes") || "[]");
    if (Array.isArray(savedLikes)) likedIds = new Set(savedLikes);
  } catch (e) {}

  function saveLikes() {
    try {
      localStorage.setItem("pulsemusic_audius_likes", JSON.stringify(Array.from(likedIds)));
    } catch (e) {}
  }

  async function getDiscoveryHost() {
    if (discoveryHost) return discoveryHost;
    try {
      const res = await fetch("https://api.audius.co");
      const json = await res.json();
      if (json && Array.isArray(json.data) && json.data.length > 0) {
        discoveryHost = json.data[0];
        return discoveryHost;
      }
    } catch (e) {}
    return "https://discoveryprovider.audius.co";
  }

  async function audiusFetch(endpoint, params = {}) {
    const query = new URLSearchParams({
      app_name: APP_NAME,
      ...params
    });

    // Intento 1: Endpoint oficial v1 con Bearer Token
    try {
      const res = await fetch(`${AUDIUS_BASE_URL}${endpoint}?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${AUDIUS_TOKEN}`
        }
      });
      if (res.ok) return await res.json();
    } catch (e) {}

    // Intento 2: Endpoint oficial v1 con parámetro api_key (evita bloqueo CORS preflight)
    try {
      const q2 = new URLSearchParams({
        app_name: APP_NAME,
        api_key: AUDIUS_TOKEN,
        ...params
      });
      const res = await fetch(`${AUDIUS_BASE_URL}${endpoint}?${q2.toString()}`);
      if (res.ok) return await res.json();
    } catch (e) {}

    // Intento 3: Nodo Discovery de respaldo
    const host = await getDiscoveryHost();
    const res = await fetch(`${host}/v1${endpoint}?${query.toString()}`);
    if (!res.ok) throw new Error(`Error Audius API: ${res.status}`);
    return await res.json();
  }

  function formatTrack(raw) {
    const artwork = raw.artwork || {};
    const cover = artwork["480x480"] || artwork["150x150"] || artwork["1000x1000"] || "";
    return {
      id: raw.id,
      title: raw.title || "Sin título",
      artist: (raw.user && (raw.user.name || raw.user.handle)) || "Artista Audius",
      genre: raw.genre || "Música",
      duration: Number(raw.duration) || 0,
      cover,
      streamUrl: `${AUDIUS_BASE_URL}/tracks/${encodeURIComponent(raw.id)}/stream?app_name=${encodeURIComponent(APP_NAME)}&api_key=${encodeURIComponent(AUDIUS_TOKEN)}`
    };
  }

  // API pública disponible globalmente como window.AudiusAPI
  const AudiusAPI = {
    async getTrending(genre = "", limit = 20) {
      const params = { limit: String(limit) };
      if (genre) params.genre = genre;
      const json = await audiusFetch("/tracks/trending", params);
      return (json.data || []).map(formatTrack);
    },

    async search(queryText, limit = 20) {
      const params = { query: queryText, limit: String(limit) };
      const json = await audiusFetch("/tracks/search", params);
      return (json.data || []).map(formatTrack);
    },

    async getTrack(trackId) {
      const json = await audiusFetch(`/tracks/${encodeURIComponent(trackId)}`);
      return json.data ? formatTrack(json.data) : null;
    },

    getStreamUrl(trackId) {
      return `${AUDIUS_BASE_URL}/tracks/${encodeURIComponent(trackId)}/stream?app_name=${encodeURIComponent(APP_NAME)}&api_key=${encodeURIComponent(AUDIUS_TOKEN)}`;
    }
  };

  window.AudiusAPI = AudiusAPI;

  // === CONEXIÓN CON LA INTERFAZ Y REPRODUCTOR DE PULSEMUSIC ===
  function formatTime(sec) {
    if (!sec || isNaN(sec)) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function initPlayerIntegration() {
    const grid = document.querySelector(".tracks-grid");
    const searchInput = document.querySelector(".main-content .search-box input");
    const filterPills = document.querySelectorAll(".main-content .filters .filter-pill");
    const heroPlayBtn = document.querySelector(".hero .btn-primary");

    const playerCover = document.querySelector(".player-cover");
    const playerTitle = document.querySelector(".player-details .title");
    const playerArtist = document.querySelector(".player-details .artist");
    const playerLikeBtn = document.querySelector(".player-track-info .like-btn");

    const controlBtns = document.querySelectorAll(".player-controls-btns .control-btn");
    const shuffleBtn = controlBtns[0];
    const prevBtn = controlBtns[1];
    const mainPlayBtn = controlBtns[2];
    const nextBtn = controlBtns[3];
    const repeatBtn = controlBtns[4];

    const timeSpans = document.querySelectorAll(".progress-container span");
    const currentTimeEl = timeSpans[0];
    const totalTimeEl = timeSpans[1];
    const progressBar = document.querySelector(".progress-bar");
    const progressFilled = document.querySelector(".progress-filled");
    const volumeSlider = document.querySelector(".volume-slider");
    const muteBtn = document.querySelector(".player-right .control-btn");

    if (!grid) return;

    function renderGrid(list) {
      if (!list || list.length === 0) {
        grid.innerHTML = `<p style="color:var(--text-muted); grid-column:1/-1;">No se encontraron canciones en Audius.</p>`;
        return;
      }

      grid.innerHTML = list
        .map((t, idx) => {
          const isCurrent = currentIndex === idx;
          const liked = likedIds.has(t.id);
          const coverHtml = t.cover
            ? `<img src="${escapeHTML(t.cover)}" alt="${escapeHTML(t.title)}" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy" />`
            : `<span style="font-size:2rem;">🎵</span>`;

          return `
            <div class="track-card ${isCurrent ? "playing" : ""}" data-track-idx="${idx}">
              <div class="cover-art" style="background: linear-gradient(135deg, #3b82f6, #8b5cf6);">
                ${coverHtml}
                <div class="play-overlay">${isCurrent && isPlaying ? "⏸" : "▶"}</div>
              </div>
              <div class="track-meta">
                <div style="min-width:0; flex:1;">
                  <div class="track-title" title="${escapeHTML(t.title)}">${escapeHTML(t.title)}</div>
                  <div class="track-artist" title="${escapeHTML(t.artist)}">${escapeHTML(t.artist)}</div>
                </div>
                <button class="like-btn ${liked ? "liked" : ""}" data-like-id="${escapeHTML(t.id)}">${liked ? "❤️" : "🤍"}</button>
              </div>
            </div>
          `;
        })
        .join("");

      grid.querySelectorAll(".track-card").forEach(card => {
        card.addEventListener("click", e => {
          if (e.target.closest(".like-btn")) return;
          const idx = Number(card.getAttribute("data-track-idx"));
          if (currentIndex === idx) {
            togglePlayPause();
          } else {
            playTrackAt(idx);
          }
        });
      });

      grid.querySelectorAll(".like-btn").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const id = btn.getAttribute("data-like-id");
          toggleLike(id);
        });
      });
    }

    function updatePlayerUI(track) {
      if (!track) return;
      if (playerTitle) playerTitle.textContent = track.title;
      if (playerArtist) playerArtist.textContent = track.artist;

      if (playerCover) {
        if (track.cover) {
          playerCover.innerHTML = `<img src="${escapeHTML(track.cover)}" alt="${escapeHTML(track.title)}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;display:block;" />`;
        } else {
          playerCover.innerHTML = "🎵";
        }
      }

      if (playerLikeBtn) {
        const liked = likedIds.has(track.id);
        playerLikeBtn.classList.toggle("liked", liked);
        playerLikeBtn.textContent = liked ? "❤️" : "🤍";
      }

      if (totalTimeEl) totalTimeEl.textContent = formatTime(track.duration);
      if (mainPlayBtn) mainPlayBtn.textContent = isPlaying ? "⏸" : "▶";
    }

    function toggleLike(trackId) {
      if (!trackId) return;
      if (likedIds.has(trackId)) likedIds.delete(trackId);
      else likedIds.add(trackId);
      saveLikes();
      renderGrid(tracksList);
      if (currentIndex >= 0 && tracksList[currentIndex]) {
        updatePlayerUI(tracksList[currentIndex]);
      }
    }

    async function playTrackAt(idx) {
      if (idx < 0 || idx >= tracksList.length) return;
      currentIndex = idx;
      const track = tracksList[idx];
      audio.src = track.streamUrl;
      try {
        await audio.play();
        isPlaying = true;
      } catch (err) {
        console.error("Error al reproducir:", err);
        isPlaying = false;
      }
      updatePlayerUI(track);
      renderGrid(tracksList);
    }

    function togglePlayPause() {
      if (currentIndex === -1 && tracksList.length > 0) {
        playTrackAt(0);
        return;
      }
      if (audio.paused) {
        audio.play().then(() => {
          isPlaying = true;
          if (mainPlayBtn) mainPlayBtn.textContent = "⏸";
          renderGrid(tracksList);
        }).catch(() => {});
      } else {
        audio.pause();
        isPlaying = false;
        if (mainPlayBtn) mainPlayBtn.textContent = "▶";
        renderGrid(tracksList);
      }
    }

    function playNext() {
      if (tracksList.length === 0) return;
      if (isShuffle) {
        const nextIdx = Math.floor(Math.random() * tracksList.length);
        playTrackAt(nextIdx);
      } else {
        playTrackAt((currentIndex + 1) % tracksList.length);
      }
    }

    function playPrev() {
      if (tracksList.length === 0) return;
      const prevIdx = (currentIndex - 1 + tracksList.length) % tracksList.length;
      playTrackAt(prevIdx);
    }

    async function loadTrending(genreLabel = "Todo") {
      grid.innerHTML = `<p style="color:var(--text-muted); grid-column:1/-1;">Cargando música de Audius...</p>`;
      try {
        const apiGenre = GENRE_MAP[genreLabel] !== undefined ? GENRE_MAP[genreLabel] : genreLabel;
        tracksList = await AudiusAPI.getTrending(apiGenre, 18);
        currentIndex = -1;
        renderGrid(tracksList);
      } catch (err) {
        console.error(err);
        grid.innerHTML = `<p style="color:var(--danger); grid-column:1/-1;">No se pudo conectar con Audius. Verifica tu conexión a internet.</p>`;
      }
    }

    async function runSearch(q) {
      if (!q) {
        loadTrending("Todo");
        return;
      }
      grid.innerHTML = `<p style="color:var(--text-muted); grid-column:1/-1;">Buscando "${escapeHTML(q)}" en Audius...</p>`;
      try {
        tracksList = await AudiusAPI.search(q, 18);
        currentIndex = -1;
        renderGrid(tracksList);
      } catch (err) {
        console.error(err);
        grid.innerHTML = `<p style="color:var(--danger); grid-column:1/-1;">Error al buscar canciones.</p>`;
      }
    }

    // Eventos de controles
    if (mainPlayBtn) mainPlayBtn.addEventListener("click", togglePlayPause);
    if (nextBtn) nextBtn.addEventListener("click", playNext);
    if (prevBtn) prevBtn.addEventListener("click", playPrev);
    if (heroPlayBtn) heroPlayBtn.addEventListener("click", () => playTrackAt(0));

    if (shuffleBtn) {
      shuffleBtn.addEventListener("click", () => {
        isShuffle = !isShuffle;
        shuffleBtn.style.color = isShuffle ? "var(--accent)" : "";
      });
    }

    if (repeatBtn) {
      repeatBtn.addEventListener("click", () => {
        isRepeat = !isRepeat;
        audio.loop = isRepeat;
        repeatBtn.style.color = isRepeat ? "var(--accent)" : "";
      });
    }

    if (playerLikeBtn) {
      playerLikeBtn.addEventListener("click", () => {
        if (currentIndex >= 0 && tracksList[currentIndex]) {
          toggleLike(tracksList[currentIndex].id);
        }
      });
    }

    if (volumeSlider) {
      volumeSlider.addEventListener("input", () => {
        audio.volume = Number(volumeSlider.value) / 100;
        if (muteBtn) muteBtn.textContent = audio.volume === 0 ? "🔇" : "🔊";
      });
    }

    if (muteBtn) {
      muteBtn.addEventListener("click", () => {
        audio.muted = !audio.muted;
        muteBtn.textContent = audio.muted ? "🔇" : "🔊";
      });
    }

    if (progressBar) {
      progressBar.addEventListener("click", e => {
        if (!audio.duration) return;
        const rect = progressBar.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        audio.currentTime = ratio * audio.duration;
      });
    }

    audio.addEventListener("timeupdate", () => {
      if (currentTimeEl) currentTimeEl.textContent = formatTime(audio.currentTime);
      if (audio.duration) {
        if (totalTimeEl) totalTimeEl.textContent = formatTime(audio.duration);
        if (progressFilled) progressFilled.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
      }
    });

    audio.addEventListener("ended", () => {
      if (!isRepeat) playNext();
    });

    // Filtros de género
    filterPills.forEach(pill => {
      pill.addEventListener("click", () => {
        filterPills.forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        loadTrending(pill.textContent.trim());
      });
    });

    // Buscador con debounce
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          runSearch(searchInput.value.trim());
        }, 450);
      });
    }

    // Cargar canciones iniciales
    loadTrending("Todo");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPlayerIntegration);
  } else {
    initPlayerIntegration();
    <script src="api/audius.js"></script>
  <script src="app.js"></script>
  }
})();

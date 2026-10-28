/* ComicHero — single-page app over the local reader server. */
(() => {
  "use strict";

  const app = document.getElementById("app");
  const DAY = 86400000;

  // ---------- data ----------
  const store = {
    series: [],          // summaries from /api/library
    bySlug: new Map(),
    state: { series: {}, settings: {} },
    details: new Map(),  // slug -> full detail incl. chapters
  };

  async function api(path, body) {
    const res = await fetch(path, body === undefined ? {} : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  }

  async function loadLibrary() {
    const data = await api("/api/library");
    store.series = data.series;
    store.bySlug = new Map(data.series.map((s) => [s.slug, s]));
    store.state = data.state;
  }

  async function loadDetail(slug) {
    if (!store.details.has(slug)) store.details.set(slug, await api(`/api/series/${slug}`));
    return store.details.get(slug);
  }

  const st = (slug) => store.state.series[slug] || {};

  async function patch(slug, changes) {
    const entry = await api(`/api/state/${slug}`, changes);
    store.state.series[slug] = entry;
    return entry;
  }

  async function saveSettings(changes) {
    store.state.settings = await api("/api/settings", changes);
  }

  // ---------- helpers ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtNum = (n) => (Number.isInteger(n) ? String(n) : String(n));
  const chKey = (n) => String(n);
  const coverUrl = (slug) => `/cover/${encodeURIComponent(slug)}`;
  const readHref = (slug, n) => `#/read/${encodeURIComponent(slug)}/${encodeURIComponent(chKey(n))}`;
  const seriesHref = (slug) => `#/series/${encodeURIComponent(slug)}`;
  const pageUrl = (slug, file) => `/page/${encodeURIComponent(slug)}/${file.split("/").map(encodeURIComponent).join("/")}`;

  function ago(ts) {
    if (!ts) return "";
    const d = Date.now() - ts;
    if (d < 60000) return "just now";
    if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
    if (d < DAY) return `${Math.floor(d / 3600000)}h ago`;
    if (d < 2 * DAY) return "yesterday";
    if (d < 30 * DAY) return `${Math.floor(d / DAY)} days ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  const fileSize = (bytes) =>
    bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : bytes >= 1e6 ? `${Math.round(bytes / 1e6)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;

  const icon = {
    star: '<svg viewBox="0 0 24 24"><path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z"/></svg>',
    left: '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    flame: '<svg viewBox="0 0 24 24"><path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 1-3.5S9 11 11 11c0-3 1-6 1-9z"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    trophy: '<svg viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    sort: '<svg viewBox="0 0 24 24"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  };

  function stars(rating, withNum = true) {
    if (!rating) return "";
    let out = '<span class="stars">';
    for (let i = 1; i <= 5; i++) out += icon.star.replace("<svg", `<svg class="${i <= rating ? "" : "off"}"`);
    if (withNum) out += `<span class="num">${rating}.0</span>`;
    return out + "</span>";
  }

  function readCount(slug) {
    return Object.keys(st(slug).read || {}).length;
  }

  function progressPct(s) {
    return s.chapterCount ? Math.min(100, Math.round((readCount(s.slug) / s.chapterCount) * 100)) : 0;
  }

  function status(s) {
    const n = readCount(s.slug);
    if (!n && !st(s.slug).lastRead) return "unread";
    if (n >= s.chapterCount) return "completed";
    return "reading";
  }

  // deterministic daily shuffle so the hero and pick stay stable for a day
  function dailyShuffle(arr) {
    let seed = Math.floor(Date.now() / DAY);
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function coverImg(slug, alt = "", eager = false) {
    return `<img src="${coverUrl(slug)}" alt="${esc(alt)}" ${eager ? "" : 'loading="lazy"'} decoding="async" onload="this.classList.add('loaded')">`;
  }

  function card(s) {
    const state = st(s.slug);
    const pct = progressPct(s);
    const stat = status(s);
    const isNew = Date.now() - s.added * 1000 < 14 * DAY;
    let badge = "";
    if (stat === "completed") badge = '<span class="badge done">Finished</span>';
    else if (isNew && stat === "unread") badge = '<span class="badge new">New</span>';
    const sub = state.lastChapter !== undefined && stat !== "completed"
      ? `Ch ${fmtNum(state.lastChapter)} / ${fmtNum(s.lastChapter)}`
      : `Chapter ${fmtNum(s.lastChapter)}`;
    return `
      <a class="card" href="${seriesHref(s.slug)}">
        <div class="cover">
          ${badge}
          ${state.bookmarked ? `<span class="mark" title="Bookmarked">${icon.bookmark}</span>` : ""}
          ${coverImg(s.slug, s.title)}
          ${pct > 0 && pct < 100 ? `<div class="progress"><i style="width:${pct}%"></i></div>` : ""}
        </div>
        <div class="card-title">${esc(s.title)}</div>
        <div class="card-sub">${sub}</div>
        ${stars(state.rating)}
      </a>`;
  }

  function panelHead(ic, title, extra = "") {
    return `<div class="panel-head"><span class="panel-icon">${ic}</span><h2>${title}</h2><span class="spacer"></span>${extra}</div>`;
  }

  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (el.hidden = true), 1800);
  }

  // ---------- views ----------
  let cleanup = null;

  function viewHome() {
    const all = store.series;
    const reading = all
      .filter((s) => st(s.slug).lastRead && status(s) !== "completed")
      .sort((a, b) => st(b.slug).lastRead - st(a.slug).lastRead);
    const bookmarked = all.filter((s) => st(s.slug).bookmarked);
    const heroPool = dailyShuffle(all).slice(0, 11);
    const recent = all.slice().sort((a, b) => b.added - a.added).slice(0, 10);
    const pick = dailyShuffle(all.filter((s) => status(s) === "unread"))[0] || dailyShuffle(all)[0];
    const totalCh = all.reduce((n, s) => n + s.chapterCount, 0);
    const totalRead = all.reduce((n, s) => n + readCount(s.slug), 0);
    const shelfList = (bookmarked.length ? bookmarked : dailyShuffle(all)).slice(0, 12);

    app.innerHTML = `
      <section class="hero" id="hero">
        <div class="hero-bg" id="heroBg"></div>
        <div class="hero-track" id="heroTrack">
          ${heroPool.map((s, i) => `
            <div class="hero-card" data-i="${i}" data-slug="${esc(s.slug)}">
              <span class="hero-badge">${s.chapterCount} ch</span>
              ${coverImg(s.slug, s.title, true)}
              <div class="hero-label">${esc(s.title)}</div>
            </div>`).join("")}
        </div>
        <button class="hero-nav prev" data-dir="-1" aria-label="Previous">${icon.left}</button>
        <button class="hero-nav next" data-dir="1" aria-label="Next">${icon.right}</button>
      </section>

      <div class="wrap">
        <div class="home-grid">
          <div class="stack">
            <section class="panel">
              ${panelHead(icon.clock, "Continue Reading", reading.length ? `<a class="pill" href="#/history">History</a>` : "")}
              ${reading.length ? `<div class="continue">${reading.slice(0, 6).map(continueItem).join("")}</div>`
                : `<div class="empty">Nothing in progress yet. Pick a series below and your place will be saved here.</div>`}
            </section>

            <section class="panel">
              ${panelHead(icon.bookmark, bookmarked.length ? "Your Bookmarks" : "From Your Shelf", `<a class="pill" href="#/library">All Comics</a>`)}
              <div class="row-scroll">${shelfList.map(card).join("")}</div>
            </section>

            <section class="panel">
              ${panelHead(icon.flame, "Recently Added", `<a class="pill" href="#/library?sort=added">View all</a>`)}
              <div class="updates">${recent.map(updateItem).join("")}</div>
            </section>
          </div>

          <aside class="stack">
            <section class="panel">
              ${panelHead(icon.trophy, "Top", `<div class="seg" id="rankSeg">
                <button data-k="chapters" class="on">Longest</button>
                <button data-k="rated">Rated</button>
                <button data-k="recent">Recent</button></div>`)}
              <ol class="ranked" id="ranked"></ol>
            </section>

            ${pick ? `
            <a class="pick" href="${seriesHref(pick.slug)}">
              ${coverImg(pick.slug, pick.title)}
              <div class="pick-body">
                <div class="eyebrow">Pick of the day</div>
                <h3>${esc(pick.title)}</h3>
                <p>${pick.chapterCount} chapters waiting · ${status(pick) === "unread" ? "you haven't started this one" : "jump back in"}</p>
              </div>
            </a>` : ""}

            <section class="panel">
              ${panelHead(icon.sparkle, "Your Shelf")}
              <div class="stats">
                <div class="stat"><b>${all.length}</b><span>series</span></div>
                <div class="stat"><b>${totalCh.toLocaleString()}</b><span>chapters</span></div>
                <div class="stat"><b>${totalRead.toLocaleString()}</b><span>chapters read</span></div>
                <div class="stat"><b>${all.filter((s) => status(s) === "completed").length}</b><span>finished</span></div>
              </div>
            </section>
          </aside>
        </div>
      </div>`;

    app.querySelectorAll(".pick img, .update img, .ranked img").forEach((i) => i.classList.add("loaded"));
    renderRanked("chapters");
    document.getElementById("rankSeg").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      document.querySelectorAll("#rankSeg button").forEach((x) => x.classList.toggle("on", x === b));
      renderRanked(b.dataset.k);
    });
    cleanup = setupHero(heroPool);
  }

  function continueItem(s) {
    const state = st(s.slug);
    const pct = progressPct(s);
    return `
      <a class="continue-item" href="${readHref(s.slug, state.lastChapter)}">
        <div class="cover">${coverImg(s.slug, s.title)}</div>
        <div>
          <h3>${esc(s.title)}</h3>
          <div class="meta">Chapter ${fmtNum(state.lastChapter)} of ${fmtNum(s.lastChapter)} · ${ago(state.lastRead)}</div>
          <div class="bar"><i style="width:${Math.max(pct, 2)}%"></i></div>
          <div class="resume">${icon.play} Resume</div>
        </div>
      </a>`;
  }

  function updateItem(s) {
    const read = st(s.slug).read || {};
    const latest = s.latest;
    return `
      <div class="update">
        <a class="cover" href="${seriesHref(s.slug)}">${coverImg(s.slug, s.title)}</a>
        <div style="min-width:0">
          <h3><a href="${seriesHref(s.slug)}">${esc(s.title)}</a></h3>
          <ul>${latest.map((n, i) => `
            <li class="${read[chKey(n)] ? "read" : ""}"><a href="${readHref(s.slug, n)}">
              <span>Chapter ${fmtNum(n)}</span><span>${i === 0 ? ago(s.added * 1000) : ""}</span></a></li>`).join("")}
          </ul>
        </div>
      </div>`;
  }

  function renderRanked(kind) {
    let list = store.series.slice();
    let sub;
    if (kind === "chapters") {
      list.sort((a, b) => b.chapterCount - a.chapterCount);
      sub = (s) => `<b>${s.chapterCount}</b> chapters · ${s.pageCount.toLocaleString()} pages`;
    } else if (kind === "rated") {
      list = list.filter((s) => st(s.slug).rating).sort((a, b) => st(b.slug).rating - st(a.slug).rating || a.title.localeCompare(b.title));
      sub = (s) => stars(st(s.slug).rating);
    } else {
      list = list.filter((s) => st(s.slug).lastRead).sort((a, b) => st(b.slug).lastRead - st(a.slug).lastRead);
      sub = (s) => `Chapter <b>${fmtNum(st(s.slug).lastChapter)}</b> · ${ago(st(s.slug).lastRead)}`;
    }
    const el = document.getElementById("ranked");
    if (!list.length) {
      el.innerHTML = `<li class="empty">${kind === "rated" ? "Rate a series from its page to rank it here." : "Series you read will show up here."}</li>`;
      return;
    }
    el.innerHTML = list.slice(0, 8).map((s, i) => `
      <li><a href="${seriesHref(s.slug)}">
        <span class="rank">${i + 1}</span>
        <div class="cover">${coverImg(s.slug, s.title)}</div>
        <div><h3>${esc(s.title)}</h3><div class="sub">${sub(s)}</div></div>
      </a></li>`).join("");
    el.querySelectorAll("img").forEach((i) => i.classList.add("loaded"));
  }

  function setupHero(pool) {
    const cards = [...document.querySelectorAll(".hero-card")];
    const bg = document.getElementById("heroBg");
    if (!cards.length) return null;
    let cur = Math.floor(pool.length / 2);
    const n = cards.length;

    const scaleOf = (abs) => (abs === 0 ? 1.18 : 1 - Math.min(abs, 4) * 0.06);

    function layout() {
      const w = cards[0].offsetWidth;
      const gap = window.innerWidth < 720 ? 10 : 16;
      // centre-to-centre distance for each offset, so scaled cards sit side by side without overlapping
      const dist = [0];
      for (let k = 1; k <= n; k++) dist[k] = dist[k - 1] + (w * scaleOf(k - 1)) / 2 + gap + (w * scaleOf(k)) / 2;
      cards.forEach((c, i) => {
        let off = i - cur;
        if (off > n / 2) off -= n;
        if (off < -n / 2) off += n;
        const abs = Math.abs(off);
        const scale = scaleOf(abs);
        c.style.transform = `translate(calc(-50% + ${Math.sign(off) * dist[abs]}px), -50%) scale(${scale})`;
        c.style.zIndex = String(20 - abs);
        c.style.opacity = abs > 4 ? "0" : String(1 - abs * 0.12);
        c.style.filter = off === 0 ? "none" : `brightness(${1 - abs * 0.12})`;
        c.classList.toggle("center", off === 0);
      });
      bg.style.backgroundImage = `url(${coverUrl(pool[cur].slug)})`;
    }

    const go = (d) => { cur = (cur + d + n) % n; layout(); };
    document.querySelectorAll(".hero-nav").forEach((b) => b.addEventListener("click", () => { go(+b.dataset.dir); restart(); }));
    cards.forEach((c) => c.addEventListener("click", () => {
      const i = +c.dataset.i;
      if (i === cur) location.hash = seriesHref(c.dataset.slug);
      else { cur = i; layout(); restart(); }
    }));
    let timer;
    const restart = () => { clearInterval(timer); timer = setInterval(() => go(1), 5000); };
    // swipe on touch screens, where the arrows are hidden
    const hero = document.getElementById("hero");
    let touchX = null;
    hero.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    hero.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - touchX;
      if (touchX !== null && Math.abs(dx) > 40) { go(dx < 0 ? 1 : -1); restart(); }
      touchX = null;
    });
    window.addEventListener("resize", layout);
    layout();
    restart();
    return () => { clearInterval(timer); window.removeEventListener("resize", layout); };
  }

  // library ------------------------------------------------------------
  const SORTS = {
    title: ["Title A–Z", (a, b) => a.title.localeCompare(b.title)],
    "title-desc": ["Title Z–A", (a, b) => b.title.localeCompare(a.title)],
    chapters: ["Most chapters", (a, b) => b.chapterCount - a.chapterCount],
    added: ["Recently added", (a, b) => b.added - a.added],
    read: ["Recently read", (a, b) => (st(b.slug).lastRead || 0) - (st(a.slug).lastRead || 0)],
    rating: ["Your rating", (a, b) => (st(b.slug).rating || 0) - (st(a.slug).rating || 0)],
    progress: ["Progress", (a, b) => progressPct(b) - progressPct(a)],
  };
  const FILTERS = {
    all: ["All", () => true],
    reading: ["Reading", (s) => status(s) === "reading"],
    unread: ["Not started", (s) => status(s) === "unread"],
    completed: ["Finished", (s) => status(s) === "completed"],
    bookmarked: ["Bookmarked", (s) => st(s.slug).bookmarked],
    rated: ["Rated", (s) => st(s.slug).rating],
  };
  const LENGTHS = {
    any: ["Any length", () => true],
    short: ["Under 120 ch", (s) => s.chapterCount < 120],
    mid: ["120–200 ch", (s) => s.chapterCount >= 120 && s.chapterCount <= 200],
    long: ["200+ ch", (s) => s.chapterCount > 200],
  };

  function viewLibrary(params) {
    const q = params.get("q") || "";
    const sort = SORTS[params.get("sort")] ? params.get("sort") : "title";
    const filter = FILTERS[params.get("filter")] ? params.get("filter") : "all";
    const len = LENGTHS[params.get("len")] ? params.get("len") : "any";

    app.innerHTML = `
      <div class="wrap">
        <div class="page-title">
          <div>
            <h1>${filter === "bookmarked" ? "Bookmarks" : "Library"}</h1>
            <p>${store.series.length} series read straight from your comics folder</p>
          </div>
        </div>
        <div class="toolbar">
          <label class="field">${icon.search}<input id="q" type="search" placeholder="Filter by title…" value="${esc(q)}"></label>
          <select class="select" id="len">${Object.entries(LENGTHS).map(([k, [l]]) => `<option value="${k}" ${k === len ? "selected" : ""}>${l}</option>`).join("")}</select>
          <select class="select" id="sort">${Object.entries(SORTS).map(([k, [l]]) => `<option value="${k}" ${k === sort ? "selected" : ""}>${l}</option>`).join("")}</select>
          <div class="chips" id="filters">${Object.entries(FILTERS).map(([k, [l, fn]]) => `
            <button class="chip ${k === filter ? "on" : ""}" data-k="${k}">${l}<span class="count">${store.series.filter(fn).length}</span></button>`).join("")}
          </div>
        </div>
        <div class="result-count" id="count"></div>
        <div class="grid" id="grid"></div>
        <div style="height:60px"></div>
      </div>`;

    const state = { q, sort, filter, len };
    const render = () => {
      const needle = state.q.trim().toLowerCase();
      const list = store.series
        .filter(FILTERS[state.filter][1])
        .filter(LENGTHS[state.len][1])
        .filter((s) => !needle || s.title.toLowerCase().includes(needle) || s.slug.includes(needle))
        .sort(SORTS[state.sort][1]);
      document.getElementById("grid").innerHTML = list.length ? list.map(card).join("")
        : `<div class="empty" style="grid-column:1/-1">No series match these filters.</div>`;
      document.getElementById("count").textContent = `Showing ${list.length} of ${store.series.length}`;
      const p = new URLSearchParams();
      if (state.q) p.set("q", state.q);
      if (state.sort !== "title") p.set("sort", state.sort);
      if (state.filter !== "all") p.set("filter", state.filter);
      if (state.len !== "any") p.set("len", state.len);
      const hash = `#/library${p.toString() ? "?" + p : ""}`;
      if (location.hash !== hash) history.replaceState(null, "", hash);
      setNav();
    };
    document.getElementById("q").addEventListener("input", (e) => { state.q = e.target.value; render(); });
    document.getElementById("sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
    document.getElementById("len").addEventListener("change", (e) => { state.len = e.target.value; render(); });
    document.getElementById("filters").addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      state.filter = b.dataset.k;
      document.querySelectorAll("#filters .chip").forEach((c) => c.classList.toggle("on", c === b));
      document.querySelector(".page-title h1").textContent = state.filter === "bookmarked" ? "Bookmarks" : "Library";
      render();
    });
    render();
  }

  // series -------------------------------------------------------------
  async function viewSeries(slug) {
    const s = store.bySlug.get(slug);
    if (!s) return viewMissing();
    app.innerHTML = `<div class="wrap" style="padding-top:40px"><div class="skeleton" style="height:340px"></div></div>`;
    const d = await loadDetail(slug);
    let desc = store.state.settings.chapterOrder !== "asc";
    let query = "";

    const draw = () => {
      const state = st(slug);
      const read = state.read || {};
      const nRead = Object.keys(read).length;
      const pct = progressPct(s);
      const first = d.chapters[0];
      const last = d.chapters[d.chapters.length - 1];
      const resume = state.lastChapter !== undefined ? state.lastChapter : null;
      const nextUnread = d.chapters.find((c) => !read[chKey(c.number)]);

      app.innerHTML = `
        <section class="series-hero">
          <div class="bg" style="background-image:url(${coverUrl(slug)})"></div>
          <div class="wrap">
            <div class="series-head">
              <div class="cover">${coverImg(slug, s.title, true)}</div>
              <div>
                <div class="crumbs"><a href="#/">Home</a>${icon.right}<a href="#/library">Library</a>${icon.right}<span>${esc(s.title)}</span></div>
                <h1>${esc(s.title)}</h1>
                <div class="tags">
                  <span class="tag accent">${d.chapters.length} chapters</span>
                  <span class="tag">Ch ${fmtNum(first.number)}–${fmtNum(last.number)}</span>
                  <span class="tag">${s.pageCount.toLocaleString()} pages</span>
                  <span class="tag">${fileSize(s.size)}</span>
                  <span class="tag">Added ${ago(s.added * 1000)}</span>
                  ${status(s) === "completed" ? '<span class="tag green">Finished</span>' : ""}
                </div>
                <div class="actions">
                  ${resume !== null
                    ? `<a class="btn btn-primary" href="${readHref(slug, resume)}">${icon.play} Continue Ch ${fmtNum(resume)}</a>`
                    : `<a class="btn btn-primary" href="${readHref(slug, first.number)}">${icon.play} Start reading</a>`}
                  ${resume !== null && nextUnread && nextUnread.number !== resume
                    ? `<a class="btn btn-ghost" href="${readHref(slug, nextUnread.number)}">Next unread · Ch ${fmtNum(nextUnread.number)}</a>` : ""}
                  <a class="btn btn-ghost" href="${readHref(slug, last.number)}">Latest · Ch ${fmtNum(last.number)}</a>
                  <button class="btn btn-ghost ${state.bookmarked ? "on" : ""}" id="bm">${icon.bookmark}${state.bookmarked ? "Bookmarked" : "Bookmark"}</button>
                </div>
                <div class="rate">
                  <span>Your rating</span>
                  <span class="rate-stars" id="rate">${[1, 2, 3, 4, 5].map((i) => `<button data-v="${i}" class="${i <= (state.rating || 0) ? "on" : ""}" aria-label="${i} stars">${icon.star}</button>`).join("")}</span>
                  ${state.rating ? `<button class="btn btn-sm btn-ghost" id="unrate">Clear</button>` : ""}
                </div>
                <div class="read-progress">
                  <div class="label"><span><b>${nRead}</b> of ${d.chapters.length} chapters read</span><span>${pct}%</span></div>
                  <div class="bar"><i style="width:${pct}%"></i></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div class="wrap">
          <div class="series-body">
            <section class="panel">
              ${panelHead(icon.list, "Chapters", `<span class="card-sub">${d.chapters.length} total</span>`)}
              <div class="chapter-tools">
                <label class="field">${icon.search}<input id="chq" type="search" inputmode="decimal" placeholder="Jump to chapter…" value="${esc(query)}"></label>
                <button class="btn btn-ghost" id="order">${icon.sort}${desc ? "Newest first" : "Oldest first"}</button>
                <button class="btn btn-ghost" id="markUpTo" ${resume === null ? "disabled" : ""} title="Mark every chapter before your current one as read">${icon.check}Mark read up to Ch ${resume !== null ? fmtNum(resume) : "–"}</button>
              </div>
              <div class="chapters" id="chapters"></div>
            </section>

            <aside class="stack">
              <section class="panel">
                ${panelHead(icon.sparkle, "More from your shelf")}
                <ol class="ranked">${dailyShuffle(store.series.filter((x) => x.slug !== slug)).slice(0, 5).map((x) => `
                  <li><a href="${seriesHref(x.slug)}"><div class="cover">${coverImg(x.slug, x.title)}</div>
                  <div><h3>${esc(x.title)}</h3><div class="sub"><b>${x.chapterCount}</b> chapters</div></div></a></li>`).join("")}
                </ol>
              </section>
              ${nRead ? `<button class="btn btn-ghost" id="reset">${icon.trash}Reset reading progress</button>` : ""}
            </aside>
          </div>
        </div>`;

      app.querySelectorAll(".ranked img").forEach((i) => i.classList.add("loaded"));
      drawChapters();

      document.getElementById("bm").onclick = async () => {
        await patch(slug, { bookmarked: state.bookmarked ? null : true });
        toast(st(slug).bookmarked ? "Added to bookmarks" : "Removed from bookmarks");
        draw();
      };
      document.getElementById("rate").onclick = async (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        await patch(slug, { rating: +b.dataset.v });
        toast(`Rated ${b.dataset.v} / 5`);
        draw();
      };
      const unrate = document.getElementById("unrate");
      if (unrate) unrate.onclick = async () => { await patch(slug, { rating: null }); draw(); };
      document.getElementById("order").onclick = () => {
        desc = !desc;
        saveSettings({ chapterOrder: desc ? "desc" : "asc" });
        draw();
      };
      document.getElementById("chq").oninput = (e) => { query = e.target.value; drawChapters(); };
      document.getElementById("markUpTo").onclick = async () => {
        const changes = {};
        d.chapters.forEach((c) => { if (c.number < resume && !read[chKey(c.number)]) changes[chKey(c.number)] = Date.now(); });
        await patch(slug, { read: changes });
        toast(`Marked ${Object.keys(changes).length} chapters read`);
        draw();
      };
      const reset = document.getElementById("reset");
      if (reset) reset.onclick = async () => {
        if (!confirm(`Reset all reading progress for ${s.title}?`)) return;
        const clear = {};
        Object.keys(read).forEach((k) => (clear[k] = null));
        await patch(slug, { read: clear, lastChapter: null, lastPage: null, lastRead: null });
        toast("Progress reset");
        draw();
      };
    };

    const drawChapters = () => {
      const state = st(slug);
      const read = state.read || {};
      let list = d.chapters.slice();
      if (desc) list.reverse();
      const qq = query.trim();
      if (qq) list = list.filter((c) => chKey(c.number).startsWith(qq) || c.title.toLowerCase().includes(qq.toLowerCase()));
      const el = document.getElementById("chapters");
      el.innerHTML = list.length ? list.map((c) => {
        const k = chKey(c.number);
        const cls = [read[k] ? "read" : "", state.lastChapter === c.number ? "current" : ""].join(" ");
        return `
          <a class="chapter ${cls}" href="${readHref(slug, c.number)}">
            <div class="info">
              <div class="num">${esc(c.title)}</div>
              <div class="sub">${state.lastChapter === c.number ? "Reading now" : read[k] ? `Read ${ago(read[k])}` : `${c.pages.length} pages`}</div>
            </div>
            <button class="tick" data-k="${esc(k)}" title="${read[k] ? "Mark unread" : "Mark read"}">${icon.check}</button>
          </a>`;
      }).join("") : `<div class="empty" style="grid-column:1/-1">No chapter matches “${esc(qq)}”.</div>`;
      el.onclick = async (e) => {
        const t = e.target.closest(".tick");
        if (!t) return;
        e.preventDefault();
        const k = t.dataset.k;
        await patch(slug, { read: { [k]: read[k] ? null : Date.now() } });
        draw();
      };
    };

    draw();
  }

  // reader -------------------------------------------------------------
  async function viewReader(slug, num) {
    const s = store.bySlug.get(slug);
    if (!s) return viewMissing();
    const d = await loadDetail(slug);
    const idx = d.chapters.findIndex((c) => chKey(c.number) === num);
    if (idx < 0) return viewMissing();
    const ch = d.chapters[idx];
    const prev = d.chapters[idx - 1];
    const next = d.chapters[idx + 1];
    const settings = store.state.settings;
    const width = settings.readerWidth || "720";
    const gap = !!settings.readerGap;
    document.body.classList.add("reading");

    app.innerHTML = `
      <div class="reader-bar" id="rbar">
        <div class="reader-bar-inner">
          <a class="btn btn-ghost icon-btn" href="${seriesHref(slug)}" title="Back to series">${icon.left}</a>
          <div class="reader-title">
            <a href="${seriesHref(slug)}">${esc(s.title)}</a>
            <span id="pageInfo">${esc(ch.title)} · ${ch.pages.length} pages</span>
          </div>
          <a class="btn btn-ghost icon-btn" ${prev ? `href="${readHref(slug, prev.number)}"` : "disabled"} title="Previous chapter (←)">${icon.left}</a>
          <select class="select" id="chSel">${d.chapters.map((c) => `<option value="${esc(chKey(c.number))}" ${c === ch ? "selected" : ""}>${esc(c.title)}</option>`).join("")}</select>
          <a class="btn btn-ghost icon-btn" ${next ? `href="${readHref(slug, next.number)}"` : "disabled"} title="Next chapter (→)">${icon.right}</a>
          <button class="btn btn-ghost icon-btn" id="gear" title="Reader settings">${icon.gear}</button>
        </div>
        <div class="reader-progress" id="rprog"></div>
        <div class="settings-pop" id="pop" hidden>
          <label>Page width
            <div class="seg" id="wSeg">${[["600", "Narrow"], ["720", "Normal"], ["900", "Wide"], ["full", "Fit"]].map(([v, l]) => `<button data-v="${v}" class="${v === width ? "on" : ""}">${l}</button>`).join("")}</div>
          </label>
          <label>Page gap
            <div class="seg" id="gSeg"><button data-v="0" class="${gap ? "" : "on"}">None</button><button data-v="1" class="${gap ? "on" : ""}">Small</button></div>
          </label>
          <div class="card-sub">Keys: ← → change chapter · B bookmark · Esc back</div>
        </div>
      </div>
      <div class="pages ${gap ? "gap" : ""}" id="pages" style="max-width:${width === "full" ? "100%" : width + "px"}">
        ${ch.pages.map((p, i) => `<img data-i="${i}" src="${pageUrl(slug, p.file)}" width="${p.w || 720}" height="${p.h || 1000}" loading="${i < 3 ? "eager" : "lazy"}" decoding="async" alt="Page ${i + 1}">`).join("")}
      </div>
      <div class="reader-end">
        <h2>End of ${esc(ch.title)}</h2>
        <p>${next ? `Up next: ${esc(next.title)}` : "You've reached the latest chapter in this archive."}</p>
        <div class="actions">
          ${prev ? `<a class="btn btn-ghost" href="${readHref(slug, prev.number)}">${icon.left} Previous</a>` : ""}
          <a class="btn btn-ghost" href="${seriesHref(slug)}">${icon.list} All chapters</a>
          ${next ? `<a class="btn btn-primary" href="${readHref(slug, next.number)}">Next chapter ${icon.right}</a>` : ""}
        </div>
      </div>`;

    // restore position when resuming the same chapter
    const state = st(slug);
    const imgs = [...document.querySelectorAll("#pages img")];
    if (state.lastChapter === ch.number && state.lastPage > 0 && imgs[state.lastPage]) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: imgs[state.lastPage].offsetTop - 60, behavior: "instant" });
      });
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
    }

    patch(slug, { lastChapter: ch.number, lastRead: Date.now(), lastPage: state.lastChapter === ch.number ? state.lastPage || 0 : 0 });

    // prefetch the first pages of the next chapter
    if (next) next.pages.slice(0, 2).forEach((p) => { new Image().src = pageUrl(slug, p.file); });

    const bar = document.getElementById("rbar");
    const prog = document.getElementById("rprog");
    const info = document.getElementById("pageInfo");
    let lastY = window.scrollY, page = 0, marked = !!(state.read || {})[num], saveT;
    const onScroll = () => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      prog.style.width = `${max > 0 ? (y / max) * 100 : 100}%`;
      if (document.getElementById("pop").hidden) bar.classList.toggle("hidden", y > lastY && y > 120);
      lastY = y;
      const mid = y + window.innerHeight / 2;
      let p = 0;
      for (let i = 0; i < imgs.length; i++) { if (imgs[i].offsetTop <= mid) p = i; else break; }
      if (p !== page) {
        page = p;
        info.textContent = `${ch.title} · page ${p + 1} of ${imgs.length}`;
        clearTimeout(saveT);
        saveT = setTimeout(() => patch(slug, { lastPage: page, lastRead: Date.now() }), 600);
      }
      const last = imgs[imgs.length - 1];
      if (!marked && last && y + window.innerHeight >= last.offsetTop + last.offsetHeight * 0.6) {
        marked = true;
        patch(slug, { read: { [num]: Date.now() } }).then(() => toast(`${ch.title} marked as read`));
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const go = (c) => c && (location.hash = readHref(slug, c.number));
    const onKey = (e) => {
      if (e.target.closest("input, select, textarea") || e.metaKey || e.ctrlKey) return;
      if (e.key === "ArrowLeft") go(prev);
      else if (e.key === "ArrowRight") go(next);
      else if (e.key === "Escape") location.hash = seriesHref(slug);
      else if (e.key.toLowerCase() === "b") {
        patch(slug, { bookmarked: st(slug).bookmarked ? null : true }).then(() => toast(st(slug).bookmarked ? "Bookmarked" : "Bookmark removed"));
      }
    };
    window.addEventListener("keydown", onKey);

    document.getElementById("chSel").onchange = (e) => (location.hash = readHref(slug, e.target.value));
    const pop = document.getElementById("pop");
    document.getElementById("gear").onclick = () => { pop.hidden = !pop.hidden; bar.classList.remove("hidden"); };
    document.getElementById("wSeg").onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      document.querySelectorAll("#wSeg button").forEach((x) => x.classList.toggle("on", x === b));
      document.getElementById("pages").style.maxWidth = b.dataset.v === "full" ? "100%" : b.dataset.v + "px";
      saveSettings({ readerWidth: b.dataset.v });
    };
    document.getElementById("gSeg").onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      document.querySelectorAll("#gSeg button").forEach((x) => x.classList.toggle("on", x === b));
      document.getElementById("pages").classList.toggle("gap", b.dataset.v === "1");
      saveSettings({ readerGap: b.dataset.v === "1" });
    };

    cleanup = () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
      clearTimeout(saveT);
      document.body.classList.remove("reading");
    };
  }

  // history ------------------------------------------------------------
  function viewHistory() {
    const items = store.series
      .filter((s) => st(s.slug).lastRead)
      .sort((a, b) => st(b.slug).lastRead - st(a.slug).lastRead);
    const dayLabel = (ts) => {
      const d = new Date(ts); d.setHours(0, 0, 0, 0);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const diff = Math.round((today - d) / DAY);
      if (diff === 0) return "Today";
      if (diff === 1) return "Yesterday";
      if (diff < 7) return "This week";
      return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    };
    let lastLabel = "";
    app.innerHTML = `
      <div class="wrap">
        <div class="page-title"><div><h1>History</h1><p>Where you left off in every series you've opened</p></div></div>
        <div class="history-list">
          ${items.length ? items.map((s) => {
            const state = st(s.slug);
            const label = dayLabel(state.lastRead);
            const head = label !== lastLabel ? `<div class="history-day">${label}</div>` : "";
            lastLabel = label;
            return `${head}
              <a class="history-item" href="${readHref(s.slug, state.lastChapter)}">
                <div class="cover">${coverImg(s.slug, s.title)}</div>
                <div>
                  <h3>${esc(s.title)}</h3>
                  <div class="sub">Chapter ${fmtNum(state.lastChapter)}${state.lastPage ? `, page ${state.lastPage + 1}` : ""} · ${readCount(s.slug)} of ${s.chapterCount} read · ${ago(state.lastRead)}</div>
                </div>
                <span class="btn btn-primary btn-sm">${icon.play} Resume</span>
              </a>`;
          }).join("") : `<div class="empty">You haven't opened any chapters yet.</div>`}
        </div>
        <div style="height:60px"></div>
      </div>`;
    app.querySelectorAll("img").forEach((i) => i.classList.add("loaded"));
  }

  function viewMissing() {
    app.innerHTML = `<div class="wrap"><div class="page-title"><div><h1>Not found</h1><p>That series or chapter isn't in your library.</p></div></div><a class="btn btn-primary" href="#/library">Go to library</a></div>`;
  }

  // ---------- search palette ----------
  const palette = document.getElementById("palette");
  const pInput = document.getElementById("paletteInput");
  const pResults = document.getElementById("paletteResults");
  let pSel = 0;

  function openPalette() {
    palette.hidden = false;
    pInput.value = "";
    renderPalette();
    pInput.focus();
  }
  function closePalette() { palette.hidden = true; }
  function paletteMatches() {
    const q = pInput.value.trim().toLowerCase();
    const list = q
      ? store.series.filter((s) => s.title.toLowerCase().includes(q)).sort((a, b) => a.title.toLowerCase().indexOf(q) - b.title.toLowerCase().indexOf(q))
      : store.series.slice().sort((a, b) => (st(b.slug).lastRead || 0) - (st(a.slug).lastRead || 0) || a.title.localeCompare(b.title));
    return list.slice(0, 8);
  }
  function renderPalette() {
    const list = paletteMatches();
    pSel = Math.min(pSel, Math.max(list.length - 1, 0));
    pResults.innerHTML = list.length ? list.map((s, i) => `
      <li class="${i === pSel ? "sel" : ""}"><a href="${seriesHref(s.slug)}">
        <div class="cover">${coverImg(s.slug, s.title, true)}</div>
        <div><div class="t">${esc(s.title)}</div><div class="s">${s.chapterCount} chapters${st(s.slug).lastChapter !== undefined ? ` · on ch ${fmtNum(st(s.slug).lastChapter)}` : ""}</div></div>
        <span class="go">↵</span></a></li>`).join("") : `<li class="none">No series found</li>`;
  }
  pInput.addEventListener("input", () => { pSel = 0; renderPalette(); });
  pInput.addEventListener("keydown", (e) => {
    const n = paletteMatches().length;
    if (e.key === "ArrowDown") { pSel = (pSel + 1) % Math.max(n, 1); renderPalette(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { pSel = (pSel - 1 + n) % Math.max(n, 1); renderPalette(); e.preventDefault(); }
    else if (e.key === "Enter") { const s = paletteMatches()[pSel]; if (s) { location.hash = seriesHref(s.slug); closePalette(); } }
    else if (e.key === "Escape") closePalette();
  });
  palette.addEventListener("click", (e) => { if (e.target.closest("[data-close], a")) closePalette(); });
  document.getElementById("searchTrigger").addEventListener("click", openPalette);
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); palette.hidden ? openPalette() : closePalette(); }
    else if (e.key === "/" && palette.hidden && !e.target.closest("input, textarea, select")) { e.preventDefault(); openPalette(); }
  });

  // ---------- chrome ----------
  const toTop = document.getElementById("toTop");
  const topbar = document.getElementById("topbar");
  let lastScroll = 0;
  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    toTop.classList.toggle("show", y > 800);
    topbar.classList.toggle("hidden", y > lastScroll && y > 200);
    lastScroll = y;
  }, { passive: true });
  toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  function setNav() {
    const h = location.hash;
    const key = h.startsWith("#/library") ? (h.includes("filter=bookmarked") ? "bookmarks" : "library")
      : h.startsWith("#/history") ? "history" : h === "" || h === "#/" ? "home" : "";
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === key));
  }

  // ---------- router ----------
  async function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    topbar.classList.remove("hidden");
    const raw = location.hash.replace(/^#\/?/, "");
    const [pathPart, queryPart = ""] = raw.split("?");
    const parts = pathPart.split("/").filter(Boolean).map(decodeURIComponent);
    const params = new URLSearchParams(queryPart);
    setNav();
    try {
      if (!parts.length) { viewHome(); window.scrollTo({ top: 0, behavior: "instant" }); }
      else if (parts[0] === "library") { viewLibrary(params); window.scrollTo({ top: 0, behavior: "instant" }); }
      else if (parts[0] === "history") { viewHistory(); window.scrollTo({ top: 0, behavior: "instant" }); }
      else if (parts[0] === "series" && parts[1]) { await viewSeries(parts[1]); window.scrollTo({ top: 0, behavior: "instant" }); }
      else if (parts[0] === "read" && parts[2]) await viewReader(parts[1], parts[2]);
      else viewMissing();
    } catch (err) {
      console.error(err);
      app.innerHTML = `<div class="wrap"><div class="page-title"><div><h1>Something went wrong</h1><p>${esc(err.message)}</p></div></div></div>`;
    }
    document.title = (() => {
      if (parts[0] === "series" && store.bySlug.get(parts[1])) return `${store.bySlug.get(parts[1]).title} · ComicHero`;
      if (parts[0] === "read" && store.bySlug.get(parts[1])) return `${store.bySlug.get(parts[1]).title} Ch ${parts[2]} · ComicHero`;
      return "ComicHero";
    })();
  }

  window.addEventListener("hashchange", route);
  loadLibrary().then(route).catch((err) => {
    app.innerHTML = `<div class="wrap"><div class="page-title"><div><h1>Can't reach the reader server</h1><p>Start it with <code>python3 server.py</code> and reload. (${esc(err.message)})</p></div></div></div>`;
  });
})();

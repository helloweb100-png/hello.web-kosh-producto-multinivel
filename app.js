/* ==========================================================================
   KOSH | Landing premium
   JavaScript nativo, sin dependencias.

   Cuidado del rendimiento (diseñado para no saturar el CPU):
   - UN solo motor de scroll. Escucha scroll en modo pasivo y solo pide frames
     cuando hay algo que mover; si todo está quieto, no hay bucle corriendo.
   - Los efectos con scroll solo se calculan mientras su sección es visible.
   - Partículas: tope de 30 fps, pausadas fuera del héroe y con la pestaña oculta.
   - Animaciones CSS continuas se pausan fuera de pantalla ([data-pause]).
   - Modo "lite" automático en equipos de pocos núcleos / poca RAM / ahorro de datos.
   - Respeta prefers-reduced-motion: sin pin, sin scrub, sin partículas.

   CAMBIA AQUÍ el WhatsApp del distribuidor (un solo lugar):
   ========================================================================== */
(() => {
  'use strict';
  window.__kosh = true;

  const CONFIG = {
    phone: '527442617599',   // WhatsApp con lada país, sin + ni espacios
    minLoaderMs: 1800        // tiempo mínimo de la pantalla de carga
  };

  /* ---------- Utilidades ---------- */
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeIO = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const mq = q => window.matchMedia(q);

  const root = document.documentElement;
  const reduced = mq('(prefers-reduced-motion: reduce)').matches;
  const canHover = mq('(hover: hover) and (pointer: fine)').matches;
  const lite =
    (navigator.hardwareConcurrency || 8) <= 4 ||
    (navigator.deviceMemory || 8) <= 4 ||
    !!(navigator.connection && navigator.connection.saveData);
  if (lite) root.classList.add('lite');

  const safe = (name, fn, fallback) => {
    try { fn(); } catch (err) {
      console.warn('[kosh] ' + name + ' no se pudo iniciar:', err);
      if (fallback) fallback();
    }
  };

  /* ---------- WhatsApp: una sola fuente de verdad ---------- */
  const waURL = msg => 'https://wa.me/' + CONFIG.phone + (msg ? '?text=' + encodeURIComponent(msg) : '');

  function initWhatsApp() {
    $$('a[href^="https://wa.me/"]').forEach(a => {
      a.href = waURL(a.dataset.wa || '');
    });
  }

  /* ==========================================================================
     MOTOR DE SCROLL
     Cada "item" mide un progreso (0..1) y lo aplica ya suavizado (efecto lento).
     ========================================================================== */
  const engine = (() => {
    const items = [];
    const tasks = [];
    const byEl = new Map();
    let raf = 0;
    let last = 0;

    const io = 'IntersectionObserver' in window
      ? new IntersectionObserver(entries => {
          entries.forEach(en => {
            (byEl.get(en.target) || []).forEach(it => {
              it.vis = en.isIntersecting;
              if (en.isIntersecting) it.first = true;
            });
          });
          schedule();
        }, { rootMargin: '15% 0px 15% 0px' })
      : null;

    function schedule() { if (!raf) raf = requestAnimationFrame(frame); }

    function add(def) {
      const it = Object.assign({ cur: 0, vis: !io, first: true, ease: .12 }, def);
      items.push(it);
      if (io) {
        if (!byEl.has(it.el)) byEl.set(it.el, []);
        byEl.get(it.el).push(it);
        io.observe(it.el);
      }
      schedule();
      return it;
    }

    function refresh() {
      items.forEach(it => { if (it.refresh) it.refresh(); it.first = true; });
      schedule();
    }

    function frame(now) {
      raf = 0;
      const dt = last ? Math.min(50, now - last) : 16.7;
      last = now;
      const y = window.scrollY;
      const vh = window.innerHeight;

      for (const t of tasks) t(y, vh);

      let busy = false;
      const live = [];
      // 1) lecturas
      for (const it of items) {
        if (!(it.vis || it.first)) continue;
        const target = it.measure(y, vh);
        if (it.first || reduced) {
          it.cur = target;
        } else {
          const k = 1 - Math.pow(1 - it.ease, dt / 16.667);
          it.cur += (target - it.cur) * k;
          if (Math.abs(target - it.cur) < 0.0004) it.cur = target; else busy = true;
        }
        live.push(it);
      }
      // 2) escrituras
      for (const it of live) {
        const b = it.apply(it.cur, dt, it.first);
        it.first = false;
        if (b) busy = true;
      }
      if (busy) raf = requestAnimationFrame(frame); else last = 0;
    }

    window.addEventListener('scroll', schedule, { passive: true });
    let rt = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(refresh, 160);
    }, { passive: true });
    window.addEventListener('load', refresh);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);

    return { add, schedule, refresh, onFrame: fn => tasks.push(fn) };
  })();

  /* Progreso de una sección alta con contenido "pegado" (sticky) */
  const pinProgress = (el, vh) => {
    const r = el.getBoundingClientRect();
    const total = r.height - vh;
    return total > 0 ? clamp(-r.top / total) : 0;
  };

  /* ==========================================================================
     PANTALLA DE CARGA
     ========================================================================== */
  function initLoader() {
    const loader = $('#loader');
    if (!loader) { document.body.classList.add('is-ready'); return; }
    const arc = $('#loader-arc');
    const pct = $('#loader-pct');
    const fill = $('#loader-fill');
    const minMs = reduced ? 500 : CONFIG.minLoaderMs;
    const t0 = performance.now();
    let loaded = document.readyState === 'complete';
    let shown = 0;
    let lastInt = -1;
    let finished = false;

    window.addEventListener('load', () => { loaded = true; });

    const finish = () => {
      if (finished) return;
      finished = true;
      loader.classList.add('is-done');
      setTimeout(() => document.body.classList.add('is-ready'), reduced ? 0 : 420);
      setTimeout(() => {
        loader.classList.add('is-gone');
        loader.remove();
      }, reduced ? 50 : 1300);
    };

    const tick = now => {
      if (finished) return;
      const t = clamp((now - t0) / minMs);
      const cap = loaded ? 100 : 88;               // no llega a 100% hasta que todo cargue
      const target = Math.min(cap, easeOut(t) * 100);
      shown = lerp(shown, target, .14);
      if (shown > 99.4 && loaded && t >= 1) shown = 100;
      const p = Math.round(shown);
      if (p !== lastInt) {
        lastInt = p;
        pct.textContent = String(p);
        arc.style.strokeDashoffset = String(100 - shown);
        fill.style.setProperty('--p', shown.toFixed(1) + '%');
      }
      if (shown >= 100) { setTimeout(finish, 260); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setTimeout(finish, 7000);                      // seguro anti-bloqueo
  }

  /* ==========================================================================
     NAVEGACIÓN, MENÚ, PROGRESO
     ========================================================================== */
  function initNav() {
    const nav = $('#nav');
    const burger = $('#burger');
    const menu = $('#menu');
    const bar = $('#progress-bar');
    const main = $('#contenido');
    let menuOpen = false;
    let lastY = window.scrollY;
    let stateScrolled = null;
    let stateHidden = null;

    engine.onFrame(y => {
      const doc = root.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (doc > 0 ? clamp(y / doc) : 0).toFixed(4) + ')';
      const scrolled = y > 24;
      if (scrolled !== stateScrolled) { nav.classList.toggle('is-scrolled', scrolled); stateScrolled = scrolled; }
      if (Math.abs(y - lastY) > 6) {
        const hide = y > lastY && y > 320 && !menuOpen;
        if (hide !== stateHidden) { nav.classList.toggle('is-hidden', hide); stateHidden = hide; }
        lastY = y;
      }
    });

    const setMenu = open => {
      menuOpen = open;
      menu.classList.toggle('is-open', open);
      burger.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      menu.setAttribute('aria-hidden', String(!open));
      root.style.overflow = open ? 'hidden' : '';
      if (main) main.inert = open;
      if (open) nav.classList.remove('is-hidden');
    };
    burger.addEventListener('click', () => setMenu(!menuOpen));
    $$('a', menu).forEach(a => a.addEventListener('click', () => setMenu(false)));
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && menuOpen) { setMenu(false); burger.focus(); } });
    mq('(min-width: 900px)').addEventListener('change', e => { if (e.matches && menuOpen) setMenu(false); });

    // Enlace activo según la sección en pantalla
    if ('IntersectionObserver' in window) {
      const links = $$('.nav__links a');
      const map = new Map(links.map(a => [a.getAttribute('href'), a]));
      const spy = new IntersectionObserver(entries => {
        entries.forEach(en => {
          if (!en.isIntersecting) return;
          links.forEach(l => l.classList.remove('is-current'));
          const a = map.get('#' + en.target.id);
          if (a) a.classList.add('is-current');
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      ['kosh-plus', 'productos', 'ritual', 'preguntas'].forEach(id => { const s = document.getElementById(id); if (s) spy.observe(s); });
    }
  }

  /* ==========================================================================
     TEXTO: palabras que suben (títulos) y palabras que se encienden (manifiesto)
     ========================================================================== */
  function splitWords(el) {
    const text = el.textContent.trim().replace(/\s+/g, ' ');
    el.setAttribute('aria-label', text);
    el.textContent = '';
    const words = text.split(' ');
    words.forEach((word, i) => {
      const w = document.createElement('span');
      w.className = 'w';
      w.setAttribute('aria-hidden', 'true');
      const inner = document.createElement('span');
      inner.className = 'w__i';
      inner.style.setProperty('--i', String(i));
      inner.textContent = word;
      w.appendChild(inner);
      el.appendChild(w);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
  }

  function initReveals() {
    $$('[data-split]').forEach(splitWords);
    const targets = $$('[data-reveal], [data-split]');
    if (reduced || !('IntersectionObserver' in window)) {
      root.classList.add('reveal-all');
      targets.forEach(el => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const el = en.target;
        io.unobserve(el);
        el.classList.add('is-in');
        if (el.hasAttribute('data-reveal')) {
          // al terminar, se retira el atributo para devolver al elemento sus propias transiciones
          const d = parseFloat(el.style.getPropertyValue('--d')) || 0;
          setTimeout(() => { el.removeAttribute('data-reveal'); el.classList.remove('is-in'); }, d + 1600);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    targets.forEach(el => io.observe(el));
  }

  function initManifesto() {
    const section = $('[data-manifesto]');
    const text = $('[data-manifesto-text]');
    if (!section || !text) return;

    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const frag = document.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        const s = document.createElement('span');
        s.className = 'mw';
        s.textContent = part;
        frag.appendChild(s);
      });
      node.parentNode.replaceChild(frag, node);
    });
    const words = $$('.mw', text);
    text.classList.add('is-split');
    if (reduced) { words.forEach(w => w.classList.add('on')); return; }

    let lit = 0;
    engine.add({
      el: text,
      ease: .16,
      measure: (y, vh) => {
        const r = text.getBoundingClientRect();
        const start = vh * 0.86, end = vh * 0.42;
        return clamp((start - r.top) / (start - end + r.height));
      },
      apply: p => {
        const n = Math.round(p * words.length);
        if (n === lit) return;
        const from = Math.min(n, lit), to = Math.max(n, lit);
        for (let i = from; i < to; i++) words[i].classList.toggle('on', n > lit);
        lit = n;
      }
    });
  }

  /* ==========================================================================
     HERO: entrada, inclinación con el mouse y salida con scroll
     ========================================================================== */
  function initHero() {
    const hero = $('#inicio');
    const copy = $('[data-hero-copy]');
    const scene = $('[data-scene]');
    const stage = $('[data-stage-3d]');
    if (!hero || !scene || !stage) return;

    const st = { tx: 0, ty: 0, cx: 0, cy: 0 };
    if (canHover && !reduced) {
      hero.addEventListener('pointermove', e => {
        const r = hero.getBoundingClientRect();
        st.tx = ((e.clientX - r.left) / r.width - .5) * 2;
        st.ty = ((e.clientY - r.top) / r.height - .5) * 2;
        engine.schedule();
      }, { passive: true });
      hero.addEventListener('pointerleave', () => { st.tx = 0; st.ty = 0; engine.schedule(); });
    }

    engine.add({
      el: hero,
      ease: .14,
      measure: y => clamp(y / (hero.offsetHeight * 0.85)),
      apply: (p, dt) => {
        const k = reduced ? 1 : 1 - Math.pow(1 - .09, dt / 16.667);
        st.cx = lerp(st.cx, st.tx, k);
        st.cy = lerp(st.cy, st.ty, k);
        const yaw = st.cx * 16 + p * 80;
        const pitch = -st.cy * 9;
        stage.style.transform = 'rotateX(' + pitch.toFixed(2) + 'deg) rotateY(' + yaw.toFixed(2) + 'deg)';
        scene.style.transform = 'translate3d(0,' + (-p * 70).toFixed(1) + 'px,0) scale(' + (1 - p * .1).toFixed(3) + ')';
        if (copy) {
          copy.style.transform = 'translate3d(0,' + (-p * 50).toFixed(1) + 'px,0)';
          copy.style.opacity = String(clamp(1 - p * 1.15).toFixed(3));
        }
        return Math.abs(st.tx - st.cx) > .002 || Math.abs(st.ty - st.cy) > .002;
      }
    });
  }

  /* ==========================================================================
     KOSH PLUS 3D: la sección se queda fija y la caja gira con el scroll
     ========================================================================== */
  function initShowcase() {
    const section = $('[data-showcase]');
    if (!section || reduced) return;
    const stage = $('[data-sc-stage]', section);
    const steps = $$('[data-step]', section);
    const dots = $$('.showcase__dots span', section);
    let idx = -1;

    engine.add({
      el: section,
      ease: .1,
      measure: (y, vh) => pinProgress(section, vh),
      apply: p => {
        const k = Math.min(3, Math.floor(p * 4));
        const t = p * 4 - k;
        const hold = .2;                                   // la caja "descansa" en cada cara
        const u = clamp((t - hold) / (1 - 2 * hold));
        const prog = k + easeIO(u);                        // 0..4
        const angle = 24 + 90 * prog;
        const pitch = 7 + 3 * Math.sin(prog * Math.PI);
        stage.style.transform = 'rotateX(' + pitch.toFixed(2) + 'deg) rotateY(' + angle.toFixed(2) + 'deg)';

        const next = Math.round(prog);
        if (next !== idx) {
          idx = next;
          section.dataset.step = String(idx);
          steps.forEach((s, i) => s.classList.toggle('is-active', i === idx));
          dots.forEach((d, i) => d.classList.toggle('is-on', i <= idx));
        }
      }
    });
  }

  /* ==========================================================================
     LA LÍNEA: el marco se abre hasta ocupar toda la pantalla
     ========================================================================== */
  function initStage() {
    const section = $('[data-stage]');
    if (!section || reduced) return;
    const frame = $('[data-stage-frame]', section);
    const text = $('[data-stage-text]', section);
    const lineup = $('[data-lineup]', section);
    lineup.style.transformOrigin = '50% 100%';

    engine.add({
      el: section,
      ease: .1,
      measure: (y, vh) => pinProgress(section, vh),
      apply: p => {
        const e = easeIO(clamp(p / .5));
        const iy = lerp(14, 0, e), ix = lerp(9, 0, e), cr = lerp(36, 0, e);
        frame.style.clipPath = 'inset(' + iy.toFixed(2) + '% ' + ix.toFixed(2) + '% round ' + cr.toFixed(1) + 'px)';
        lineup.style.transform = 'translate3d(0,' + lerp(46, 0, e).toFixed(1) + 'px,0) scale(' + lerp(.8, 1, e).toFixed(3) + ')';
        const tp = clamp((p - .4) / .25);
        text.style.opacity = tp.toFixed(3);
        text.style.transform = 'translate3d(0,' + ((1 - tp) * 26).toFixed(1) + 'px,0)';
        text.style.visibility = tp > .02 ? 'visible' : 'hidden';
      }
    });
  }

  /* ==========================================================================
     PRODUCTOS: scroll vertical que se convierte en desplazamiento horizontal
     ========================================================================== */
  function initProducts() {
    const section = $('[data-hscroll]');
    if (!section) return;
    const viewport = $('[data-hscroll-viewport]', section);
    const track = $('[data-hscroll-track]', section);
    const bar = $('[data-hscroll-bar]', section);
    const counter = $('[data-hscroll-n]', section);
    const cards = $$('.pcard', track);
    const desktop = mq('(min-width: 960px)');
    let dist = 0;
    let n = -1;

    const layout = () => {
      if (desktop.matches && !reduced) {
        dist = Math.max(0, track.scrollWidth - viewport.clientWidth);
        section.style.setProperty('--hs-h', Math.round(window.innerHeight + dist * 1.25) + 'px');
        viewport.removeAttribute('tabindex');
      } else {
        viewport.setAttribute('tabindex', '0');
        dist = 0;
        section.style.removeProperty('--hs-h');
        track.style.transform = '';
      }
    };
    layout();

    if (reduced) return;

    // Si alguien navega con teclado a una tarjeta, movemos el scroll de la página hasta ella
    track.addEventListener('focusin', e => {
      if (!desktop.matches || dist <= 0) return;
      const card = e.target.closest('.pcard');
      if (!card) return;
      viewport.scrollLeft = 0;
      const sectionTop = section.getBoundingClientRect().top + window.scrollY;
      const total = section.offsetHeight - window.innerHeight;
      const target = clamp(card.offsetLeft / dist);
      window.scrollTo({ top: sectionTop + total * target, behavior: 'smooth' });
    });

    engine.add({
      el: section,
      ease: .1,
      refresh: layout,
      measure: (y, vh) => (desktop.matches ? pinProgress(section, vh) : 0),
      apply: p => {
        if (!desktop.matches || dist <= 0) return;
        track.style.transform = 'translate3d(' + (-p * dist).toFixed(1) + 'px,0,0)';
        if (bar) bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
        const i = Math.min(cards.length, Math.floor(p * cards.length) + 1);
        if (i !== n && counter) { n = i; counter.textContent = String(i).padStart(2, '0'); }
      }
    });
  }

  /* ==========================================================================
     BENTO: parallax suave de las fotos
     ========================================================================== */
  function initBento() {
    if (reduced) return;
    $$('[data-parallax-tile]').forEach(tile => {
      const img = $('.tile__img', tile);
      if (!img) return;
      engine.add({
        el: tile,
        ease: .1,
        measure: (y, vh) => {
          const r = tile.getBoundingClientRect();
          return clamp(((r.top + r.height / 2) - vh / 2) / (vh / 2 + r.height / 2), -1, 1);
        },
        apply: p => {
          const shift = -p * tile.offsetHeight * .07;
          img.style.transform = 'translate3d(0,' + shift.toFixed(1) + 'px,0) scale(1.04)';
        }
      });
    });
  }

  /* ==========================================================================
     TU RUTINA: la línea se dibuja con el scroll y activa cada momento del día
     ========================================================================== */
  function initRitual() {
    const section = $('[data-ritual]');
    const timeline = $('[data-timeline]', section || document);
    if (!section || !timeline) return;
    const fill = $('[data-rail-fill]', timeline);
    const items = $$('[data-tl]', timeline);
    if (reduced) { items.forEach(li => li.classList.add('is-active')); fill.style.transform = 'scaleY(1)'; return; }
    let tops = [];
    let height = 1;
    const layout = () => { tops = items.map(li => li.offsetTop + 6); height = timeline.offsetHeight || 1; };
    layout();
    let active = -1;

    engine.add({
      el: timeline,
      ease: .12,
      refresh: layout,
      measure: (y, vh) => {
        const r = timeline.getBoundingClientRect();
        return clamp((vh * .58 - r.top) / height);
      },
      apply: p => {
        fill.style.transform = 'scaleY(' + p.toFixed(4) + ')';
        const line = p * height;
        let count = 0;
        tops.forEach(t => { if (line >= t) count++; });
        if (count !== active) {
          active = count;
          items.forEach((li, i) => li.classList.toggle('is-active', i < count));
        }
      }
    });
  }

  /* ==========================================================================
     PARTÍCULAS DEL HÉROE (canvas 2D, 30 fps, solo con el héroe visible)
     ========================================================================== */
  function initDust() {
    const canvas = $('#dust');
    if (!canvas || reduced || !canvas.getContext) return;
    const host = canvas.parentElement;
    const ctx = canvas.getContext('2d');
    const sprite = color => {
      const s = document.createElement('canvas');
      s.width = s.height = 64;
      const c = s.getContext('2d');
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, color + '1)');
      g.addColorStop(.25, color + '.5)');
      g.addColorStop(1, color + '0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
      return s;
    };
    const gold = sprite('rgba(244,217,143,');
    const lav = sprite('rgba(181,149,236,');
    let w = 0, h = 0, parts = [], running = false, inView = true, lastDraw = 0;

    const make = initial => ({
      x: Math.random() * w,
      y: initial ? Math.random() * h : h + 24,
      z: Math.random(),
      size: 8 + Math.random() * 26,
      vy: .12 + Math.random() * .38,
      sp: .6 + Math.random() * 1.4,
      ph: Math.random() * 6.283,
      gold: Math.random() < .72
    });
    const build = () => {
      const count = lite ? 16 : (w < 700 ? 26 : 54);
      parts = Array.from({ length: count }, () => make(true));
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, lite ? 1 : 1.5);
      w = host.clientWidth; h = host.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    };

    let rafId = 0;
    const loop = now => {
      if (!running) return;
      rafId = requestAnimationFrame(loop);
      if (now - lastDraw < 33) return;                     // tope de ~30 fps
      lastDraw = now;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.y -= p.vy * (.4 + p.z);
        p.x += Math.sin(now * .0004 * p.sp + p.ph) * .18;
        if (p.y < -30) Object.assign(p, make(false));
        const tw = .5 + .5 * Math.sin(now * .0016 * p.sp + p.ph);
        ctx.globalAlpha = (.18 + .6 * tw) * (.35 + .65 * p.z);
        const s = p.size * (.5 + p.z * .7);
        ctx.drawImage(p.gold ? gold : lav, p.x - s / 2, p.y - s / 2, s, s);
      }
    };
    const sync = () => {
      const should = inView && !document.hidden;
      if (should && !running) { running = true; rafId = requestAnimationFrame(loop); }
      else if (!should && running) { running = false; cancelAnimationFrame(rafId); }
    };

    resize();
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 220); }, { passive: true });
    document.addEventListener('visibilitychange', sync);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => { inView = es[0].isIntersecting; sync(); }).observe(host);
    }
    sync();
  }

  /* ==========================================================================
     PAUSA DE ANIMACIONES CSS FUERA DE PANTALLA
     ========================================================================== */
  function initPause() {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => en.target.classList.toggle('is-off', !en.isIntersecting));
    }, { rootMargin: '10% 0px' });
    $$('[data-pause]').forEach(el => io.observe(el));
  }

  /* ==========================================================================
     MICROINTERACCIONES (solo con mouse): tarjetas inclinables y botones magnéticos
     ========================================================================== */
  function initTilt() {
    if (!canHover || reduced) return;
    $$('[data-tilt]').forEach(card => {
      let raf = 0, ev = null;
      card.addEventListener('pointermove', e => {
        ev = e;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const r = card.getBoundingClientRect();
          const x = (ev.clientX - r.left) / r.width;
          const y = (ev.clientY - r.top) / r.height;
          card.style.setProperty('--ry', ((x - .5) * 8).toFixed(2) + 'deg');
          card.style.setProperty('--rx', ((.5 - y) * 6).toFixed(2) + 'deg');
          card.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
          card.style.setProperty('--my', (y * 100).toFixed(1) + '%');
        });
      }, { passive: true });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }

  function initMagnetic() {
    if (!canHover || reduced) return;
    $$('[data-magnetic]').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = 'translate(' + (dx * .22).toFixed(1) + 'px,' + (dy * .3).toFixed(1) + 'px)';
      }, { passive: true });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ==========================================================================
     CONTADORES
     ========================================================================== */
  function initCounters() {
    const els = $$('[data-count]');
    if (!els.length || reduced || !('IntersectionObserver' in window)) return;
    const run = el => {
      const end = parseFloat(el.dataset.count) || 0;
      const dur = 1600;
      const t0 = performance.now();
      const step = now => {
        const t = clamp((now - t0) / dur);
        el.textContent = Math.round(end * easeOut(t)).toLocaleString('es-MX');
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        run(en.target);
      });
    }, { threshold: .6 });
    els.forEach(el => { el.textContent = '0'; io.observe(el); });
  }

  /* ==========================================================================
     PREGUNTAS FRECUENTES
     ========================================================================== */
  function initFaq() {
    const list = $('[data-faq]');
    if (!list) return;
    const qs = $$('.faq__q', list);
    qs.forEach(q => {
      q.addEventListener('click', () => {
        const open = q.getAttribute('aria-expanded') === 'true';
        qs.forEach(o => {
          const isThis = o === q;
          const expand = isThis && !open;
          o.setAttribute('aria-expanded', String(expand));
          document.getElementById(o.getAttribute('aria-controls')).classList.toggle('is-open', expand);
        });
      });
    });
  }

  /* ==========================================================================
     FORMULARIO -> WHATSAPP
     ========================================================================== */
  function initForm() {
    const form = $('[data-wa-form]');
    if (!form) return;
    const nameInput = $('#f-name');
    const err = $('#err-name');
    const ok = $('#form-ok');

    const setError = msg => {
      err.textContent = msg;
      nameInput.closest('.field').classList.toggle('is-invalid', !!msg);
      nameInput.setAttribute('aria-invalid', msg ? 'true' : 'false');
    };
    nameInput.addEventListener('input', () => { if (nameInput.value.trim().length >= 2) setError(''); });

    form.addEventListener('submit', e => {
      e.preventDefault();
      const name = nameInput.value.trim();
      if (name.length < 2) {
        setError('Escribe tu nombre para que sepamos cómo llamarte.');
        nameInput.focus();
        return;
      }
      setError('');
      const prod = form.elements.producto.value;
      const goalEl = form.querySelector('input[name="objetivo"]:checked');
      const extra = form.elements.mensaje.value.trim();
      const lines = [
        'Hola, soy ' + name + '.',
        prod ? 'Me interesa: ' + prod + '.' : 'Quiero asesoría para elegir mi producto Kosh.',
        goalEl ? 'Mi objetivo: ' + goalEl.value + '.' : '',
        extra ? 'Más detalles: ' + extra : '',
        'Vi su página y quiero mi asesoría gratis.'
      ].filter(Boolean);
      const url = waURL(lines.join('\n'));
      const fallback = $('[data-wa-fallback]', ok);
      if (fallback) fallback.href = url;
      ok.hidden = false;
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  /* ==========================================================================
     BOTÓN FLOTANTE DE WHATSAPP
     ========================================================================== */
  function initFloat() {
    const btn = $('#wa-float');
    if (!btn) return;
    const show = () => {
      btn.classList.add('is-visible');
      setTimeout(() => {
        btn.classList.add('show-tip');
        setTimeout(() => btn.classList.remove('show-tip'), 4500);
      }, 5000);
    };
    if (document.body.classList.contains('is-ready')) { show(); return; }
    const obs = new MutationObserver(() => {
      if (document.body.classList.contains('is-ready')) { obs.disconnect(); show(); }
    });
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  /* ==========================================================================
     ARRANQUE
     ========================================================================== */
  safe('whatsapp', initWhatsApp);
  safe('loader', initLoader, () => document.body.classList.add('is-ready'));
  safe('nav', initNav);
  safe('reveals', initReveals, () => root.classList.add('reveal-all'));
  safe('manifiesto', initManifesto, () => root.classList.add('reveal-all'));
  safe('hero', initHero);
  safe('showcase', initShowcase);
  safe('stage', initStage);
  safe('productos', initProducts);
  safe('bento', initBento);
  safe('ritual', initRitual);
  safe('dust', initDust);
  safe('pausa', initPause);
  safe('tilt', initTilt);
  safe('magnetic', initMagnetic);
  safe('counters', initCounters);
  safe('faq', initFaq);
  safe('form', initForm);
  safe('float', initFloat);

  /* Seguro anti-bloqueo: si algo impidiera revelar contenido, se muestra todo */
  setTimeout(() => { if (!document.body.classList.contains('is-ready')) document.body.classList.add('is-ready'); }, 9000);
})();

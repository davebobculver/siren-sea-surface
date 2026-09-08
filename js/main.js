/* ------------------------------------------------------------------
   main.js — behaviour for the paper website.

   Responsibilities, in order of execution:
     1. build the reference list and inline citations from REFERENCES
     2. typeset all $…$ / $$…$$ math with KaTeX (paper macros included)
     3. figure viewer; collapsible contents
     4. mark the section currently being read
     5. citation hover / focus popovers
   ------------------------------------------------------------------ */
(function () {
  'use strict';

  var refs = window.REFERENCES || [];
  var byKey = {};
  refs.forEach(function (r, i) { r.n = i + 1; byKey[r.key] = r; });

  /* ---------------- 1. references + inline citations ---------------- */

  function refInnerHTML(r) {
    var html = '<span class="ref-auth">' + r.auth + '</span>, ' +
               '<span class="ref-year">' + r.year + '</span>: ' +
               '<span class="ref-title">' + r.title + '</span>. ' +
               '<span class="ref-src">' + r.src + '</span>.';
    if (r.link) {
      html += ' <a class="ref-link" href="' + r.link + '" target="_blank" rel="noopener noreferrer">link&nbsp;&#8599;</a>';
    }
    return html;
  }

  var reflist = document.getElementById('reflist');
  if (reflist) {
    refs.forEach(function (r) {
      var li = document.createElement('li');
      li.id = 'ref-' + r.key;
      li.className = 'ref';
      li.innerHTML = refInnerHTML(r);
      reflist.appendChild(li);
    });
  }

  // A citation span carries data-keys (comma separated), an optional
  // data-prefix ("e.g.,") and data-style="t" for the textual \citet form.
  document.querySelectorAll('span.cite').forEach(function (span) {
    var keys = (span.dataset.keys || '').split(',').map(function (s) { return s.trim(); })
                                        .filter(Boolean);
    var textual = span.dataset.style === 't';
    var prefix = span.dataset.prefix || '';
    var parts = [];

    keys.forEach(function (k) {
      var r = byKey[k];
      var text = r ? r.label : k;
      if (textual && r) {
        // "Sitzmann et al. (2020)"
        text = r.label.replace(/\s(\d{4}[a-z]?)$/, ' ($1)');
      }
      parts.push('<a href="#ref-' + k + '" class="cite-link" data-key="' + k + '">' +
                 text + '</a>');
    });

    var joined = parts.join('; ');
    if (textual) {
      span.innerHTML = joined;
      span.classList.add('cite-textual');
    } else {
      span.innerHTML = '(' + (prefix ? prefix + ' ' : '') + joined + ')';
    }
  });

  /* ---------------- 2. math ---------------- */

  var MACROS = {
    '\\heta': '\\hat{\\eta}',
    '\\etahat': '\\hat{\\eta}(x,y,t|\\boldsymbol{\\theta})',
    '\\etaobs': '\\eta_{\\mathrm{obs}}',
    '\\etatest': '\\eta_{\\mathrm{test}}',
    '\\etatrain': '\\eta_{\\mathrm{train}}',
    '\\mps': '\\mathrm{m}\\,\\mathrm{s}^{-1}',
    '\\gradeta': '|\\nabla \\hat{\\eta}|',
    '\\lapeta': '\\nabla^2 \\hat{\\eta}',
    '\\detadt': '\\partial \\hat{\\eta}/\\partial t',
    '\\detadx': '\\partial \\eta/\\partial x',
    '\\detady': '\\partial \\eta/\\partial y',
    '\\bth': '\\boldsymbol{\\theta}'
  };

  function typeset() {
    if (typeof renderMathInElement !== 'function') { return; }
    renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false }
      ],
      macros: MACROS,
      ignoredClasses: ['ref-src', 'ref-auth', 'ref-title'],
      throwOnError: false,
      strict: false
    });
  }

  if (document.readyState === 'complete') { typeset(); }
  else { window.addEventListener('load', typeset); }

  /* ---------------- 3. figure lightbox ---------------- */

  var lb = document.getElementById('lightbox');
  var lbImg = document.getElementById('lightbox-img');
  var lbCap = document.getElementById('lightbox-cap');
  var lbClose = document.getElementById('lightbox-close');
  var lastFocus = null;

  function openLightbox(img, caption) {
    lastFocus = document.activeElement;
    lbImg.src = img.currentSrc || img.src;
    lbImg.alt = img.alt;
    lbCap.textContent = caption;
    lb.hidden = false;
    document.body.classList.add('no-scroll');
    lbClose.focus();
  }

  function closeLightbox() {
    lb.hidden = true;
    lbImg.src = '';
    document.body.classList.remove('no-scroll');
    if (lastFocus) { lastFocus.focus(); }
  }

  document.querySelectorAll('figure.fig').forEach(function (fig) {
    var frame = fig.querySelector('.fig-frame');
    var img = fig.querySelector('img');
    if (!frame || !img) { return; }
    frame.setAttribute('role', 'button');
    frame.setAttribute('tabindex', '0');
    frame.setAttribute('aria-label', 'Enlarge figure');

    var label = fig.querySelector('.fig-label');
    var caption = label ? label.textContent.trim() + ' Click outside or press Esc to close.'
                        : 'Figure';

    frame.addEventListener('click', function () { openLightbox(img, caption); });
    frame.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLightbox(img, caption);
      }
    });
  });

  if (lb) {
    lbClose.addEventListener('click', closeLightbox);
    lb.addEventListener('click', function (e) {
      if (e.target === lb || e.target.id === 'lightbox-fig') { closeLightbox(); }
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (lb && !lb.hidden) { closeLightbox(); }
      hidePop();
    }
  });

  /* ---------------- 3b. collapsible sidebar sections ---------------- */

  // Each .toc-toggle owns the list named by aria-controls. Open/closed state
  // is remembered per control id so it survives a reload.
  var TOC_STORE = 'siren-paper-toc';
  // Lists that start closed for a first-time visitor; the markup ships them
  // closed too so they never flash open before this script runs.
  var TOC_CLOSED_BY_DEFAULT = ['toc-contents', 'toc-figures'];
  var tocState = {};
  try { tocState = JSON.parse(localStorage.getItem(TOC_STORE) || '{}') || {}; }
  catch (e) { tocState = {}; }

  function saveTocState() {
    try { localStorage.setItem(TOC_STORE, JSON.stringify(tocState)); }
    catch (e) { /* storage blocked — state is just per-session then */ }
  }

  function setSection(btn, open) {
    var list = document.getElementById(btn.getAttribute('aria-controls'));
    if (!list) { return; }
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    list.hidden = !open;
    var group = btn.closest('.toc-group');
    if (group) { group.classList.toggle('collapsed', !open); }
  }

  document.querySelectorAll('.toc-toggle').forEach(function (btn) {
    var id = btn.getAttribute('aria-controls');
    // a previous visit wins; otherwise fall back to the default for this list
    var open = typeof tocState[id] === 'boolean'
      ? tocState[id]
      : TOC_CLOSED_BY_DEFAULT.indexOf(id) === -1;
    setSection(btn, open);

    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      setSection(btn, open);
      tocState[id] = open;
      saveTocState();
      onScroll();          // sub-links may have appeared or vanished
    });
  });

  /* ---------------- 4. mark the section being read ---------------- */

  var tocLinks = Array.prototype.slice.call(
    document.querySelectorAll('#toc a[href^="#"]')
  );
  var targets = tocLinks.map(function (a) {
    return document.getElementById(a.getAttribute('href').slice(1));
  });

  var ticking = false;
  function onScroll() {
    if (ticking) { return; }
    ticking = true;
    window.requestAnimationFrame(function () {
      // last heading whose top is above the 30% line, ignoring links inside
      // a collapsed group so the parent stays marked
      var line = window.innerHeight * 0.3;
      var active = -1;
      for (var i = 0; i < targets.length; i++) {
        var el = targets[i];
        if (!el || tocLinks[i].offsetParent === null) { continue; }
        if (el.getBoundingClientRect().top <= line) { active = i; }
      }
      tocLinks.forEach(function (a, i) {
        a.classList.toggle('active', i === active);
      });
      ticking = false;
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ---------------- 5. citation popovers ---------------- */

  var pop = document.getElementById('citepop');
  var popTimer = null;

  function showPop(link) {
    var r = byKey[link.dataset.key];
    if (!r || !pop) { return; }
    clearTimeout(popTimer);
    pop.innerHTML = refInnerHTML(r);
    pop.hidden = false;

    var rect = link.getBoundingClientRect();
    var pw = pop.offsetWidth;
    var ph = pop.offsetHeight;
    var left = rect.left + rect.width / 2 - pw / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - pw - 12));

    var above = rect.top > ph + 16;
    var top = above ? rect.top - ph - 10 : rect.bottom + 10;

    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function hidePop() {
    if (!pop) { return; }
    popTimer = setTimeout(function () { pop.hidden = true; }, 120);
  }

  document.addEventListener('mouseover', function (e) {
    var link = e.target.closest && e.target.closest('a.cite-link');
    if (link) { showPop(link); }
  });
  document.addEventListener('mouseout', function (e) {
    if (e.target.closest && e.target.closest('a.cite-link')) { hidePop(); }
  });
  document.addEventListener('focusin', function (e) {
    var link = e.target.closest && e.target.closest('a.cite-link');
    if (link) { showPop(link); }
  });
  document.addEventListener('focusout', function (e) {
    if (e.target.closest && e.target.closest('a.cite-link')) { hidePop(); }
  });
  if (pop) {
    pop.addEventListener('mouseenter', function () { clearTimeout(popTimer); });
    pop.addEventListener('mouseleave', hidePop);
  }
})();

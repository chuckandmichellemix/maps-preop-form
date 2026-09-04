/* ===================================================================
   MAPS Clinical Forms — Shared behavior
   Everything here runs entirely in the browser. No data is transmitted
   to any server — forms are meant to be printed / saved as PDF and
   delivered through your organization's own secure channels.
   =================================================================== */

/* ---------- Theme toggle ---------- */
(function () {
  const toggle = document.querySelector('[data-theme-toggle]');
  const root = document.documentElement;
  let theme = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  root.setAttribute('data-theme', theme);
  if (toggle) {
    updateIcon();
    toggle.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', theme);
      updateIcon();
    });
  }
  function updateIcon() {
    if (!toggle) return;
    toggle.setAttribute('aria-label', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' mode');
    toggle.innerHTML = theme === 'dark'
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }
})();

/* ---------- Signature pad ----------
   Usage: <canvas class="sig-canvas" data-signature-for="fieldName"></canvas>
   Exposes window.MapsSignature.isEmpty(canvas) / .clear(canvas) / .toDataURL(canvas)
*/
window.MapsSignature = (function () {
  const pads = new Map();

  function init(canvas) {
    const ctx = canvas.getContext('2d');
    const state = { drawing: false, hasInk: false, ctx };
    pads.set(canvas, state);
    resize(canvas);
    window.addEventListener('resize', () => resize(canvas));

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const point = e.touches ? e.touches[0] : e;
      return { x: point.clientX - rect.left, y: point.clientY - rect.top };
    };

    const start = (e) => {
      e.preventDefault();
      state.drawing = true;
      const p = getPos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const move = (e) => {
      if (!state.drawing) return;
      e.preventDefault();
      const p = getPos(e);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--color-text') || '#1a2422';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      state.hasInk = true;
    };
    const end = () => { state.drawing = false; };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
  }

  function resize(canvas) {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const state = pads.get(canvas);
    const prev = state && state.hasInk ? canvas.toDataURL() : null;
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    if (prev) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = prev;
    }
  }

  function clear(canvas) {
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    const state = pads.get(canvas);
    if (state) state.hasInk = false;
  }

  function isEmpty(canvas) {
    const state = pads.get(canvas);
    return !state || !state.hasInk;
  }

  document.querySelectorAll('.sig-canvas').forEach(init);
  document.querySelectorAll('[data-sig-clear]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const canvas = document.getElementById(btn.getAttribute('data-sig-clear'));
      if (canvas) clear(canvas);
    });
  });

  return { init, clear, isEmpty };
})();

/* ---------- Conditional field helper ----------
   Toggles [hidden] and required-state on a target block based on a
   trigger condition function. Re-evaluates on every change event.
*/
window.MapsConditional = function (triggerSelectors, targetEl, shouldShow) {
  const els = document.querySelectorAll(triggerSelectors);
  const evaluate = () => {
    const show = shouldShow();
    targetEl.hidden = !show;
    targetEl.querySelectorAll('input, textarea, select').forEach((f) => {
      if (f.dataset.conditionalRequired === 'true') f.required = show;
    });
  };
  els.forEach((el) => el.addEventListener('change', evaluate));
  evaluate();
};

/* ---------- "None of the above" exclusivity for checklist groups ---------- */
document.querySelectorAll('[data-checklist]').forEach((group) => {
  const noneBox = group.querySelector('[data-none-option]');
  const others = group.querySelectorAll('input[type="checkbox"]:not([data-none-option])');
  if (!noneBox) return;
  noneBox.addEventListener('change', () => {
    if (noneBox.checked) others.forEach((o) => { o.checked = false; });
    group.dispatchEvent(new Event('checklistchange'));
  });
  others.forEach((o) => o.addEventListener('change', () => {
    if (o.checked) noneBox.checked = false;
    group.dispatchEvent(new Event('checklistchange'));
  }));
});

/* ---------- Checklist → conditional "please describe" block ----------
   Group: [data-checklist][data-conditional-target="elementId"]
   Shows the target block when any non-"None of the above" box is checked.
*/
document.querySelectorAll('[data-checklist][data-conditional-target]').forEach((group) => {
  const conditional = document.getElementById(group.getAttribute('data-conditional-target'));
  if (!conditional) return;
  const update = () => {
    const others = group.querySelectorAll('input[type="checkbox"]:not([data-none-option])');
    const anyChecked = Array.from(others).some((o) => o.checked);
    conditional.hidden = !anyChecked;
    const field = conditional.querySelector('textarea, input');
    if (field) field.required = anyChecked;
  };
  group.addEventListener('checklistchange', update);
  update();
});

/* ---------- Inline "reveals" — checking a box shows a small sub-field ---------- */
document.querySelectorAll('[data-reveals]').forEach((input) => {
  const target = document.getElementById(input.getAttribute('data-reveals'));
  if (!target) return;
  const update = () => { target.hidden = !input.checked; };
  input.addEventListener('change', update);
  update();
});

/* ---------- DASI live scoring ---------- */
window.MapsDasi = function (formEl, weights, outputIds) {
  const inputs = formEl.querySelectorAll('[data-dasi-item]');
  const compute = () => {
    let total = 0;
    inputs.forEach((group) => {
      const name = group.getAttribute('data-dasi-item');
      const checked = formEl.querySelector(`input[name="${name}"]:checked`);
      if (checked && checked.value === 'Yes') total += weights[name] || 0;
    });
    const vo2 = 0.43 * total + 9.6;
    const mets = vo2 / 3.5;
    if (outputIds.score) document.getElementById(outputIds.score).textContent = total.toFixed(2);
    if (outputIds.vo2) document.getElementById(outputIds.vo2).textContent = vo2.toFixed(1);
    if (outputIds.mets) document.getElementById(outputIds.mets).textContent = mets.toFixed(1);
  };
  formEl.addEventListener('change', compute);
  compute();
};

/* ---------- Form submit → local "completed" state (no data transmitted) ---------- */
document.querySelectorAll('form[data-local-form]').forEach((form) => {
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    // Custom validation for signature pads marked required
    let valid = form.checkValidity();
    form.querySelectorAll('[data-sig-required="true"]').forEach((canvas) => {
      if (window.MapsSignature.isEmpty(canvas)) {
        valid = false;
        canvas.closest('.field').classList.add('invalid');
      } else {
        canvas.closest('.field').classList.remove('invalid');
      }
    });

    if (!valid) {
      form.reportValidity();
      const firstInvalid = form.querySelector(':invalid, .invalid');
      if (firstInvalid) firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    form.hidden = true;
    const success = document.querySelector('[data-form-success]');
    if (success) {
      success.classList.add('is-visible');
      success.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

/* ---------- Print trigger ---------- */
document.querySelectorAll('[data-print-form]').forEach((btn) => {
  btn.addEventListener('click', () => window.print());
});

/* ---------- Start over ---------- */
document.querySelectorAll('[data-start-over]').forEach((btn) => {
  btn.addEventListener('click', () => window.location.reload());
});

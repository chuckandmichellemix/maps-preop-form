/* ===================================================================
   Anesthesia Pre-Op — form-specific behavior
   Runs entirely in the browser. Nothing here transmits data anywhere;
   fill at the point of care, then Save/Print as PDF and attach the
   file to the patient's record in Monday (Clinical Files column).
   =================================================================== */

/* ---------- Unit conversion + BMI / BSA (Mosteller) ---------- */
(function () {
  const heightIn = document.getElementById('height-in');
  const weightLb = document.getElementById('weight-lb');
  if (!heightIn || !weightLb) return;

  const outCm = document.getElementById('calc-cm');
  const outKg = document.getElementById('calc-kg');
  const outBmi = document.getElementById('calc-bmi');
  const outBsa = document.getElementById('calc-bsa');

  function setBox(el, text, empty) {
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-empty', !!empty);
  }

  function compute() {
    const inches = parseFloat(heightIn.value);
    const lbs = parseFloat(weightLb.value);
    const hasH = Number.isFinite(inches) && inches > 0;
    const hasW = Number.isFinite(lbs) && lbs > 0;

    if (hasH) {
      const cm = inches * 2.54;
      setBox(outCm, cm.toFixed(1) + ' cm', false);
    } else {
      setBox(outCm, '—', true);
    }

    if (hasW) {
      const kg = lbs * 0.453592;
      setBox(outKg, kg.toFixed(1) + ' kg', false);
    } else {
      setBox(outKg, '—', true);
    }

    if (hasH && hasW) {
      const bmi = (703 * lbs) / (inches * inches);
      setBox(outBmi, bmi.toFixed(1), false);

      const cm = inches * 2.54;
      const kg = lbs * 0.453592;
      const bsa = Math.sqrt((cm * kg) / 3600);
      setBox(outBsa, bsa.toFixed(2) + ' m²', false);
    } else {
      setBox(outBmi, '—', true);
      setBox(outBsa, '—', true);
    }
  }

  heightIn.addEventListener('input', compute);
  weightLb.addEventListener('input', compute);
  compute();
})();

/* ---------- Body-system WNL Yes/No → reveal findings checklist ---------- */
document.querySelectorAll('[data-system]').forEach((card) => {
  const name = card.getAttribute('data-system');
  const findings = card.querySelector('.system-card__findings');
  if (!findings) return;
  window.MapsConditional(`input[name="${name}_wnl"]`, findings, () =>
    document.querySelector(`input[name="${name}_wnl"]:checked`)?.value === 'No'
  );
});

/* ---------- Surgical history Yes/No -> reveal "please describe" ---------- */
[
  ['prior_anes_complications', 'prior-anes-detail'],
  ['family_anes_complications', 'family-anes-detail'],
].forEach(([radioName, targetId]) => {
  const target = document.getElementById(targetId);
  if (!target) return;
  window.MapsConditional(`input[name="${radioName}"]`, target, () =>
    document.querySelector(`input[name="${radioName}"]:checked`)?.value === 'Yes'
  );
});

/* ---------- Generic chip multi-select ----------
   Markup: <div class="chip-field" data-chip-field data-chip-name="dx_codes" data-chip-source="ICD10_CODES">
             <div class="chip-field__chips"></div>
             <div class="chip-field__input-row">
               <input class="chip-field__input" type="text" placeholder="...">
               <button type="button" class="chip-field__add">Add</button>
             </div>
             <div class="chip-field__suggestions"></div>
           </div>
   Hidden inputs named data-chip-name are added/removed as chips change,
   so the codes travel with the form on submit/print.
*/
window.MapsChipField = function (root, sourceList) {
  const name = root.getAttribute('data-chip-name');
  const chipsWrap = root.querySelector('.chip-field__chips');
  const input = root.querySelector('.chip-field__input');
  const addBtn = root.querySelector('.chip-field__add');
  const suggestBox = root.querySelector('.chip-field__suggestions');
  const list = sourceList || [];
  const values = [];
  let activeIndex = -1;

  function render() {
    chipsWrap.innerHTML = '';
    values.forEach((v, i) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `<span>${escapeHtml(v)}</span>`;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'chip__remove';
      rm.setAttribute('aria-label', 'Remove ' + v);
      rm.textContent = '×';
      rm.addEventListener('click', () => { values.splice(i, 1); render(); });
      chip.appendChild(rm);
      chipsWrap.appendChild(chip);
    });
    // Sync hidden inputs so values are present in a print/PDF snapshot and any future export
    root.querySelectorAll('input[type="hidden"]').forEach((h) => h.remove());
    values.forEach((v) => {
      const h = document.createElement('input');
      h.type = 'hidden';
      h.name = name;
      h.value = v;
      root.appendChild(h);
    });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function addValue(v) {
    const clean = v.trim();
    if (!clean) return;
    if (!values.includes(clean)) values.push(clean);
    input.value = '';
    closeSuggestions();
    render();
  }

  function closeSuggestions() {
    suggestBox.classList.remove('is-open');
    suggestBox.innerHTML = '';
    activeIndex = -1;
  }

  function openSuggestions(query) {
    if (!list.length) {
      suggestBox.classList.remove('is-open');
      return;
    }
    const q = query.trim().toLowerCase();
    const matches = (q
      ? list.filter((item) => item.code.toLowerCase().includes(q) || item.label.toLowerCase().includes(q))
      : list
    ).slice(0, 8);
    if (!matches.length) { closeSuggestions(); return; }
    suggestBox.innerHTML = '';
    matches.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip-field__suggestion';
      btn.innerHTML = `<strong>${escapeHtml(item.code)}</strong> — ${escapeHtml(item.label)}`;
      btn.addEventListener('mousedown', (e) => { e.preventDefault(); addValue(`${item.code} — ${item.label}`); });
      suggestBox.appendChild(btn);
    });
    suggestBox.classList.add('is-open');
    activeIndex = -1;
  }

  input.addEventListener('input', () => openSuggestions(input.value));
  input.addEventListener('focus', () => openSuggestions(input.value));
  input.addEventListener('blur', () => setTimeout(closeSuggestions, 120));
  input.addEventListener('keydown', (e) => {
    const items = suggestBox.querySelectorAll('.chip-field__suggestion');
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('is-active', i === activeIndex));
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      items.forEach((el, i) => el.classList.toggle('is-active', i === activeIndex));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && items[activeIndex]) { items[activeIndex].dispatchEvent(new MouseEvent('mousedown')); }
      else addValue(input.value);
    } else if (e.key === ',') {
      e.preventDefault();
      addValue(input.value);
    } else if (e.key === 'Escape') {
      closeSuggestions();
    }
  });
  addBtn.addEventListener('click', () => addValue(input.value));

  render();
  return { addValue, get values() { return values.slice(); } };
};

/* Initialize chip fields present on the page.
   ICD10_CODES / CPT_CODES start empty — populate once the practice
   sends the final Kansas dental-disability-anesthesia code list.
   Clinicians can still type any code/description now; it's just not
   suggested from a list yet. */
window.ICD10_CODES = window.ICD10_CODES || [];
window.CPT_CODES = window.CPT_CODES || [];

document.querySelectorAll('[data-chip-field]').forEach((el) => {
  const sourceName = el.getAttribute('data-chip-source');
  const source = sourceName ? window[sourceName] : [];
  window.MapsChipField(el, source);
});

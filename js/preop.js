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

  /* Accepts: 5'5", 5' 5, 5ft5in, 5 feet 5, 65, 65", 65in — returns inches or null. */
  function parseHeightToInches(raw) {
    const str = (raw || '').trim().toLowerCase();
    if (!str) return null;

    const feetInches = str.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(\d+(?:\.\d+)?)?\s*(?:"|''|in|inch(?:es)?)?\s*$/);
    if (feetInches) {
      const feet = parseFloat(feetInches[1]);
      const inches = feetInches[2] ? parseFloat(feetInches[2]) : 0;
      if (Number.isFinite(feet)) return feet * 12 + (Number.isFinite(inches) ? inches : 0);
    }

    const inchesOnly = str.match(/^(\d+(?:\.\d+)?)\s*(?:"|''|in|inch(?:es)?)?\s*$/);
    if (inchesOnly) {
      const val = parseFloat(inchesOnly[1]);
      if (Number.isFinite(val)) return val;
    }

    return null;
  }

  function compute() {
    const inches = parseHeightToInches(heightIn.value);
    const lbs = parseFloat(weightLb.value);
    const hasH = Number.isFinite(inches) && inches > 0;
    const hasW = Number.isFinite(lbs) && lbs > 0;

    const heightHint = document.getElementById('height-hint');
    const rawHeight = heightIn.value.trim();
    const heightUnrecognized = rawHeight.length > 0 && inches === null;

    if (hasH) {
      const cm = inches * 2.54;
      const ft = Math.floor(inches / 12);
      const rem = Math.round((inches - ft * 12) * 10) / 10;
      setBox(outCm, cm.toFixed(1) + ' cm \u00b7 ' + ft + "'" + rem + '"', false);
    } else {
      setBox(outCm, '—', true);
    }
    if (heightHint) {
      heightHint.textContent = heightUnrecognized
        ? "Couldn't read that \u2014 try 5'5\", 65, or 65in"
        : "Accepts 5'5\", 5' 5, 65, or 65in";
      heightHint.classList.toggle('field__hint--error', heightUnrecognized);
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
   ICD10_CODES loads from js/icd10-data.js (CMS/CDC order file).
   CPT_CODES loads from js/cpt-data.js (practice's own curated short
   list — CPT codes/descriptors are AMA copyrighted, so this isn't the
   full CPT set). Both fall back to an empty array so the page still
   works if a data file is missing; clinicians can always type any
   code/description manually even without a matching list entry. */
window.ICD10_CODES = window.ICD10_CODES || [];
window.CPT_CODES = window.CPT_CODES || [];

document.querySelectorAll('[data-chip-field]').forEach((el) => {
  const sourceName = el.getAttribute('data-chip-source');
  const source = sourceName ? window[sourceName] : [];
  window.MapsChipField(el, source);
});

/* ---------- Date of Birth -> age + pediatric(<12)/adult switch ---------- */
(function () {
  const dob = document.getElementById('dob');
  const ageOut = document.getElementById('calc-age');
  const form = document.getElementById('preop-form');
  if (!dob || !form) return;

  const PEDIATRIC_CUTOFF = 12;

  function calcAgeYears(dobStr) {
    const d = new Date(dobStr + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    const today = new Date();
    if (d > today) return null;
    let years = today.getFullYear() - d.getFullYear();
    const monthDiff = today.getMonth() - d.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d.getDate())) years--;
    return years;
  }

  function calcAgeMonths(dobStr) {
    const d = new Date(dobStr + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    const today = new Date();
    if (d > today) return null;
    let months = (today.getFullYear() - d.getFullYear()) * 12 + (today.getMonth() - d.getMonth());
    if (today.getDate() < d.getDate()) months--;
    return Math.max(months, 0);
  }

  window.MapsApplyAgeGroup = apply;

  function apply() {
    const years = calcAgeYears(dob.value);

    if (years === null) {
      form.removeAttribute('data-age-group');
      form.removeAttribute('data-patient-age');
      if (ageOut) { ageOut.textContent = '—'; ageOut.classList.remove('has-value'); }
      togglePediatricOnly(null);
      document.dispatchEvent(new CustomEvent('maps:age-group-change', { detail: { age: null, group: null } }));
      return;
    }

    const group = years < PEDIATRIC_CUTOFF ? 'pediatric' : 'adult';
    form.setAttribute('data-patient-age', String(years));
    form.setAttribute('data-age-group', group);

    if (ageOut) {
      let text;
      if (years < 2) {
        const months = calcAgeMonths(dob.value);
        text = months + (months === 1 ? ' month' : ' months');
      } else {
        text = years + (years === 1 ? ' year' : ' years');
      }
      ageOut.textContent = text + (group === 'pediatric' ? ' (pediatric)' : '');
      ageOut.classList.add('has-value');
    }

    togglePediatricOnly(group);
    document.dispatchEvent(new CustomEvent('maps:age-group-change', { detail: { age: years, group: group } }));
  }

  /* [data-adult-only] mirrors [data-pediatric-only] for the >=12 group.
     Also force-unchecks any checkbox left checked inside an element that's
     about to be hidden (age changed after a box was ticked), dispatching a
     bubbling 'change' so dependent [data-reveals] sub-fields collapse too. */
  function toggleAgeScope(selector, show) {
    document.querySelectorAll(selector).forEach((el) => {
      el.hidden = !show;
      el.querySelectorAll('input, textarea, select').forEach((f) => {
        if (f.dataset.conditionalRequired === 'true') f.required = show;
      });
      if (!show) {
        el.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
          if (cb.checked) {
            cb.checked = false;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      }
    });
  }

  function togglePediatricOnly(group) {
    const isPediatric = group === 'pediatric';
    const isAdult = group === 'adult';
    toggleAgeScope('[data-pediatric-only]', group === null ? false : isPediatric);
    toggleAgeScope('[data-adult-only]', group === null ? false : isAdult);
  }

  dob.addEventListener('change', apply);
  dob.addEventListener('input', apply);
  apply();
})();

/* ---------- Gender + age -> HCG field visibility (Female, age >= 12) ---------- */
(function () {
  const genderSel = document.getElementById('gender');
  const hcgField = document.getElementById('hcg-field');
  const form = document.getElementById('preop-form');
  if (!genderSel || !hcgField || !form) return;

  function update() {
    const age = form.hasAttribute('data-patient-age') ? parseInt(form.getAttribute('data-patient-age'), 10) : null;
    const show = genderSel.value === 'Female' && age !== null && age >= 12;
    hcgField.hidden = !show;
  }

  genderSel.addEventListener('change', update);
  document.addEventListener('maps:age-group-change', update);
  update();
})();

/* ---------- Women's Health section -> Female, age > 13 ---------- */
(function () {
  const genderSel = document.getElementById('gender');
  const section = document.getElementById('womens-health-section');
  const form = document.getElementById('preop-form');
  if (!genderSel || !section || !form) return;

  function clearSection() {
    section.querySelectorAll('input[type="radio"]:checked').forEach((radio) => {
      radio.checked = false;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    });
    section.querySelectorAll('input[type="number"], input[type="text"]').forEach((field) => {
      field.value = '';
    });
  }

  function updateVisibility() {
    const age = form.hasAttribute('data-patient-age') ? parseInt(form.getAttribute('data-patient-age'), 10) : null;
    const show = genderSel.value === 'Female' && age !== null && age > 13;
    if (section.hidden === !show) return;
    section.hidden = !show;
    if (!show) clearSection();
  }

  genderSel.addEventListener('change', updateVisibility);
  document.addEventListener('maps:age-group-change', updateVisibility);
  updateVisibility();
})();

/* ---------- Women's Health: pregnancy status -> gestational age (PCA) reveal ---------- */
(function () {
  const radios = document.querySelectorAll('input[name="women_status"]');
  const pcaField = document.getElementById('womens-pca-field');
  if (!radios.length || !pcaField) return;

  function update() {
    const checked = document.querySelector('input[name="women_status"]:checked');
    const show = !!checked && checked.value === 'Pregnant or Possible Pregnancy';
    pcaField.hidden = !show;
  }

  radios.forEach((radio) => radio.addEventListener('change', update));
  update();
})();

/* ---------- Labs reviewed on EMR -> toggle manual lab entry ---------- */
(function () {
  const checkbox = document.getElementById('labs-reviewed-emr');
  const manual = document.getElementById('labs-manual-entry');
  if (!checkbox || !manual) return;
  const update = () => { manual.hidden = checkbox.checked; };
  checkbox.addEventListener('change', update);
  update();
})();

/* ---------- Generic Yes/No radio reveal (data-reveal-target) ----------
   Any radio with data-reveal-target="elementId" shows that element when
   the checked radio in its name-group has value "Yes", hides otherwise.
*/
(function () {
  const radios = document.querySelectorAll('input[type="radio"][data-reveal-target]');
  const groups = new Map();
  radios.forEach((radio) => {
    if (!groups.has(radio.name)) groups.set(radio.name, radio.getAttribute('data-reveal-target'));
  });
  groups.forEach((targetId, name) => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const update = () => {
      const checked = document.querySelector(`input[name="${name}"]:checked`);
      const show = !!checked && checked.value === 'Yes';
      target.hidden = !show;
    };
    document.querySelectorAll(`input[name="${name}"]`).forEach((r) => r.addEventListener('change', update));
    update();
  });
})();

/* ---------- Cardiac/imaging test click-to-reveal (click a test to add details) ---------- */
(function () {
  const testsByKey = {};

  function setTestActive(test, willOpen) {
    const toggle = test.querySelector('[data-cardiac-test-toggle]');
    const detail = test.querySelector('[data-cardiac-test-detail]');
    const status = test.querySelector('[data-cardiac-test-status]');
    if (!toggle || !detail) return;
    if (detail.hidden !== willOpen) return; // already in the desired state
    detail.hidden = !willOpen;
    test.classList.toggle('is-active', willOpen);
    toggle.setAttribute('aria-expanded', String(willOpen));
    if (status) status.textContent = willOpen ? 'Added' : 'N/A';
  }

  document.querySelectorAll('[data-cardiac-test]').forEach((test) => {
    const toggle = test.querySelector('[data-cardiac-test-toggle]');
    const detail = test.querySelector('[data-cardiac-test-detail]');
    if (!toggle || !detail) return;
    const key = test.getAttribute('data-cardiac-test-key');
    if (key) testsByKey[key] = test;
    toggle.addEventListener('click', () => {
      setTestActive(test, detail.hidden);
      if (key) syncLinkedCheckboxes(key);
    });
  });

  function isTestActive(test) {
    return test ? test.classList.contains('is-active') : false;
  }

  function linkedCheckboxes(key) {
    return Array.from(document.querySelectorAll(`[data-test-link="${key}"]`));
  }

  // When a test card's own toggle is clicked directly, keep its linked checklist checkbox(es) in sync.
  function syncLinkedCheckboxes(key) {
    const test = testsByKey[key];
    const boxes = linkedCheckboxes(key);
    if (!test || !boxes.length) return;
    const active = isTestActive(test);
    if (active) {
      if (!boxes.some((b) => b.checked)) boxes[0].checked = true;
    } else {
      boxes.forEach((b) => { b.checked = false; });
    }
  }

  // When a linked checklist checkbox is checked/unchecked, open or close its test card.
  document.querySelectorAll('[data-test-link]').forEach((box) => {
    const key = box.getAttribute('data-test-link');
    box.addEventListener('change', () => {
      const test = testsByKey[key];
      if (!test) return;
      const shouldBeOpen = linkedCheckboxes(key).some((b) => b.checked);
      setTestActive(test, shouldBeOpen);
    });
  });

  window.MapsCardiacTests = { testsByKey };
})();

/* ---------- Pacemaker/AICD interrogation-date reminder ---------- */
(function () {
  const procDateInput = document.getElementById('procedure-date');
  const pacerDateInput = document.getElementById('cardiac_pacer_date');
  const warning = document.querySelector('[data-pacer-interrogation-warning]');
  if (!procDateInput || !pacerDateInput || !warning) return;

  function check() {
    const procVal = procDateInput.value;
    const pacerVal = pacerDateInput.value;
    if (!procVal || !pacerVal) { warning.hidden = true; return; }
    const procDate = new Date(procVal + 'T00:00:00');
    const pacerDate = new Date(pacerVal + 'T00:00:00');
    if (isNaN(procDate.getTime()) || isNaN(pacerDate.getTime())) { warning.hidden = true; return; }
    const diffDays = (procDate - pacerDate) / (1000 * 60 * 60 * 24);
    warning.hidden = !(diffDays > 365);
  }

  procDateInput.addEventListener('change', check);
  procDateInput.addEventListener('input', check);
  pacerDateInput.addEventListener('change', check);
  pacerDateInput.addEventListener('input', check);
  check();
})();

/* ---------- Imaging repeater (simple add/remove rows) ----------
   Supports multiple independent repeater instances on the same page
   (e.g. the standing Imaging section and the RA-triggered Head/Neck
   imaging card each have their own [data-imaging-repeater]). ---------- */
(function () {
  document.querySelectorAll('[data-imaging-repeater]').forEach((repeater) => {
    const rowsWrap = repeater.querySelector('[data-imaging-repeater-rows]');
    const addBtn = repeater.querySelector('[data-imaging-repeater-add]');
    if (!rowsWrap || !addBtn) return;

    function resetFields(row) {
      row.querySelectorAll('input, select, textarea').forEach((el) => {
        if (el.tagName === 'SELECT') el.selectedIndex = 0;
        else el.value = '';
      });
    }

    function wireRow(row) {
      const removeBtn = row.querySelector('[data-imaging-row-remove]');
      if (!removeBtn) return;
      removeBtn.addEventListener('click', () => {
        const rows = rowsWrap.querySelectorAll('[data-imaging-row]');
        if (rows.length <= 1) {
          resetFields(row);
          return;
        }
        row.remove();
      });
    }

    function addRow() {
      const template = rowsWrap.querySelector('[data-imaging-row]');
      if (!template) return;
      const row = template.cloneNode(true);
      resetFields(row);
      wireRow(row);
      rowsWrap.appendChild(row);
    }

    rowsWrap.querySelectorAll('[data-imaging-row]').forEach(wireRow);
    addBtn.addEventListener('click', addRow);
  });
})();

/* ---------- Diagnosis / Procedure code repeater ----------
   Markup: <div class="code-repeater" data-code-repeater data-code-source="ICD10_CODES" data-field-name="dx">
             <div class="code-repeater__rows" data-code-repeater-rows>
               <div class="code-row" data-code-row>
                 <div class="code-search" data-code-search>
                   <input class="code-row__code-input" ...>
                   <div class="chip-field__suggestions" data-code-suggestions></div>
                 </div>
                 <input class="code-row__desc-input" ...>
                 <button data-code-row-remove>...</button>
               </div>
             </div>
             <button data-code-repeater-add>+ Add</button>
           </div>
*/
(function () {
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function wireRow(row, sourceList) {
    const codeInput = row.querySelector('.code-row__code-input');
    const descInput = row.querySelector('.code-row__desc-input');
    const suggestBox = row.querySelector('[data-code-suggestions]');
    const removeBtn = row.querySelector('[data-code-row-remove]');
    const repeater = row.closest('[data-code-repeater]');
    const rowsWrap = row.closest('[data-code-repeater-rows]');

    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        const rows = rowsWrap.querySelectorAll('[data-code-row]');
        if (rows.length <= 1) {
          if (codeInput) codeInput.value = '';
          if (descInput) descInput.value = '';
          return;
        }
        row.remove();
      });
    }

    if (!codeInput || !suggestBox || !sourceList || !sourceList.length) return;

    let activeIndex = -1;

    function closeSuggestions() {
      suggestBox.classList.remove('is-open');
      suggestBox.innerHTML = '';
      activeIndex = -1;
    }

    function openSuggestions(query) {
      const q = query.trim().toLowerCase();
      if (!q) { closeSuggestions(); return; }
      const matches = [];
      for (let i = 0; i < sourceList.length && matches.length < 25; i++) {
        const item = sourceList[i];
        if (item.code.toLowerCase().startsWith(q) || item.label.toLowerCase().includes(q)) matches.push(item);
      }
      if (!matches.length) { closeSuggestions(); return; }
      suggestBox.innerHTML = '';
      matches.forEach((item) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip-field__suggestion';
        btn.innerHTML = `<strong>${escapeHtml(item.code)}</strong> — ${escapeHtml(item.label)}`;
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          codeInput.value = item.code;
          if (descInput) descInput.value = item.label;
          closeSuggestions();
        });
        suggestBox.appendChild(btn);
      });
      suggestBox.classList.add('is-open');
      activeIndex = -1;
    }

    codeInput.addEventListener('input', () => openSuggestions(codeInput.value));
    codeInput.addEventListener('focus', () => { if (codeInput.value.trim()) openSuggestions(codeInput.value); });
    codeInput.addEventListener('blur', () => setTimeout(closeSuggestions, 120));
    codeInput.addEventListener('keydown', (e) => {
      const items = suggestBox.querySelectorAll('.chip-field__suggestion');
      if (e.key === 'ArrowDown' && items.length) {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, items.length - 1);
        items.forEach((el, i) => el.classList.toggle('is-active', i === activeIndex));
      } else if (e.key === 'ArrowUp' && items.length) {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        items.forEach((el, i) => el.classList.toggle('is-active', i === activeIndex));
      } else if (e.key === 'Enter' && activeIndex >= 0 && items[activeIndex]) {
        e.preventDefault();
        items[activeIndex].dispatchEvent(new MouseEvent('mousedown'));
      } else if (e.key === 'Escape') {
        closeSuggestions();
      }
    });
  }

  document.querySelectorAll('[data-code-repeater]').forEach((repeater) => {
    const sourceName = repeater.getAttribute('data-code-source');
    const sourceList = sourceName ? (window[sourceName] || []) : [];
    const rowsWrap = repeater.querySelector('[data-code-repeater-rows]');
    const addBtn = repeater.querySelector('[data-code-repeater-add]');
    const fieldName = repeater.getAttribute('data-field-name') || 'code';

    rowsWrap.querySelectorAll('[data-code-row]').forEach((row) => wireRow(row, sourceList));

    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const rows = rowsWrap.querySelectorAll('[data-code-row]');
        const template = rows[rows.length - 1];
        const clone = template.cloneNode(true);
        clone.querySelectorAll('input').forEach((inp) => { inp.value = ''; });
        const suggestBox = clone.querySelector('[data-code-suggestions]');
        if (suggestBox) suggestBox.innerHTML = '';
        rowsWrap.appendChild(clone);
        wireRow(clone, sourceList);
        const firstInput = clone.querySelector('.code-row__code-input');
        if (firstInput) firstInput.focus();
      });
    }
  });
})();

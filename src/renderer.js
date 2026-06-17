/* renderer.js */
'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let chart           = null;
let compactOn       = false;
let currentSource   = null;
let allData         = [];
let unsaved         = false;
let editingNodeId   = null;
let pendingDeleteId = null;
// Default cfg — used immediately on first render before loadConfig() resolves
const DEFAULT_CFG = {
  nodeWidth: 210, nodeHeight: 84, rootNodeHeight: 60,
  colorBarHeight: 10, borderColor: '#dddddd', borderRadius: 5,
  cardBackground: '#ffffff', nameTagBackground: '#e8e8e8',
  nameTagBorder: '#bbbbbb', positionFontSize: 13,
  positionFontWeight: '600', nameFontSize: 11,
  showPersonNames: true, childrenMargin: 44,
  compactMarginBetween: 15, compactMarginPair: 80,
};
let cfg = Object.assign({}, DEFAULT_CFG);   // visual config, overwritten by loadConfig()
let geditMode       = false;    // graphical edit mode

// ── Undo / Redo history ────────────────────────────────────────────────────
let undoStack = [];   // array of JSON snapshots (before each mutation)
let redoStack = [];

// ── DOM refs ───────────────────────────────────────────────────────────────
const orgSelect    = document.getElementById('orgSelect');
const sourceLabel  = document.getElementById('source-label');
const emptyState   = document.getElementById('empty-state');
const btnReload    = document.getElementById('btn-reload');
const unsavedBadge = document.getElementById('unsaved-badge');
const btnOverwrite = document.getElementById('btn-save-overwrite');
const urlModal     = new bootstrap.Modal(document.getElementById('urlModal'));
const nodeModal    = new bootstrap.Modal(document.getElementById('nodeModal'));
const deleteModal  = new bootstrap.Modal(document.getElementById('deleteModal'));
const settingsModal= new bootstrap.Modal(document.getElementById('settingsModal'));
const validationModal = new bootstrap.Modal(document.getElementById('validationModal'));
const urlInput     = document.getElementById('urlInput');
const urlError     = document.getElementById('url-error');


// ══════════════════════════════════════════════════════════════════════════════
// i18n ENGINE
// ══════════════════════════════════════════════════════════════════════════════

let _strings = {};
let _lang='en';
//_lang = window.electronAPI.detectLanguage();
console.log(_lang);
// Resolve a dot-notation key from the strings object
function t(key, vars = {}) {
  const parts = key.split('.');
  let val = _strings;
  for (const p of parts) {
    if (val == null) break;
    val = val[p];
  }
  if (typeof val !== 'string') return key;   // fallback: show the key
  // Replace {placeholder} tokens
  return val.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : '{' + k + '}'));
}

// Apply translations to all data-i18n / data-i18n-title / data-i18n-placeholder elements
function applyI18nToDom() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  // Search input placeholder
  document.getElementById('search-input').placeholder = t('toolbar.searchPlaceholder');
  // Source label default
  if (sourceLabel.textContent === 'No file loaded' || sourceLabel.textContent === t('toolbar.noFileLoaded')) {
    sourceLabel.textContent = t('toolbar.noFileLoaded');
  }
  // orgSelect placeholder option
  const placeholderOpt = orgSelect.querySelector('option[value=""]');
  if (placeholderOpt) placeholderOpt.textContent = t('orgSelect.placeholder');
  // Settings modal dynamic labels
  applySettingsLabels();
  // Node modal color options
  applyColorLabels();
  // Editor table headers
  applyEditorHeaders();
  // Tiled modal options
  applyTiledLabels();
  // Document title
  document.title = t('app.title');
}

function applySettingsLabels() {
  const labels = {
    'cfg-nodeWidth':            'settingsModal.nodeWidth',
    'cfg-nodeHeight':           'settingsModal.nodeHeight',
    'cfg-rootNodeHeight':       'settingsModal.rootNodeHeight',
    'cfg-colorBarHeight':       'settingsModal.colorBarHeight',
    'cfg-childrenMargin':       'settingsModal.childrenMargin',
    'cfg-compactMarginBetween': 'settingsModal.compactMarginBetween',
    'cfg-compactMarginPair':    'settingsModal.compactMarginPair',
    'cfg-borderRadius':         'settingsModal.borderRadius',
    'cfg-positionFontSize':     'settingsModal.positionFontSize',
    'cfg-nameFontSize':         'settingsModal.nameFontSize',
    'cfg-cardBackground':       'settingsModal.cardBackground',
    'cfg-borderColor':          'settingsModal.borderColor',
    'cfg-nameTagBackground':    'settingsModal.nameTagBackground',
    'cfg-nameTagBorder':        'settingsModal.nameTagBorder',
  };
  Object.entries(labels).forEach(([inputId, key]) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    const label = input.closest('.cfg-row')?.querySelector('label');
    if (label) label.childNodes[0].textContent = t(key) + ' ';
  });
  // Section headers
  document.querySelectorAll('.cfg-section[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  // Font weight options
  const fw = document.getElementById('cfg-positionFontWeight');
  if (fw) {
    fw.options[0].textContent = t('settingsModal.fontWeightNormal');
    fw.options[1].textContent = t('settingsModal.fontWeightSemibold');
    fw.options[2].textContent = t('settingsModal.fontWeightBold');
  }
  // Buttons
  const resetBtn = document.getElementById('btn-cfg-reset');
  if (resetBtn) resetBtn.innerHTML = '<i class="bi bi-arrow-counterclockwise me-1"></i>' + t('settingsModal.resetDefaults');
  const saveBtn = document.getElementById('btn-cfg-save');
  if (saveBtn) saveBtn.innerHTML = '<i class="bi bi-check2 me-1"></i>' + t('settingsModal.applyAndSave');
  const cBtn = document.getElementById('btn-cfg-cancel');
  if (cBtn) cBtn.innerHTML = t('settingsModal.cancel');
}

function applyColorLabels() {
  const colorMap = {
    'orange': 'nodeModal.colors.orange',
    'cyan':   'nodeModal.colors.cyan',
    'green':  'nodeModal.colors.green',
    'blue':   'nodeModal.colors.blue',
    'steelblue': 'nodeModal.colors.steelblue',
    'coral':  'nodeModal.colors.coral',
    'mediumpurple': 'nodeModal.colors.mediumpurple',
    '#e74c3c': 'nodeModal.colors.red',
    '#2ecc71': 'nodeModal.colors.emerald',
    '#9b59b6': 'nodeModal.colors.violet',
    'gray':   'nodeModal.colors.gray',
    'custom': 'nodeModal.colors.custom',
  };
  const sel = document.getElementById('nf-color');
  if (!sel) return;
  Array.from(sel.options).forEach(opt => {
    const key = colorMap[opt.value];
    if (key) opt.textContent = t(key);
  });
}

function applyEditorHeaders() {
  const headers = document.querySelectorAll('#editor-table th');
  const keys = ['editor.colId','editor.colPosition','editor.colPerson',
                 'editor.colParent','editor.colManager','editor.colActions'];
  headers.forEach((th, i) => { if (keys[i]) th.textContent = t(keys[i]); });
}

function applyTiledLabels() {
  const paper = document.getElementById('tile-paper');
  if (paper) {
    paper.options[0].textContent = t('tiledModal.papers.a4');
    paper.options[1].textContent = t('tiledModal.papers.a3');
    paper.options[2].textContent = t('tiledModal.papers.letter');
  }
  const orient = document.getElementById('tile-orient');
  if (orient) {
    orient.options[0].textContent = t('tiledModal.landscape');
    orient.options[1].textContent = t('tiledModal.portrait');
  }
  const fmt = document.getElementById('tile-format');
  if (fmt) {
    fmt.options[0].textContent = t('tiledModal.formatPdf');
    fmt.options[1].textContent = t('tiledModal.formatPng');
  }
  const lbl = document.getElementById('tile-labels');
  if (lbl) {
    lbl.options[0].textContent = t('tiledModal.labelsShow');
    lbl.options[1].textContent = t('tiledModal.labelsHide');
  }
}

async function loadI18n() {
  _lang = await window.electronAPI.detectLanguage();
  const result = await window.electronAPI.setLanguage(_lang);
  _strings = result.strings;
  const sel = document.getElementById('cfg-language');
  if (sel) sel.value = _lang;
  applyI18nToDom();
}

async function switchLanguage(lang) {
  const result = await window.electronAPI.setLanguage(lang);
  _lang    = result.lang;
  _strings = result.strings;
  applyI18nToDom();
  showToast(t('settingsModal.applyAndSave'));
}
`
        + t('settingsModal.samplePerson') +`
// Language selector in settings modal
document.getElementById('cfg-language').addEventListener('change', function() {
  switchLanguage(this.value);
});

// ══════════════════════════════════════════════════════════════════════════════
// VISUAL CONFIG
// ══════════════════════════════════════════════════════════════════════════════

async function loadConfig() {
  try {
    const loaded = await window.electronAPI.loadConfig();
    cfg = Object.assign({}, DEFAULT_CFG, loaded);   // merge so no key is ever undefined
  } catch(e) {
    console.warn('loadConfig failed, using defaults:', e);
    cfg = Object.assign({}, DEFAULT_CFG);
  }
}

// ── Settings modal: populate controls from cfg ─────────────────────────────
function cfgToUI() {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = val;
  };
  const setVal = (id, val) => {
    const el = document.getElementById(id + '-val');
    if (el) el.textContent = val;
  };

  const sliders = ['nodeWidth','nodeHeight','rootNodeHeight','colorBarHeight',
                   'childrenMargin','compactMarginBetween','compactMarginPair',
                   'borderRadius','positionFontSize','nameFontSize'];
  sliders.forEach(k => { set('cfg-'+k, cfg[k]); setVal('cfg-'+k, cfg[k]); });

  set('cfg-cardBackground',    cfg.cardBackground);
  set('cfg-borderColor',       cfg.borderColor);
  set('cfg-nameTagBackground', cfg.nameTagBackground);
  set('cfg-nameTagBorder',     cfg.nameTagBorder);
  set('cfg-positionFontWeight',cfg.positionFontWeight);
  document.getElementById('cfg-showPersonNames').checked = cfg.showPersonNames;

  updatePreview();
}

// ── Read UI controls into a config object ──────────────────────────────────
function uiToCfg() {
  const num = id => +document.getElementById(id).value;
  const str = id => document.getElementById(id).value;
  return {
    nodeWidth:            num('cfg-nodeWidth'),
    nodeHeight:           num('cfg-nodeHeight'),
    rootNodeHeight:       num('cfg-rootNodeHeight'),
    colorBarHeight:       num('cfg-colorBarHeight'),
    borderColor:          str('cfg-borderColor'),
    borderRadius:         num('cfg-borderRadius'),
    cardBackground:       str('cfg-cardBackground'),
    nameTagBackground:    str('cfg-nameTagBackground'),
    nameTagBorder:        str('cfg-nameTagBorder'),
    positionFontSize:     num('cfg-positionFontSize'),
    positionFontWeight:   str('cfg-positionFontWeight'),
    nameFontSize:         num('cfg-nameFontSize'),
    showPersonNames:      document.getElementById('cfg-showPersonNames').checked,
    childrenMargin:       num('cfg-childrenMargin'),
    compactMarginBetween: num('cfg-compactMarginBetween'),
    compactMarginPair:    num('cfg-compactMarginPair'),
  };
}

// ── Live preview box ───────────────────────────────────────────────────────
function updatePreview() {
  const c = uiToCfg();
  const preview = document.getElementById('cfg-preview');
  const w = Math.min(c.nodeWidth, 220);
  const h = c.nodeHeight;
  const nameLine = c.showPersonNames
    ? `<div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);
        width:${w-24}px;background:${c.nameTagBackground};border:1px solid ${c.nameTagBorder};
        border-radius:3px;padding:2px 6px;font-size:${c.nameFontSize}px;color:#444;white-space:nowrap;overflow:hidden;">`
        + t('settingsModal.samplePerson') +`</div>` : '';
  preview.innerHTML = `
    <div style="position:relative;width:${w}px;height:${h+20}px;display:flex;align-items:flex-start;">
      <div style="width:${w}px;height:${h}px;background:${c.cardBackground};
        border:1px solid ${c.borderColor};border-radius:${c.borderRadius}px;overflow:visible;position:relative;">
        <div style="background:steelblue;height:${c.colorBarHeight}px;border-radius:${c.borderRadius}px ${c.borderRadius}px 0 0;"></div>
        <div style="padding:4px 8px;">
          <div style="font-size:${c.positionFontSize}px;font-weight:${c.positionFontWeight};color:#333;">`
        + t('settingsModal.samplePosition') +`</div>
        </div>
        ${nameLine}
      </div>
    </div>`;
}

// ── Wire all range sliders to live-update val label and preview ────────────
document.querySelectorAll('#settingsModal input[type=range]').forEach(el => {
  el.addEventListener('input', () => {
    const valEl = document.getElementById(el.id + '-val');
    if (valEl) valEl.textContent = el.value;
    updatePreview();
  });
});
document.querySelectorAll('#settingsModal input[type=color], #settingsModal select, #settingsModal input[type=checkbox]')
  .forEach(el => el.addEventListener('change', updatePreview));

document.getElementById('btn-settings').addEventListener('click', () => {
  cfgToUI();
  settingsModal.show();
});

document.getElementById('btn-cfg-save').addEventListener('click', async () => {
  cfg = uiToCfg();
  await window.electronAPI.saveConfig(cfg);
  settingsModal.hide();
  rebuildChart();
  showToast(t('toast.configSaved'));
});

document.getElementById('btn-cfg-reset').addEventListener('click', async () => {
  cfg = await window.electronAPI.resetConfig();
  cfgToUI();
  showToast(t('toast.configReset'));
});

window.electronAPI.onMenuSettings(() => { cfgToUI(); settingsModal.show(); });

// ══════════════════════════════════════════════════════════════════════════════
// UNDO / REDO
// ══════════════════════════════════════════════════════════════════════════════

function snapshotForUndo() {
  undoStack.push(JSON.stringify(allData));
  if (undoStack.length > 50) undoStack.shift();   // cap at 50 steps
  redoStack = [];                                  // new action clears redo
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  document.getElementById('btn-undo').disabled = undoStack.length === 0;
  document.getElementById('btn-redo').disabled = redoStack.length === 0;
}

function applyUndo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(allData));
  allData = JSON.parse(undoStack.pop());
  updateUndoRedoButtons();
  markUnsaved(true);
  refreshEditorTable();
  renderOrg(orgSelect.value);
  showToast(t('toast.undone'));
}

function applyRedo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(allData));
  allData = JSON.parse(redoStack.pop());
  updateUndoRedoButtons();
  markUnsaved(true);
  refreshEditorTable();
  renderOrg(orgSelect.value);
  showToast(t('toast.redone'));
}

document.getElementById('btn-undo').addEventListener('click', applyUndo);
document.getElementById('btn-redo').addEventListener('click', applyRedo);

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); applyUndo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); applyRedo(); }
});

// ══════════════════════════════════════════════════════════════════════════════
// CSV VALIDATION
// ══════════════════════════════════════════════════════════════════════════════

function validateData(data) {
  const issues = [];   // { level: 'error'|'warning', category, message }

  const ids      = data.map(d => d.id);
  const idSet    = new Set();
  const orgRoots = {};   // orgName -> count of root nodes

  data.forEach(d => {
    // Duplicate IDs
    if (idSet.has(d.id)) {
      issues.push({ level:'error', category:t('validationModal.categories.duplicateId'),
        message: `ID ${d.id} appears more than once` });
    }
    idSet.add(d.id);

    // Missing required fields
    if (!d.positionName || String(d.positionName).trim() === '') {
      issues.push({ level:'error', category:t('validationModal.categories.missingField'), message: t('validationModal.messages.missingPositionName', { id: d.id }) });
    }
    if (!d.org || String(d.org).trim() === '') {
      issues.push({ level:'error', category:t('validationModal.categories.missingField'), message: t('validationModal.messages.missingOrg', { id: d.id }) });
    }

    // Orphan nodes (parent exists in CSV at all?)
    if (d.parentId && !ids.includes(d.parentId)) {
      issues.push({ level:'error', category:t('validationModal.categories.orphanNode'),
        message: `"${d.positionName}" (ID ${d.id}) references missing parent ID ${d.parentId}` });
    }

    // ID in wrong org block (e.g. PVM node with ID 2050)
    if (isRootNode(d.id)) {
      orgRoots[d.org] = (orgRoots[d.org] || 0) + 1;
    } else if (d.parentId) {
      // Find root of this org
      const orgRoot = data.find(r => r.org === d.org && isRootNode(r.id));
      if (orgRoot) {
        const base    = Math.floor(orgRoot.id / 1000) * 1000;
        if (d.id < base || d.id >= base + 1000) {
          issues.push({ level:'warning', category:t('validationModal.categories.idOutOfRange'),
            message: `"${d.positionName}" (ID ${d.id}) is outside its org block ${base}–${base+999}` });
        }
      }
    }
  });

  // Orgs with multiple roots
  Object.entries(orgRoots).forEach(([org, count]) => {
    if (count > 1)
      issues.push({ level:'warning', category:t('validationModal.categories.multipleRoots'),
        message: `Org "${org}" has ${count} root nodes (id % 1000 === 0)` });
  });

  // Orgs with no root at all
  const orgs = Array.from(new Set(data.map(d => d.org).filter(Boolean)));
  orgs.forEach(org => {
    if (!data.some(d => d.org === org && isRootNode(d.id)))
      issues.push({ level:'warning', category:t('validationModal.categories.noRootNode'),
        message: `Org "${org}" has no root node (id % 1000 === 0)` });
  });

  return issues;
}

function showValidationReport(issues) {
  const errors   = issues.filter(i => i.level === 'error');
  const warnings = issues.filter(i => i.level === 'warning');

  const body = document.getElementById('validation-body');
  const summary = document.getElementById('validation-summary');

  summary.textContent = `${errors.length} error(s), ${warnings.length} warning(s)`;

  const renderGroup = (list, level) => {
    if (!list.length) return '';
    const color  = level === 'error' ? '#c0392b' : '#a67c00';
    const bgColor= level === 'error' ? '#fdf0f0' : '#fffbf0';
    const icon   = level === 'error' ? 'bi-x-circle-fill' : 'bi-exclamation-triangle-fill';

    // Group by category
    const byCategory = {};
    list.forEach(i => { (byCategory[i.category] = byCategory[i.category]||[]).push(i); });

    return Object.entries(byCategory).map(([cat, items]) => `
      <div style="margin-bottom:12px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;
          color:${color};margin-bottom:4px;">
          <i class="bi ${icon} me-1"></i>${cat}
        </div>
        ${items.map(i => `
          <div style="background:${bgColor};border:1px solid ${color}33;border-radius:4px;
            padding:5px 10px;font-size:12px;margin-bottom:3px;color:#333;">
            ${i.message}
          </div>`).join('')}
      </div>`).join('');
  };

  body.innerHTML = renderGroup(errors, 'error') + renderGroup(warnings, 'warning')
    || `<p style="color:#666;font-size:13px;">${t('validationModal.noIssues')}</p>`;

  validationModal.show();
}

// ── Custom color picker in node modal ─────────────────────────────────────
document.getElementById('nf-color').addEventListener('change', function() {
  document.getElementById('nf-color-custom').style.display =
    this.value === 'custom' ? '' : 'none';
});

function getSelectedNodeColor() {
  const sel = document.getElementById('nf-color').value;
  return sel === 'custom' ? document.getElementById('nf-color-custom').value : sel;
}

// ══════════════════════════════════════════════════════════════════════════════
// ID SCHEME  (org root = N*1000, members = N*1000 + offset)
// ══════════════════════════════════════════════════════════════════════════════

function isRootNode(id) {
  return id % 1000 === 0;
}

// Find the org root ID for a given org name
function orgRootId(orgName) {
  const root = allData.find(d => d.org === orgName && isRootNode(d.id));
  return root ? root.id : null;
}

// Next available member ID within an org (root + highest offset + 1)
function nextMemberId(orgName) {
  const rootId = orgRootId(orgName);
  if (!rootId) return null;
  const base = Math.floor(rootId / 1000) * 1000;
  const used = allData
    .filter(d => d.org === orgName && !isRootNode(d.id))
    .map(d => d.id - base)
    .filter(offset => offset > 0 && offset < 1000);
  return base + (used.length ? Math.max(...used) + 1 : 1);
}

// ══════════════════════════════════════════════════════════════════════════════
// CHART RENDERING
// ══════════════════════════════════════════════════════════════════════════════

function buildNodeContent(d) {
  const id         = +d.data.id;
  const personText = (cfg.showPersonNames && d.data.person)
    ? d.data.person.replace(/[;]/g, '<br/>') : '';
  const isRoot     = isRootNode(id);

  // ── Root / org header node ────────────────────────────────────────────────
  if (isRoot) {
    return `
      <div style="height:${d.height}px;background:${cfg.cardBackground};
        border:1px solid ${cfg.borderColor};border-radius:${cfg.borderRadius}px;
       position:relative;" data-nodeid="${id}">
        <div style="background:${d.data.color};height:${cfg.colorBarHeight}px;"></div>
        <div style="display:flex;align-items:center;justify-content:center;
          height:calc(100% - ${cfg.colorBarHeight}px);padding:0 6px;text-align:center;">
          <div class="node-editable node-pos"
            data-nodeid="${id}" data-field="positionName"
            style="font-size:${cfg.positionFontSize+2}px;font-weight:700;color:#333;
              padding:2px 4px;border-radius:2px;cursor:default;">
            ${d.data.positionName}
          </div>
        </div>
        <button class="node-gedit-btn node-btn-add" data-nodeid="${id}" 
          data-action="add" title="`+t('gedit.addChildNode')+`"><i class="bi bi-node-plus"></i></button>
      </div>`;
  }

  // ── Regular node ──────────────────────────────────────────────────────────
  return `
    <div style="height:${d.height}px;background:${cfg.cardBackground};
      border:1px solid ${cfg.borderColor};border-radius:${cfg.borderRadius}px;
      overflow:visible;position:relative;" data-nodeid="${id}">
      <div style="background:${d.data.color};height:${cfg.colorBarHeight}px;
        border-radius:${cfg.borderRadius}px ${cfg.borderRadius}px 0 0;"></div>
      <div style="padding:4px 8px;">
        <div class="node-editable node-pos"
          data-nodeid="${id}" data-field="positionName"
          style="font-size:${cfg.positionFontSize}px;font-weight:${cfg.positionFontWeight};
            color:#333;line-height:1.3;padding:1px 3px;border-radius:2px;cursor:default;">
          ${d.data.positionName}
        </div>
      </div>
      ${cfg.showPersonNames ? `
      <div style="position:absolute;top:100%;left:50%;transform:translate(-50%,-28px);
        width:${d.width-40}px;
        background:${cfg.nameTagBackground};border:1px solid ${cfg.nameTagBorder};
        border-radius:3px;padding:2px 4px;
        font-size:${cfg.nameFontSize}px;line-height:1.4;text-align:left;color:#444;z-index:10;">
        <div class="node-editable node-person"
          data-nodeid="${id}" data-field="person"
          style="padding:1px 2px;border-radius:2px;cursor:default;min-height:14px;">
          ${personText || '<span style="color:#bbb;font-size:10px;">—</span>'}
        </div>
      </div>` : ''}
      <button class="node-gedit-btn node-btn-del" data-nodeid="${id}"
        data-action="del" title="`+t('gedit.deleteNode')+`"><i class="bi bi-node-minus"></i></button>
      <button class="node-gedit-btn node-btn-add" data-nodeid="${id}"
        data-action="add" title="`+t('gedit.addChildNode')+`"><i class="bi bi-node-plus"></i></button>
    </div>`;
}

function initChart() {
  chart = new d3.OrgChart()
    .container('#chart-container')
    .nodeWidth(() => cfg.nodeWidth)
    .nodeHeight(d => isRootNode(+d.data.id) ? cfg.rootNodeHeight : cfg.nodeHeight)
    .childrenMargin(() => cfg.childrenMargin)
    .compactMarginBetween(() => cfg.compactMarginBetween)
    .compactMarginPair(() => cfg.compactMarginPair)
    .nodeContent(buildNodeContent)
    .onNodeClick(d => handleNodeClick(d.data.id));
}

function rebuildChart() {
  // Destroy and recreate chart with new config, re-render current org
  chart = null;
  const org = orgSelect.value;
  if (org) renderOrg(org);
}

// renderOrg defined in SEARCH & HIGHLIGHT section below

// ══════════════════════════════════════════════════════════════════════════════
// CSV PARSE / SERIALISE
// ══════════════════════════════════════════════════════════════════════════════

function parseAndRender(csvText, sourceDescription) {
  console.log('parseAndRender called, length:', csvText?.length, 'source:', sourceDescription);
  const cleanCsv = csvText.replace(/^\uFEFF/, '');
  let data;
  try { data = d3.csvParse(cleanCsv); }
  catch (e) { showToast(t('toast.errorPrefix', { error: 'Parse error: ' + e.message }), true); return; }
  if (!data || !data.length) { showToast(t('toast.errorPrefix', { error: 'CSV appears empty or malformed' }), true); return; }

  data.forEach(d => {
    d.id       = +d.id;
    d.parentId = d.parentId ? +d.parentId : null;
  });

  // Validate: warn about orphan nodes
  const ids = new Set(data.map(d => d.id));
  const orphans = data.filter(d => d.parentId && !ids.has(d.parentId));
  if (orphans.length)
    showToast(t('toast.orgValidationWarning', { count: orphans.length }), true);

  allData = data;
  markUnsaved(false);
  undoStack = [];  redoStack = [];  updateUndoRedoButtons();

  // Run validation — only block with modal for errors, warnings just toast
  const issues = validateData(data);
  const errors  = issues.filter(i => i.level === 'error');
  const warnings = issues.filter(i => i.level === 'warning');
  if (errors.length) {
    showValidationReport(issues);   // modal for real errors
  } else if (warnings.length) {
    showToast(`${warnings.length} validation warning(s) — check editor for details`, false);
  }

  refreshOrgSelectDropdown();
  const orgs = Array.from(new Set(data.map(d => d.org).filter(Boolean)));

  sourceLabel.textContent = sourceDescription;
  emptyState.classList.add('hidden');
  btnReload.style.display = '';

  if (orgs.length > 0) {
    orgSelect.value = orgs[0];
    renderOrg(orgs[0]);
  }

  refreshEditorTable();
  showToast(t('toast.loaded', { rows: data.length, orgs: orgs.length }));
}

function dataToCSV() {
  const cols = ['org','id','person','positionName','parentId','Mgr','color'];
  const escape = v => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(','), ...allData.map(d => cols.map(c => escape(d[c])).join(','))].join('\r\n');
}

// ══════════════════════════════════════════════════════════════════════════════
// EDITOR TABLE
// ══════════════════════════════════════════════════════════════════════════════

function markUnsaved(state) {
  unsaved = state;
  unsavedBadge.style.display = state ? '' : 'none';
}

function refreshEditorTable() {
  const org   = orgSelect.value;
  const tbody = document.getElementById('editor-tbody');
  tbody.innerHTML = '';
  const rows  = allData.filter(d => d.org === org);

  rows.forEach(d => {
    const parentNode  = allData.find(p => p.id === d.parentId);
    const parentLabel = parentNode ? parentNode.positionName : (d.parentId ? `#${d.parentId}` : '—');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-id" style="font-family:monospace;">${d.id}</td>
      <td class="col-pos" title="${d.positionName}">${d.positionName}</td>
      <td class="col-person" title="${d.person||''}">${d.person||'<span style="color:#bbb">—</span>'}</td>
      <td class="col-parent" title="${parentLabel}">${parentLabel}</td>
      <td class="col-mgr">${+d.Mgr ? '<i class="bi bi-check2" style="color:#1a6"></i>' : ''}</td>
      <td class="col-actions">
        <button class="btn-row-edit"   data-id="${d.id}" title="`+ t('editor.editNode') +`"><i class="bi bi-pencil"></i></button>
        <button class="btn-row-delete" data-id="${d.id}" title="`+ t('editor.deleteNode') +`"><i class="bi bi-trash3"></i></button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-row-edit').forEach(b =>
    b.addEventListener('click', () => openEditModal(+b.dataset.id)));
  tbody.querySelectorAll('.btn-row-delete').forEach(b =>
    b.addEventListener('click', () => openDeleteConfirm(+b.dataset.id)));
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE MODAL
// ══════════════════════════════════════════════════════════════════════════════

// Convert a CSS named color to hex using a temporary canvas context
// so the <input type=color> (which only accepts hex) is always populated correctly
function namedColorToHex(color) {
  if (!color) return '#888888';
  if (color.startsWith('#')) return color;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = color;        // browser resolves the name
    const resolved = ctx.fillStyle; // always returns hex or rgb(...)
    if (resolved.startsWith('#')) return resolved;
    // rgb(r, g, b) → #rrggbb
    const m = resolved.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (m) return '#' + [m[1],m[2],m[3]].map(n => (+n).toString(16).padStart(2,'0')).join('');
  } catch(_) {}
  return '#888888';
}

function populateParentDropdown(org, currentParentId, excludeId) {
  const sel = document.getElementById('nf-parent');
  sel.innerHTML = '';

  const excluded = new Set();
  if (excludeId != null) {
    excluded.add(excludeId);
    const queue = [excludeId];
    while (queue.length) {
      const cur = queue.shift();
      allData.filter(d => d.parentId === cur).forEach(d => {
        excluded.add(d.id); queue.push(d.id);
      });
    }
  }

  const managers = allData.filter(d => d.org === org && +d.Mgr === 1 && !excluded.has(d.id));
  if (!managers.length) {
    sel.appendChild(Object.assign(document.createElement('option'),
      { value: '', textContent: t('nodeModal.noManagersAvailable') }));
    return;
  }
  managers.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `[${m.id}] ${m.positionName}${m.person ? ' — '+m.person.split(';')[0] : ''}`;
    if (m.id === currentParentId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function openEditModal(id) {
  const node = allData.find(d => d.id === id);
  if (!node) return;
  editingNodeId = id;

  document.getElementById('nodeModalTitle').textContent = t('nodeModal.editTitle');
  document.getElementById('nf-id').value       = node.id;
  document.getElementById('nf-position').value = node.positionName;
  document.getElementById('nf-person').value   = node.person || '';
  document.getElementById('nf-mgr').checked    = +node.Mgr === 1;
  document.getElementById('node-modal-error').style.display = 'none';

  // Color: try to match preset, else fall back to custom picker
  const colorSel    = document.getElementById('nf-color');
  const colorCustom = document.getElementById('nf-color-custom');
  const nodeColor   = (node.color || '').trim();
  const presets     = Array.from(colorSel.options).map(o => o.value).filter(v => v !== 'custom');

  // Always keep custom input in sync so getSelectedNodeColor() has the right value
  // Convert named colors to hex for the color input (it only accepts hex)
  colorCustom.value = namedColorToHex(nodeColor) || '#888888';

  if (presets.includes(nodeColor)) {
    colorSel.value = nodeColor;
    colorCustom.style.display = 'none';
  } else {
    colorSel.value = 'custom';
    colorCustom.style.display = '';
  }

  populateParentDropdown(node.org, node.parentId, id);
  nodeModal.show();
}

function openAddModal() {
  const org = orgSelect.value;
  if (!org) { showToast(t('toast.selectOrgFirst'), true); return; }
  editingNodeId = null;

  const newId = nextMemberId(org);
  if (!newId) { showToast(t('nodeModal.errorCannotDetermineId'), true); return; }

  document.getElementById('nodeModalTitle').textContent = t('nodeModal.addTitle');
  document.getElementById('nf-id').value       = newId;
  document.getElementById('nf-position').value = '';
  document.getElementById('nf-person').value   = '';
  document.getElementById('nf-mgr').checked    = false;
  document.getElementById('node-modal-error').style.display = 'none';
  document.getElementById('nf-color-custom').style.display = 'none';

  const firstInOrg = allData.find(d => d.org === org);
  document.getElementById('nf-color').value = firstInOrg ? firstInOrg.color : 'orange';

  populateParentDropdown(org, null, null);
  nodeModal.show();
}

document.getElementById('btn-node-save').addEventListener('click', () => {
  const position = document.getElementById('nf-position').value.trim();
  const person   = document.getElementById('nf-person').value.trim();
  const parentId = +document.getElementById('nf-parent').value || null;
  const color    = getSelectedNodeColor();
  const mgr      = document.getElementById('nf-mgr').checked ? 1 : 0;
  const errEl    = document.getElementById('node-modal-error');

  if (!position) { errEl.textContent = t('nodeModal.errorPositionRequired'); errEl.style.display = ''; return; }
  if (!parentId) { errEl.textContent = t('nodeModal.errorParentRequired'); errEl.style.display = ''; return; }
  errEl.style.display = 'none';

  const org = orgSelect.value;
  snapshotForUndo();
  if (editingNodeId != null) {
    const node = allData.find(d => d.id === editingNodeId);
    if (node) Object.assign(node, { positionName: position, person, parentId, color, Mgr: mgr });
  } else {
    const newId = +document.getElementById('nf-id').value;
    allData.push({ org, id: newId, person, positionName: position, parentId, Mgr: mgr, color });
  }

  nodeModal.hide();
  markUnsaved(true);
  refreshEditorTable();
  renderOrg(org);
});

// ══════════════════════════════════════════════════════════════════════════════
// DELETE
// ══════════════════════════════════════════════════════════════════════════════

function openDeleteConfirm(id) {
  const node = allData.find(d => d.id === id);
  if (!node) return;
  pendingDeleteId = id;

  const children   = allData.filter(d => d.parentId === id);
  const parentNode = allData.find(d => d.id === node.parentId);
  let msg = `Delete "<strong>${node.positionName}</strong>"?`;
  if (children.length) {
    const pl = parentNode ? `"${parentNode.positionName}"` : 'the root';
    msg += `<br><br><span style="color:#a60">${children.length} child(ren) will be reassigned to ${pl}.</span>`;
  }
  document.getElementById('delete-msg').innerHTML = msg;
  deleteModal.show();
}

document.getElementById('btn-delete-confirm').addEventListener('click', () => {
  if (pendingDeleteId == null) return;
  const node = allData.find(d => d.id === pendingDeleteId);
  if (!node) { deleteModal.hide(); return; }
  snapshotForUndo();
  allData.forEach(d => { if (d.parentId === pendingDeleteId) d.parentId = node.parentId; });
  allData = allData.filter(d => d.id !== pendingDeleteId);
  deleteModal.hide();
  pendingDeleteId = null;
  markUnsaved(true);
  refreshEditorTable();
  renderOrg(orgSelect.value);
  showToast(t('toast.nodeDeleted'));
});

// ══════════════════════════════════════════════════════════════════════════════
// SAVE CSV
// ══════════════════════════════════════════════════════════════════════════════

document.getElementById('btn-save-csv').addEventListener('click', async () => {
  const result = await window.electronAPI.saveFile(dataToCSV());
  if (result.canceled) return;
  if (result.error)    { showToast(t('toast.saveError', { error: result.error }), true); return; }
  currentSource = { type: 'file', value: result.filePath };
  sourceLabel.textContent = result.filePath.split(/[/\\]/).pop();
  btnOverwrite.style.display = '';
  markUnsaved(false);
  showToast(t('toast.saved', { filename: result.filePath.split(/[/\\]/).pop() }));
});

document.getElementById('btn-save-overwrite').addEventListener('click', async () => {
  if (!currentSource || currentSource.type !== 'file') return;
  const result = await window.electronAPI.saveFileOverwrite(currentSource.value, dataToCSV());
  if (result.error) {
    showToast(t('toast.overwriteFailed', { error: result.error }), true);
    setTimeout(async () => {
      const r2 = await window.electronAPI.saveFile(dataToCSV());
      if (r2.canceled) return;
      if (r2.error)    { showToast(t('toast.saveError', { error: r2.error }), true); return; }
      currentSource = { type: 'file', value: r2.filePath };
      sourceLabel.textContent = r2.filePath.split(/[/\\]/).pop();
      markUnsaved(false);
      showToast(t('toast.saved', { filename: r2.filePath.split(/[/\\]/).pop() }));
    }, 1500);
    return;
  }
  markUnsaved(false);
  showToast(t('toast.overwritten', { filename: currentSource.value.split(/[/\\]/).pop() }));
});

// ══════════════════════════════════════════════════════════════════════════════
// EDITOR PANEL TOGGLE
// ══════════════════════════════════════════════════════════════════════════════

function toggleEditor(forceOpen) {
  const panel  = document.getElementById('editor-panel');
  const isOpen = panel.classList.contains('open');
  const open   = forceOpen !== undefined ? forceOpen : !isOpen;
  panel.classList.toggle('open', open);
  document.getElementById('btn-editor').classList.toggle('active', open);
  if (open) refreshEditorTable();
}

document.getElementById('btn-editor').addEventListener('click', () => toggleEditor());
document.getElementById('btn-editor-close').addEventListener('click', () => toggleEditor(false));
document.getElementById('btn-add-node').addEventListener('click', openAddModal);

// ══════════════════════════════════════════════════════════════════════════════
// FILE LOADING
// ══════════════════════════════════════════════════════════════════════════════

async function openLocalFile() {
  const result = await window.electronAPI.openFile();
  if (result.canceled) return;
  if (result.error)    { showToast(t('toast.errorPrefix', { error: result.error }), true); return; }
  currentSource = { type: 'file', value: result.source };
  btnOverwrite.style.display = '';
  parseAndRender(result.content, result.source.split(/[/\\]/).pop());
}

async function loadRemoteUrl(url) {
  showToast(t('toast.fetching'));
  const result = await window.electronAPI.fetchRemoteUrl(url);
  if (result.error) { showToast(t('toast.errorPrefix', { error: result.error }), true); return; }
  currentSource = { type: 'url', value: url };
  btnOverwrite.style.display = 'none';
  parseAndRender(result.content, url);
}

async function reloadCurrentSource() {
  if (!currentSource) return;
  if (currentSource.type === 'file') {
    const result = await window.electronAPI.reloadFile(currentSource.value);
    if (result.error) { showToast(t('toast.errorPrefix', { error: result.error }), true); return; }
    parseAndRender(result.content, currentSource.value.split(/[/\\]/).pop());
    showToast(t('toast.fileReloaded'));
  } else {
    await loadRemoteUrl(currentSource.value);
  }
}

async function restoreLastSource() {
  const last = await window.electronAPI.getLastSource();
  if (!last) return;
  currentSource = last;
  if (last.type === 'file') {
    const result = await window.electronAPI.reloadFile(last.value);
    if (result.error) { currentSource = null; return; }
    btnOverwrite.style.display = '';
    parseAndRender(result.content, last.value.split(/[/\\]/).pop());
  } else {
    await loadRemoteUrl(last.value);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TOOLBAR WIRING
// ══════════════════════════════════════════════════════════════════════════════

document.getElementById('btn-open-file').addEventListener('click', openLocalFile);
document.getElementById('btn-reload').addEventListener('click', reloadCurrentSource);
document.getElementById('btn-fit').addEventListener('click', () => { if (chart) chart.fit(); });
document.getElementById('btn-full').addEventListener('click', () => { if (chart) chart.fullscreen(); });

document.getElementById('btn-open-url').addEventListener('click', () => {
  urlInput.value = currentSource?.type === 'url' ? currentSource.value : '';
  urlError.style.display = 'none'; urlModal.show();
  setTimeout(() => urlInput.focus(), 300);
});

document.getElementById('btn-compact').addEventListener('click', () => {
  if (!chart) return;
  compactOn = !compactOn;
  chart.compact(compactOn).render().fit();
  document.getElementById('btn-compact').querySelector('i').className =
    compactOn ? 'bi bi-grip-vertical' : 'bi bi-grip-horizontal';
});

document.getElementById('btn-expand-all').addEventListener('click', () => {
  if (chart) chart.expandAll().fit();
});

document.getElementById('btn-collapse-mgr').addEventListener('click', () => {
  if (!chart) return;
  const org = orgSelect.value; if (!org) return;
  const mgrIds = new Set(allData.filter(d => d.org === org && +d.Mgr === 1).map(d => d.id));
  chart.collapseAll();
  mgrIds.forEach(id => { try { chart.setExpanded(id); } catch(_) {} });
  chart.render().fit();
});

document.getElementById('btn-export').addEventListener('click', () => { 
  if (chart) {
	  d3.selectAll('.node-gedit-btn').style('display', 'none');
      chart.exportSvg();
      d3.selectAll('.node-gedit-btn').style('display', null);
  }
});

orgSelect.addEventListener('change', function() {
  if (this.value) { renderOrg(this.value); refreshEditorTable(); }
});

document.getElementById('btn-url-load').addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (!url) { urlError.textContent = t('urlModal.errorEmpty'); urlError.style.display = ''; return; }
  if (!/^https?:\/\/.+/.test(url)) { urlError.textContent = t('urlModal.errorInvalid'); urlError.style.display = ''; return; }
  urlError.style.display = 'none'; urlModal.hide();
  await loadRemoteUrl(url);
});

urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-url-load').click(); });

window.electronAPI.onMenuOpenFile(() => openLocalFile());
window.electronAPI.onMenuOpenUrl(() => {
  urlInput.value = currentSource?.type === 'url' ? currentSource.value : '';
  urlError.style.display = 'none'; urlModal.show();
  setTimeout(() => urlInput.focus(), 300);
});

// ══════════════════════════════════════════════════════════════════════════════
// PRINT / PNG
// ══════════════════════════════════════════════════════════════════════════════

async function captureChartCanvas() {
  if (!chart) { showToast(t('toast.noChartToPrint'), true); return null; }
  const container = document.getElementById('chart-container');
 // chart.fit();
  await new Promise(r => setTimeout(r, 300));
  showToast(t('toast.capturing'));
  try {
    return await html2canvas(container, {
      backgroundColor: '#ffffff', scale: 2, useCORS: true, allowTaint: true, logging: false,
      width: container.scrollWidth, height: container.scrollHeight,
      windowWidth: container.scrollWidth, windowHeight: container.scrollHeight,
    });
  } catch (e) { showToast(t('toast.captureFailed', { error: e.message }), true); return null; }
}

async function printChart() {
  d3.selectAll('.node-gedit-btn').style('display', 'none');	
  const canvas = await captureChartCanvas(); if (!canvas) return;
  d3.selectAll('.node-gedit-btn').style('display', null);

  const imgData = canvas.toDataURL('image/png');
  const org = orgSelect.value || 'OrgChart';
  const printHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${org}</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}@page{size:landscape;margin:8mm;}
body{background:#fff;display:flex;align-items:center;justify-content:center;height:100vh;}
img{max-width:100%;max-height:100%;object-fit:contain;}</style>
</head><body><img src="${imgData}"></body></html>`;

  let iframe = document.getElementById('__print_iframe');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = '__print_iframe';
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;';
    document.body.appendChild(iframe);
  }
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open(); doc.write(printHtml); doc.close();
  iframe.contentWindow.focus();
  setTimeout(() => { iframe.contentWindow.print(); showToast(t('toast.printOpened')); }, 400);
}

async function saveChartPng() {
  d3.selectAll('.node-gedit-btn').style('display', 'none');	
  const canvas = await captureChartCanvas(); if (!canvas) return;
  d3.selectAll('.node-gedit-btn').style('display', null);	
  const org = orgSelect.value || 'orgchart';
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), { href: url, download: `${org}.png` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(t('toast.pngSaved'));
  }, 'image/png');
}

document.getElementById('btn-print').addEventListener('click', printChart);
document.getElementById('btn-save-png').addEventListener('click', saveChartPng);
window.electronAPI.onMenuPrint(() => printChart());





// ══════════════════════════════════════════════════════════════════════════════
// GRAPHICAL EDIT MODE
// ══════════════════════════════════════════════════════════════════════════════

// ── Toggle ─────────────────────────────────────────────────────────────────
document.getElementById('btn-gedit').addEventListener('click', () => {
  geditMode = !geditMode;
  document.body.classList.toggle('gedit-mode', geditMode);
  document.getElementById('btn-gedit').classList.toggle('active', geditMode);
  showToast(geditMode ? t('gedit.modeOn') : t('gedit.modeOff'));
});

// ── Event delegation on chart container ────────────────────────────────────
// Using delegation so it survives chart re-renders
document.getElementById('chart-container').addEventListener('click', e => {
  if (!geditMode) return;

  // ── + / × buttons ────────────────────────────────────────────────────────
  const btn = e.target.closest('.node-gedit-btn');
  if (btn) {
    e.stopPropagation();
    const nodeId = +btn.dataset.nodeid;
    if (btn.dataset.action === 'add') {
      // Pre-select this node as parent in add modal
      geditOpenAddChild(nodeId);
    } else if (btn.dataset.action === 'del') {
      openDeleteConfirm(nodeId);
    }
    return;
  }

  // ── Editable field click ─────────────────────────────────────────────────
  const field = e.target.closest('.node-editable');
  if (field) {
    e.stopPropagation();
    activateInlineEdit(field);
  }
});

// Prevent chart pan/zoom from interfering when clicking inside gedit mode
document.getElementById('chart-container').addEventListener('mousedown', e => {
  if (!geditMode) return;
  if (e.target.closest('.node-gedit-btn') || e.target.closest('.node-editable') ||
      e.target.closest('.node-inline-input')) {
    e.stopPropagation();
  }
});

// ── Add child node: open modal with parent pre-filled ─────────────────────
function geditOpenAddChild(parentId) {
  const org = orgSelect.value;
  if (!org) return;

  const newId = nextMemberId(org);
  if (!newId) { showToast(t('nodeModal.errorCannotDetermineId'), true); return; }

  editingNodeId = null;
  document.getElementById('nodeModalTitle').textContent = t('nodeModal.addTitle');
  document.getElementById('nf-id').value       = newId;
  document.getElementById('nf-position').value = '';
  document.getElementById('nf-person').value   = '';
  document.getElementById('nf-mgr').checked    = false;
  document.getElementById('node-modal-error').style.display = 'none';
  document.getElementById('nf-color-custom').style.display  = 'none';

  const parentNode = allData.find(d => d.id === parentId);
  document.getElementById('nf-color').value = parentNode ? parentNode.color : 'orange';

  // Populate parent dropdown then force-select the clicked parent
  populateParentDropdown(org, parentId, null);
  document.getElementById('nf-parent').value = parentId;

  nodeModal.show();
}

// ── Inline field editing ──────────────────────────────────────────────────
function activateInlineEdit(fieldEl) {
  // Already editing this field?
  if (fieldEl.querySelector('input')) return;

  const nodeId = +fieldEl.dataset.nodeid;
  const field  = fieldEl.dataset.field;   // 'positionName' or 'person'
  const node   = allData.find(d => d.id === nodeId);
  if (!node) return;

  // Current value — person field stores semicolons, show as-is for editing
  const currentVal = node[field] || '';

  // Replace content with input
  const prevHTML = fieldEl.innerHTML;
  const input    = document.createElement('input');
  input.type      = 'text';
  input.className = 'node-inline-input';
  input.value     = currentVal;
  input.style.fontSize = fieldEl.style.fontSize || (field === 'person' ? cfg.nameFontSize + 'px' : cfg.positionFontSize + 'px');
  input.style.fontWeight = fieldEl.style.fontWeight || (field === 'positionName' ? cfg.positionFontWeight : '400');

  fieldEl.innerHTML = '';
  fieldEl.appendChild(input);
  input.focus();
  input.select();

  // ── Commit on blur or Enter ───────────────────────────────────────────────
  function commit() {
    const newVal = input.value.trim();
    // Validate: positionName must not be empty
    if (field === 'positionName' && !newVal) {
      fieldEl.innerHTML = prevHTML;   // restore
      showToast(t('nodeModal.errorPositionRequired'), true);
      return;
    }
    if (newVal !== currentVal) {
      snapshotForUndo();
      node[field] = newVal;
      markUnsaved(true);
      refreshEditorTable();
    }
    // Re-render just this node's content (avoids full chart re-render)
    reRenderNode(nodeId);
  }

  function cancel() {
    fieldEl.innerHTML = prevHTML;
  }

  input.addEventListener('blur',    commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.removeEventListener('blur', commit); cancel(); }
  });
}

// ── Re-render a single node in place (no full chart re-render) ─────────────
function reRenderNode(nodeId) {
  // Find the foreignObject div for this node
  const containers = document.querySelectorAll('#chart-container .node-foreign-object-div');
  containers.forEach(wrapper => {
    // d3-org-chart puts the node's rendered HTML inside .node-foreign-object-div
    // The wrapper's parent <foreignObject> is inside a <g data-id="nodeId"> group
    const gEl = wrapper.closest('g[data-id]') || wrapper.closest('[id^="node-"]');
    const gId = gEl ? (gEl.dataset.id || gEl.id?.replace('node-','')) : null;
    if (+gId !== nodeId) return;

    const node = allData.find(d => d.id === nodeId);
    if (!node) return;

    // Build a fake d-like object with the data d3-org-chart would pass
    const fakeD = {
      data:   node,
      height: isRootNode(nodeId) ? cfg.rootNodeHeight : cfg.nodeHeight,
      width:  cfg.nodeWidth,
    };
    wrapper.innerHTML = buildNodeContent(fakeD);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SEARCH & HIGHLIGHT
// ══════════════════════════════════════════════════════════════════════════════

let searchTerm = '';

const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');

searchInput.addEventListener('input', () => {
  searchTerm = searchInput.value.trim().toLowerCase();
  searchClear.style.display = searchTerm ? '' : 'none';
  applySearch();
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchTerm = '';
  searchClear.style.display = 'none';
  applySearch();
});

// Ctrl+F focuses search box
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
  if (e.key === 'Escape' && document.activeElement === searchInput) {
    searchInput.blur();
    searchInput.value = '';
    searchTerm = '';
    searchClear.style.display = 'none';
    applySearch();
  }
});

function applySearch() {
  // d3-org-chart renders node content inside foreignObject divs.
  // We reach into the rendered DOM and toggle CSS classes on the wrapper elements.
  const nodes = document.querySelectorAll('#chart-container .node-foreign-object-div');
  if (!nodes.length) return;

  if (!searchTerm) {
    nodes.forEach(n => { n.classList.remove('node-match', 'node-dimmed'); });
    return;
  }

  const org = orgSelect.value;
  const orgNodes = allData.filter(d => d.org === org);

  // Build a lookup: positionName+person text → node id (best effort)
  nodes.forEach(wrapper => {
    // The text content of the card tells us if it matches
    const text = (wrapper.textContent || '').toLowerCase();
    const matches = text.includes(searchTerm);
    wrapper.classList.toggle('node-match',  matches);
    wrapper.classList.toggle('node-dimmed', !matches);
  });
}

// Re-apply search after any render (chart re-renders wipe DOM classes)
function renderOrg(orgName) {
  try {
    const filtered = allData.filter(d => d.org === orgName);
    if (!filtered.length) { console.warn('renderOrg: no data for org', orgName); return; }
    if (!chart) initChart();
    chart.data(filtered).render();
    chart.expandAll();
    if (searchTerm) setTimeout(applySearch, 150);
  } catch(e) {
    console.error('renderOrg error:', e);
    showToast('Chart render error: ' + e.message, true);
    chart = null;   // force re-init on next attempt
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MOVE MODE (click-to-select → click-new-parent)
// ══════════════════════════════════════════════════════════════════════════════

let moveModeOn     = false;
let moveSourceId   = null;   // ID of node selected for moving
let pendingMoveTarget = null;

const dragConfirmModal = new bootstrap.Modal(document.getElementById('dragConfirmModal'));

// Toggle move mode
document.getElementById('btn-drag-toggle').addEventListener('click', () => {
  moveModeOn = !moveModeOn;
  if (!moveModeOn) {
    moveSourceId = null;
    clearMoveHighlight();
  }
  document.body.classList.toggle('drag-mode', moveModeOn);
  showToast(moveModeOn ? t('toast.moveModeOn') : t('toast.moveModeOff'));
});

function clearMoveHighlight() {
  document.querySelectorAll('#chart-container .node-move-selected')
    .forEach(el => el.classList.remove('node-move-selected'));
  document.querySelectorAll('#chart-container .node-move-target')
    .forEach(el => el.classList.remove('node-move-target'));
}

function handleNodeClick(nodeId) {
  if (!moveModeOn) return;

  if (moveSourceId === null) {
    // First click — select the node to move (cannot select root)
    if (isRootNode(nodeId)) { showToast(t('toast.cannotMoveRoot'), true); return; }
    moveSourceId = nodeId;
    // Highlight the selected node
    setTimeout(() => {
      const allNodes = document.querySelectorAll('#chart-container .node-foreign-object-div');
      allNodes.forEach(el => {
        const idAttr = el.closest('[data-id]')?.dataset?.id
          || el.closest('g[id]')?.id?.replace('node-', '');
        // Highlight using outline on the inner div
        el.style.outline = '';
      });
      // Find and highlight by searching node text
      const node = allData.find(d => d.id === moveSourceId);
      if (node) showToast(t('toast.moveSelected', { name: node.positionName }));
    }, 50);
    return;
  }

  if (moveSourceId === nodeId) {
    // Click same node again = cancel selection
    moveSourceId = null;
    showToast(t('toast.moveCancelled'));
    return;
  }

  // Second click — this is the new parent
  const sourceNode = allData.find(d => d.id === moveSourceId);
  const targetNode = allData.find(d => d.id === nodeId);
  if (!sourceNode || !targetNode) { moveSourceId = null; return; }

  // Cycle guard: target must not be a descendant of source
  const descendants = new Set();
  const queue = [moveSourceId];
  while (queue.length) {
    const cur = queue.shift();
    allData.filter(d => d.parentId === cur).forEach(d => {
      descendants.add(d.id); queue.push(d.id);
    });
  }
  if (descendants.has(nodeId)) {
    showToast(t('toast.cannotMoveToDescendant'), true);
    moveSourceId = null;
    return;
  }

  // Show confirm dialog
  pendingMoveTarget = { sourceId: moveSourceId, targetId: nodeId };
  document.getElementById('drag-confirm-msg').innerHTML =
    `Move <strong>"${sourceNode.positionName}"</strong>
     <br>→ new parent: <strong>"${targetNode.positionName}"</strong>?`;
  dragConfirmModal.show();
  moveSourceId = null;
}

document.getElementById('btn-drag-confirm').addEventListener('click', () => {
  if (!pendingMoveTarget) { dragConfirmModal.hide(); return; }
  const { sourceId, targetId } = pendingMoveTarget;

  snapshotForUndo();
  const node = allData.find(d => d.id === sourceId);
  if (node) node.parentId = targetId;

  markUnsaved(true);
  dragConfirmModal.hide();
  pendingMoveTarget = null;
  renderOrg(orgSelect.value);
  refreshEditorTable();
  showToast(t('toast.nodeMoved'));
});

document.getElementById('btn-drag-cancel').addEventListener('click', () => {
  pendingMoveTarget = null;
  moveSourceId = null;
  dragConfirmModal.hide();
});

// ══════════════════════════════════════════════════════════════════════════════
// ORG MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

const orgModal       = new bootstrap.Modal(document.getElementById('orgModal'));
const orgRenameModal = new bootstrap.Modal(document.getElementById('orgRenameModal'));
const orgDeleteModal = new bootstrap.Modal(document.getElementById('orgDeleteModal'));

let renamingOrg = null;
let deletingOrg = null;

// ── Next available root ID (next free N*1000) ──────────────────────────────
function nextOrgRootId() {
  const usedRoots = new Set(allData.filter(d => isRootNode(d.id)).map(d => d.id));
  let n = 1000;
  while (usedRoots.has(n)) n += 1000;
  return n;
}

// ── Populate the orgs table inside the modal ───────────────────────────────
function refreshOrgTable() {
  const tbody = document.getElementById('org-mgmt-tbody');
  tbody.innerHTML = '';

  const orgs = Array.from(new Set(allData.map(d => d.org).filter(Boolean)));
  if (!orgs.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="padding:12px;text-align:center;color:#aaa;font-size:13px;">No orgs loaded</td></tr>';
    return;
  }

  orgs.forEach(org => {
    const nodes   = allData.filter(d => d.org === org);
    const root    = nodes.find(d => isRootNode(d.id));
    const rootId  = root ? root.id : '—';
    const color   = root ? root.color : '#888';
    const count   = nodes.length;

    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #eee';
    tr.innerHTML = `
      <td style="padding:7px 10px;font-weight:600;">${org}</td>
      <td style="padding:7px 10px;font-family:monospace;color:#666;">${rootId}</td>
      <td style="padding:7px 10px;color:#555;">${count} node${count!==1?'s':''}</td>
      <td style="padding:7px 10px;">
        <span style="display:inline-block;width:18px;height:18px;border-radius:3px;
          background:${color};border:1px solid rgba(0,0,0,.15);vertical-align:middle;"></span>
        <span style="font-size:12px;color:#666;margin-left:5px;">${color}</span>
      </td>
      <td style="padding:7px 10px;text-align:center;white-space:nowrap;">
        <button class="btn-row-edit"   data-org="${org}" title="Rename org"><i class="bi bi-pencil"></i></button>
        <button class="btn-row-delete" data-org="${org}" title="Delete org"><i class="bi bi-trash3"></i></button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-row-edit').forEach(b =>
    b.addEventListener('click', () => openRenameOrg(b.dataset.org)));
  tbody.querySelectorAll('.btn-row-delete').forEach(b =>
    b.addEventListener('click', () => openDeleteOrg(b.dataset.org)));
}

// ── Open manage-orgs modal ─────────────────────────────────────────────────
document.getElementById('btn-manage-orgs').addEventListener('click', () => {
  resetOrgForm();
  refreshOrgTable();
  orgModal.show();
});

function resetOrgForm() {
  document.getElementById('org-form-title').textContent = t('orgModal.addTitle');
  document.getElementById('org-f-name').value  = '';
  document.getElementById('org-f-label').value = '';
  document.getElementById('org-f-color').value = '#4a90d9';
  document.getElementById('org-form-error').style.display = 'none';
  document.getElementById('btn-org-form-save').innerHTML = '<i class="bi bi-plus-lg me-1"></i>'+t('orgModal.addButton');
}

// ── Add new org ────────────────────────────────────────────────────────────
document.getElementById('btn-org-form-save').addEventListener('click', () => {
  const name   = document.getElementById('org-f-name').value.trim();
  const label  = document.getElementById('org-f-label').value.trim();
  const color  = document.getElementById('org-f-color').value;
  const errEl  = document.getElementById('org-form-error');

  errEl.style.display = 'none';

  if (!name)  { errEl.textContent = t('orgModal.errorNameRequired');   errEl.style.display = ''; return; }
  if (!label) { errEl.textContent = t('orgModal.errorLabelRequired'); errEl.style.display = ''; return; }

  // Check for duplicate org name
  const existing = Array.from(new Set(allData.map(d => d.org).filter(Boolean)));
  if (existing.map(o => o.toLowerCase()).includes(name.toLowerCase())) {
    errEl.textContent = t('orgModal.errorDuplicateName', { name });
    errEl.style.display = ''; return;
  }

  snapshotForUndo();

  const rootId = nextOrgRootId();
  allData.push({
    org: name, id: rootId, person: '', positionName: label,
    parentId: null, Mgr: 1, color
  });

  markUnsaved(true);
  refreshOrgSelectDropdown();
  refreshOrgTable();
  resetOrgForm();

  // Switch to the new org
  orgSelect.value = name;
  renderOrg(name);
  refreshEditorTable();

  showToast(t('orgModal.toastCreated', { name, id: rootId }));
});

// ── Rename org ─────────────────────────────────────────────────────────────
function openRenameOrg(org) {
  renamingOrg = org;
  //document.getElementById('rename-org-current').textContent = org;
  document.getElementById('rename-org-current').textContent = t('orgModal.renamePrompt', { name: org });
  document.getElementById('rename-org-input').value = org;
  document.getElementById('rename-org-error').style.display = 'none';
  orgRenameModal.show();
  setTimeout(() => document.getElementById('rename-org-input').select(), 300);
}

document.getElementById('btn-rename-org-confirm').addEventListener('click', () => {
  const newName = document.getElementById('rename-org-input').value.trim();
  const errEl   = document.getElementById('rename-org-error');
  errEl.style.display = 'none';

  if (!newName) { errEl.textContent = t('orgModal.errorNameEmpty'); errEl.style.display = ''; return; }

  const existing = Array.from(new Set(allData.map(d => d.org).filter(Boolean)));
  if (newName !== renamingOrg &&
      existing.map(o => o.toLowerCase()).includes(newName.toLowerCase())) {
    errEl.textContent = t('orgModal.errorAlreadyExists', { name: newName }); errEl.style.display = ''; return;
  }

  snapshotForUndo();
  allData.forEach(d => { if (d.org === renamingOrg) d.org = newName; });

  const wasSelected = orgSelect.value === renamingOrg;
  markUnsaved(true);
  refreshOrgSelectDropdown();
  refreshOrgTable();
  orgRenameModal.hide();

  if (wasSelected) {
    orgSelect.value = newName;
    renderOrg(newName);
    refreshEditorTable();
  }

  showToast(t('orgModal.toastRenamed', { old: renamingOrg, new: newName }));
  renamingOrg = null;
});

document.getElementById('rename-org-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-rename-org-confirm').click();
});

// ── Delete org ─────────────────────────────────────────────────────────────
function openDeleteOrg(org) {
  deletingOrg = org;
  const count = allData.filter(d => d.org === org).length;
  document.getElementById('org-delete-msg').innerHTML =
    `Delete org <strong>"${org}"</strong> and all its <strong>${count} node${count!==1?'s':''}</strong>?
     <br><br><span style="color:#c33;">This cannot be undone with undo — save your CSV first if unsure.</span>`;
  orgDeleteModal.show();
}

document.getElementById('btn-org-delete-confirm').addEventListener('click', () => {
  if (!deletingOrg) return;

  snapshotForUndo();
  allData = allData.filter(d => d.org !== deletingOrg);

  const wasSelected = orgSelect.value === deletingOrg;
  markUnsaved(true);
  refreshOrgSelectDropdown();
  refreshOrgTable();
  orgDeleteModal.hide();

  if (wasSelected) {
    // Switch to first remaining org, or show empty state
    const remaining = Array.from(new Set(allData.map(d => d.org).filter(Boolean)));
    if (remaining.length) {
      orgSelect.value = remaining[0];
      renderOrg(remaining[0]);
    } else {
      chart = null;
      document.getElementById('chart-container').innerHTML = '';
      emptyState.classList.remove('hidden');
    }
    refreshEditorTable();
  }

  showToast(t('orgModal.toastDeleted', { name: deletingOrg }));
  deletingOrg = null;
});

// ── Sync orgSelect dropdown from allData ───────────────────────────────────
function refreshOrgSelectDropdown() {
  const current = orgSelect.value;
  const orgs    = Array.from(new Set(allData.map(d => d.org).filter(Boolean)));
  orgSelect.innerHTML = '<option value="">' + t('orgSelect.placeholder') + '</option>';
  orgs.forEach(org => {
    const opt = document.createElement('option');
    opt.value = org; opt.textContent = org;
    if (org === current) opt.selected = true;
    orgSelect.appendChild(opt);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// TILED EXPORT
// ══════════════════════════════════════════════════════════════════════════════

// Paper dimensions in mm at 96 dpi (1mm = 3.7795px)
const PAPER = {
  a4:     { w: 210, h: 297 },
  a3:     { w: 297, h: 420 },
  letter: { w: 216, h: 279 },
};
const MM_TO_PX = 3.7795275591;

const tiledModal = new bootstrap.Modal(document.getElementById('tiledModal'));

// ── Update estimated layout preview ───────────────────────────────────────
function updateTilePreview() {
  const preview = document.getElementById('tile-preview');
  if (!chart) { preview.textContent = 'No chart loaded'; return; }

  const container = document.getElementById('chart-container');
  const cw = container.scrollWidth;
  const ch = container.scrollHeight;
  if (!cw || !ch) { preview.textContent = 'Render a chart first'; return; }

  const paper   = PAPER[document.getElementById('tile-paper').value];
  const orient  = document.getElementById('tile-orient').value;
  const scale   = +document.getElementById('tile-scale').value / 100;
  const overlapMm = +document.getElementById('tile-overlap').value;

  const pw = (orient === 'landscape' ? paper.h : paper.w);
  const ph = (orient === 'landscape' ? paper.w : paper.h);
  const pagePx = { w: pw * MM_TO_PX, h: ph * MM_TO_PX };
  const overlapPx = overlapMm * MM_TO_PX;

  const scaledW = cw * scale;
  const scaledH = ch * scale;

  const stepX = pagePx.w - overlapPx;
  const stepY = pagePx.h - overlapPx;
  const cols = Math.ceil(scaledW / stepX);
  const rows = Math.ceil(scaledH / stepY);
  const total = cols * rows;

  preview.innerHTML = `
    <div style="text-align:center;">
      <div style="font-size:15px;font-weight:600;margin-bottom:4px;">
        ${cols} × ${rows} = <strong>${total} ${total!==1?t('tiledModal.pages'):t('tiledModal.pagesPlural')}</strong>
      </div>
      <div style="font-size:12px;color:#888;">`+t('tiledModal.chart')+
        ` ${Math.round(scaledW)}×${Math.round(scaledH)}px &nbsp;/&nbsp;`+t('tiledModal.page')+
        ` ${Math.round(pagePx.w)}×${Math.round(pagePx.h)}px &nbsp;/&nbsp;`+t('tiledModal.overlap')+
        ` ${overlapMm}mm
      </div>
      ${buildTileGrid(cols, rows)}
    </div>`;
}

function buildTileGrid(cols, rows) {
  if (cols > 12 || rows > 12) return '<div style="color:#c33;font-size:12px;margin-top:4px;">⚠ Too many tiles — reduce scale or increase paper size</div>';
  const cellW = Math.min(28, Math.floor(240 / cols));
  const cellH = Math.min(20, Math.floor(80  / rows));
  let html = `<div style="display:inline-grid;grid-template-columns:repeat(${cols},${cellW}px);gap:2px;margin-top:8px;">`;
  for (let r = 0; r < rows; r++)
    for (let col = 0; col < cols; col++)
      html += `<div style="width:${cellW}px;height:${cellH}px;background:#c8d8f0;border:1px solid #8aabcf;
        border-radius:2px;display:flex;align-items:center;justify-content:center;
        font-size:9px;color:#336;">${r+1},${col+1}</div>`;
  return html + '</div>';
}

// ── Wire preview updates ───────────────────────────────────────────────────
['tile-paper','tile-orient','tile-format','tile-labels'].forEach(id =>
  document.getElementById(id).addEventListener('change', updateTilePreview));

document.getElementById('tile-scale').addEventListener('input', () => {
  document.getElementById('tile-scale-val').textContent = document.getElementById('tile-scale').value;
  updateTilePreview();
});
document.getElementById('tile-overlap').addEventListener('input', () => {
  document.getElementById('tile-overlap-val').textContent = document.getElementById('tile-overlap').value;
  updateTilePreview();
});

document.getElementById('btn-tiled-export').addEventListener('click', () => {
  updateTilePreview();
  tiledModal.show();
});

// ── Main tiling function ───────────────────────────────────────────────────
document.getElementById('btn-tiled-go').addEventListener('click', async () => {
  if (!chart) { showToast(t('toast.noChartLoaded'), true); return; }

  tiledModal.hide();
  await new Promise(r => setTimeout(r, 300));   // let modal close

  const paper     = PAPER[document.getElementById('tile-paper').value];
  const orient    = document.getElementById('tile-orient').value;
  const scalePct  = +document.getElementById('tile-scale').value / 100;
  const overlapMm = +document.getElementById('tile-overlap').value;
  const format    = document.getElementById('tile-format').value;
  const showLabels= document.getElementById('tile-labels').value === '1';
  const org       = orgSelect.value || 'orgchart';

  const pw = (orient === 'landscape' ? paper.h : paper.w);
  const ph = (orient === 'landscape' ? paper.w : paper.h);

  // Capture full chart at 2× pixel density for quality
  showToast(t('toast.capturing'));
  chart.fit();
  await new Promise(r => setTimeout(r, 350));

  const container = document.getElementById('chart-container');
  let fullCanvas;
  try {
    fullCanvas = await html2canvas(container, {
      backgroundColor: '#ffffff',
      scale: 2 * scalePct,
      useCORS: true, allowTaint: true, logging: false,
      width:  container.scrollWidth,
      height: container.scrollHeight,
      windowWidth:  container.scrollWidth,
      windowHeight: container.scrollHeight,
    });
  } catch(e) { showToast(t('toast.captureFailed', { error: e.message }), true); return; }

  const totalW = fullCanvas.width;
  const totalH = fullCanvas.height;

  // Page size in canvas pixels (at 2× scale)
  const pageCanvasW = Math.round(pw * MM_TO_PX * 2);
  const pageCanvasH = Math.round(ph * MM_TO_PX * 2);
  const overlapPx   = Math.round(overlapMm * MM_TO_PX * 2);
  const stepX = pageCanvasW - overlapPx;
  const stepY = pageCanvasH - overlapPx;

  const cols  = Math.ceil(totalW / stepX);
  const rows  = Math.ceil(totalH / stepY);
  const total = cols * rows;

  showToast(t('toast.buildingTiles', { count: total }));

  if (format === 'pdf') {
    // ── PDF output ─────────────────────────────────────────────────────────
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: orient, unit: 'mm',
                            format: [pw, ph], compress: true });

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const sx = col * stepX;
        const sy = row * stepY;

        // Slice tile from fullCanvas
        const tileCanvas = document.createElement('canvas');
        tileCanvas.width  = pageCanvasW;
        tileCanvas.height = pageCanvasH;
        const ctx = tileCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvasW, pageCanvasH);
        ctx.drawImage(fullCanvas, sx, sy, pageCanvasW, pageCanvasH,
                                  0,  0, pageCanvasW, pageCanvasH);

        // Overlap guide lines (thin dashed border inset)
        if (overlapPx > 0) {
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = 'rgba(150,150,200,0.5)';
          ctx.lineWidth = 1;
          const half = overlapPx / 2;
          if (col > 0)        { ctx.beginPath(); ctx.moveTo(half, 0);           ctx.lineTo(half, pageCanvasH);          ctx.stroke(); }
          if (col < cols - 1) { ctx.beginPath(); ctx.moveTo(pageCanvasW-half,0);ctx.lineTo(pageCanvasW-half,pageCanvasH);ctx.stroke(); }
          if (row > 0)        { ctx.beginPath(); ctx.moveTo(0, half);           ctx.lineTo(pageCanvasW, half);           ctx.stroke(); }
          if (row < rows - 1) { ctx.beginPath(); ctx.moveTo(0, pageCanvasH-half);ctx.lineTo(pageCanvasW,pageCanvasH-half);ctx.stroke(); }
          ctx.setLineDash([]);
        }

        // Page label (top-left corner)
        if (showLabels) {
          const pageNum = row * cols + col + 1;
          const labelH  = 36;
          ctx.fillStyle = 'rgba(40,40,80,0.75)';
          ctx.fillRect(0, 0, 130, labelH);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 18px system-ui';
          ctx.fillText(`${org}  R${row+1}/C${col+1}  [${pageNum}/${total}]`, 8, 24);
        }

        const imgData = tileCanvas.toDataURL('image/jpeg', 0.92);
        if (row > 0 || col > 0) pdf.addPage([pw, ph], orient);
        pdf.addImage(imgData, 'JPEG', 0, 0, pw, ph, '', 'FAST');
      }
    }

    pdf.save(`${org}-tiled.pdf`);
    showToast(t('toast.pdfSaved', { count: total }));

  } else {
    // ── PNG tiles output ───────────────────────────────────────────────────
    let downloaded = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const sx = col * stepX;
        const sy = row * stepY;

        const tileCanvas = document.createElement('canvas');
        tileCanvas.width  = pageCanvasW;
        tileCanvas.height = pageCanvasH;
        const ctx = tileCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvasW, pageCanvasH);
        ctx.drawImage(fullCanvas, sx, sy, pageCanvasW, pageCanvasH,
                                  0,  0, pageCanvasW, pageCanvasH);

        if (showLabels) {
          const pageNum = row * cols + col + 1;
          ctx.fillStyle = 'rgba(40,40,80,0.75)';
          ctx.fillRect(0, 0, 130, 36);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 18px system-ui';
          ctx.fillText(`R${row+1}/C${col+1} [${pageNum}/${total}]`, 8, 24);
        }

        await new Promise(resolve => {
          tileCanvas.toBlob(blob => {
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `${org}-tile-r${row+1}c${col+1}.png`;
            a.click();
            setTimeout(() => { URL.revokeObjectURL(url); resolve(); }, 200);
          }, 'image/png');
        });
        downloaded++;
        // Small delay between downloads so browser doesn't block them
        await new Promise(r => setTimeout(r, 150));
      }
    }
    showToast(`${downloaded} PNG tile${downloaded!==1?'s':''} saved`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════════════════════════

function showToast(msg, isError = false) {
  const wrap = document.getElementById('toast-wrap');
  const el   = document.createElement('div');
  el.className = 'toast-msg';
  el.style.background = isError ? '#c0392b' : '#333';
  el.textContent = msg;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 3000);
}

// ══════════════════════════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════════════════════════

async function boot() {
  try {
    // 1. Force the locale load to finish before anything else
    await loadI18n();
    // 2. Load configuration after language is set
    await loadConfig();

    // 3. Restore the source
    await restoreLastSource();

    // 4. Final safety check: ensure the DOM reflects the loaded language
    applyI18nToDom();

  } catch(e) {
    console.error('Boot sequence failed:', e);
  }
}

boot();


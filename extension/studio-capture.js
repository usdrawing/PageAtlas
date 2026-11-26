function createAtlasCapture({ state, make, button, field, tr, main, inspector, notify, selectProject, render, save, openUpload, hydrateBrand }) {
  const settings = { url: '', tabId: null, active: new Set(['macbook', 'ipad', 'iphone']), single: 'macbook', fullPage: false,
    withMockup: true, transparent: false, brandColors: true, background: '#e6eee3', camera: true, notch: 'island', devices: {}, custom: { width: 1280, height: 800, device: 'browser' } };
  let busy = false;
  const mode = () => state.tool === 'section' ? 'selection' : state.tool === 'responsive' ? 'responsive' : 'page';
  const view = id => id === 'custom' ? { id: 'custom', label: tr('custom'), ...settings.custom } : { ...atlasCapturePresets.find(preset => preset.id === id), device: settings.devices[id] || atlasCapturePresets.find(preset => preset.id === id)?.device };
  async function route(params) {
    const saved = state.project?.lastCapture;
    if (saved && !params.has('capture')) {
      settings.url = saved.sourceUrl || state.project.sourceUrl || '';
      settings.tabId = saved.sourceTabId || null;
      for (const key of ['fullPage', 'withMockup', 'transparent', 'brandColors', 'background', 'camera', 'notch']) if (saved[key] !== undefined) settings[key] = saved[key];
      if (saved.viewports?.length) {
        settings.active = new Set();
        for (const savedView of saved.viewports) {
          const preset = atlasCapturePresets.find(p => p.width === savedView.width && p.height === savedView.height);
          if (preset) { settings.active.add(preset.id); settings.devices[preset.id] = savedView.device; }
          else { settings.custom = { width: savedView.width, height: savedView.height, device: savedView.device }; settings.active.add('custom'); }
        }
        settings.single = [...settings.active][0];
      }
    }
    if (!params.has('capture')) return;
    state.tool = params.get('capture') === 'responsive' ? 'responsive' : params.get('capture') === 'selection' ? 'section' : 'capture';
    const tabId = Number(params.get('tab'));
    if (Number.isInteger(tabId) && tabId > 0) {
      const result = await chrome.runtime.sendMessage({ type: 'source-details', tabId });
      if (result.error) { notify(result.error); return; }
      settings.tabId = tabId;
      settings.url = result.url;
    }
  }
  async function copyImage(snapshot, config) {
    const root = config.withMockup ? atlasComposition.composition([snapshot], {
      ...config, width: snapshot.viewport > 1000 ? 1600 : 1080, height: snapshot.viewport > 1000 ? 1100 : 1400,
      selectedIds: [snapshot.id], showText: false, shadow: !config.transparent,
      screenOptions: { [snapshot.id]: { device: snapshot.captureDevice || 'browser' } }
    }) : atlasRender.svg(snapshot.width, snapshot.height);
    if (!config.withMockup) root.append(atlasRender.node('image', { width: snapshot.width, height: snapshot.height, href: snapshot.screenshot }));
    const blob = await atlasRender.raster(root);
    const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
    return { blob, data };
  }
  async function writeClipboard(blob) {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }
  async function execute() {
    if (busy) return;
    for (const input of main.querySelectorAll('input')) if (!input.reportValidity()) return;
    await save();
    const list = mode() === 'responsive' ? [...settings.active].map(view) : [view(settings.single)];
    if (!list.length) throw new Error(tr('chooseScreens'));
    if (!settings.url) throw new Error(tr('url'));
    if (settings.tabId) {
      const source = await chrome.runtime.sendMessage({ type: 'source-details', tabId: settings.tabId });
      if (source.error || source.url !== settings.url) settings.tabId = null;
    }
    const options = { viewports: list, fullPage: settings.fullPage, transparent: settings.transparent, appendTo: state.project?.id,
      sourceUrl: settings.url, sourceTabId: settings.tabId,
      withMockup: settings.withMockup, brandColors: settings.brandColors, background: settings.background, camera: settings.camera, notch: settings.notch };
    const oldIds = new Set(state.project?.snapshots.map(snapshot => snapshot.id) || []);
    busy = true;
    renderSetup();
    let copySucceeded = false;
    try {
      const result = await chrome.runtime.sendMessage({ type: settings.tabId ? 'capture-tab' : 'capture-url', tabId: settings.tabId,
        url: settings.url, mode: mode() === 'selection' ? 'selection' : 'page', help: tr('selectElement'), options });
      if (result.error) throw new Error(result.error);
      const project = await atlasProjects.get(result.id);
      const fresh = project.snapshots.filter(snapshot => !oldIds.has(snapshot.id));
      const config = { ...atlasComposition.defaults(project), ...project.composition, withMockup: true,
        transparent: settings.transparent, background: settings.background, camera: settings.camera, notch: settings.notch };
      const brand = fresh[0]?.brand;
      if (settings.brandColors) config.background = brand?.themeColor || brand?.background || settings.background;
      if (config.autoContrast !== false) config.foreground = atlasComposition.contrast(config.background);
      config.screenOptions = { ...config.screenOptions };
      for (const snapshot of fresh) config.screenOptions[snapshot.id] = { device: settings.withMockup ? snapshot.captureDevice : 'flat' };
      project.composition = config;
      for (const snapshot of fresh) {
        const result = await copyImage(snapshot, { ...config, withMockup: settings.withMockup });
        snapshot.capturePreview = result.data;
        snapshot.clipboardCopied = false;
      }
      const last = fresh.at(-1);
      if (last) {
        try {
          const blob = await (await fetch(last.capturePreview)).blob();
          await writeClipboard(blob);
          last.clipboardCopied = true;
          copySucceeded = true;
        } catch {}
      }
      await hydrateBrand(project);
      await atlasProjects.save(project);
      await selectProject(project);
      notify(copySucceeded ? tr('captureCopied') : tr('captureCopyRetry'));
    } finally { busy = false; renderSetup(); }
  }
  function toggle(label, checked, change) {
    const wrapper = make('label', 'toggle');
    const input = make('input'); input.type = 'checkbox'; input.checked = checked;
    input.addEventListener('change', () => change(input.checked));
    wrapper.append(make('span', '', label), input);
    return wrapper;
  }
  function renderSetup() {
    if (!['capture', 'section', 'responsive'].includes(state.tool)) return;
    main.replaceChildren(); inspector.replaceChildren();
    document.querySelectorAll('#tools button,#projects button,#new,#language,#theme,#backup,#export').forEach(control => {
      control.disabled = busy || (!state.project && ['backup', 'export'].includes(control.id));
    });
    const title = make('div', 'capture-heading');
    title.append(make('h1', '', tr(state.tool)), make('p', 'muted', tr(mode() === 'responsive' ? 'responsiveExplain' : mode() === 'selection' ? 'sectionExplain' : 'captureExplain')));
    main.append(title);
    const form = make('section', 'capture-setup');
    const source = field(tr('source'), settings.url, value => { settings.url = value.trim(); settings.tabId = null; });
    source.querySelector('input').type = 'url';
    source.querySelector('input').placeholder = 'https://';
    form.append(source, make('h2', '', tr('screenSizes')));
    const list = make('div', 'capture-targets');
    for (const preset of [...atlasCapturePresets, { id: 'custom', label: tr('custom'), ...settings.custom }]) {
      const selected = mode() === 'responsive' ? settings.active.has(preset.id) : settings.single === preset.id;
      const row = make('div', 'capture-target');
      row.dataset.active = String(selected);
      const choose = make('label', 'target-choice');
      const input = make('input'); input.type = mode() === 'responsive' ? 'checkbox' : 'radio'; input.name = 'capture-size'; input.checked = selected;
      input.disabled = busy;
      input.dataset.preset = preset.id;
      input.addEventListener('change', () => {
        if (mode() === 'responsive') { if (input.checked) settings.active.add(preset.id); else settings.active.delete(preset.id); }
        else settings.single = preset.id;
        renderSetup();
      });
      choose.append(input, make('span', '', preset.label)); row.append(choose);
      if (selected) row.append(field(tr('device'), settings.devices[preset.id] || preset.device, value => {
        if (preset.id === 'custom') settings.custom.device = value;
        else settings.devices[preset.id] = value;
      }, 'select', Object.entries(atlasComposition.models).filter(([key]) => key !== 'laptop').map(([key, model]) => [key, model.name])));
      if (preset.id === 'custom' && selected) {
        const size = make('div', 'row');
        for (const key of ['width', 'height']) {
          const dimension = field(tr(key), settings.custom[key], value => {
          if (!Number.isInteger(value) || value < 120 || value > 8192) { notify(tr('invalidSize')); return; }
          settings.custom[key] = value;
          }, 'number');
          Object.assign(dimension.querySelector('input'), { min: '120', max: '8192', step: '1', required: true });
          size.append(dimension);
        }
        row.append(size);
      }
      list.append(row);
    }
    form.append(list);
    const approve = button(busy ? tr('busy') : tr('confirmCapture'), execute, true);
    approve.id = 'confirm-capture'; approve.disabled = busy;
    form.append(approve, make('p', 'note', tr('captureNotice')));
    main.append(form);
    inspector.append(make('h2', '', tr('captureStyle')),
      toggle(tr('withMockup'), settings.withMockup, value => { settings.withMockup = value; }),
      toggle(tr('transparent'), settings.transparent, value => { settings.transparent = value; renderSetup(); }),
      toggle(tr('brandColors'), settings.brandColors, value => { settings.brandColors = value; renderSetup(); }),
      toggle(tr('fullPage'), settings.fullPage, value => { settings.fullPage = value; }),
      toggle(tr('camera'), settings.camera, value => { settings.camera = value; }),
      field(tr('notch'), settings.notch, value => { settings.notch = value; }, 'select', ['island', 'notch', 'none'].map(value => [value, tr(value)])));
    if (!settings.transparent && !settings.brandColors) inspector.append(field(tr('background'), settings.background, value => { settings.background = value; }, 'color'));
    const imports = make('div', 'import-compact');
    imports.append(button(tr('upload'), openUpload));
    imports.addEventListener('dragover', event => event.preventDefault());
    imports.addEventListener('drop', event => { event.preventDefault(); openUpload(event.dataTransfer.files); });
    main.append(imports);
    if (state.project) {
      const history = make('section', 'capture-history');
      history.append(make('div', 'surface-head'));
      history.firstChild.append(make('h2', '', tr('recentCaptures')), button(tr('openEditor'), async () => { state.tool = 'mockup'; await render(); }, true));
      const gallery = make('div', 'capture-previews');
      state.project.snapshots.forEach(snapshot => {
        const card = make('article', 'capture-preview');
        const image = make('img'); image.src = snapshot.capturePreview || snapshot.screenshot; image.alt = snapshot.title;
        image.dataset.transparent = String(Boolean(state.project.lastCapture?.transparent));
        const info = make('div', 'capture-preview-info');
        info.append(make('strong', '', snapshot.captureLabel || `${snapshot.viewport || snapshot.width} × ${snapshot.viewportHeight || snapshot.height}`), make('small', '', snapshot.clipboardCopied ? tr('captureCopied') : tr('saved')));
        const actions = make('div', 'row');
        actions.append(button(tr('copyImage'), async () => { await writeClipboard(await (await fetch(image.src)).blob()); notify(tr('copied')); }),
          button(tr('export'), async () => atlasRender.download(await (await fetch(image.src)).blob(), 'pageatlas-capture.png')),
          button(tr('remove'), async () => {
            if (busy) return;
            state.project.snapshots = state.project.snapshots.filter(s => s.id !== snapshot.id);
            if (state.project.composition?.selectedIds) state.project.composition.selectedIds = state.project.composition.selectedIds.filter(id => id !== snapshot.id);
            if (!state.project.snapshots.length) { await atlasProjects.remove(state.project.id); await selectProject(null); }
            else { state.screen = 0; await save(); await render(); }
          }));
        card.append(image, info, actions); gallery.append(card);
      });
      history.append(gallery); main.append(history);
    }
    main.querySelectorAll('input,select').forEach(input => { if (busy) input.disabled = true; });
    inspector.querySelectorAll('input,select').forEach(input => { if (busy) input.disabled = true; });
  }
  return { render: renderSetup, route, get busy() { return busy; } };
}

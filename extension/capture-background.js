importScripts('projects.js', 'extract.js', 'capture-presets.js');
const capturingTabs = new Set();
const pendingSelections = new Map();
const captureDelay = ms => new Promise(resolve => setTimeout(resolve, ms));

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.type !== 'figma-frame' || sender.id !== chrome.runtime.id || !sender.tab?.url) return;
  (async () => {
    if (!/(^|\.)figma\.com$/i.test(new URL(sender.tab.url).hostname)) throw new Error('Open the Figma design first.');
    const frame = message.frame;
    if (!frame || !Number.isFinite(frame.width) || !Number.isFinite(frame.height) || frame.width < 1 || frame.height < 1 ||
      frame.width * frame.height > 65000000 || typeof frame.screenshot !== 'string' || frame.screenshot.length > 30000000 ||
      !/^data:image\/png;base64,/.test(frame.screenshot)) throw new Error('This frame is too large. Export a smaller frame.');
    const title = String(frame.title || 'Figma frame').slice(0, 200);
    const project = { schema: 1, id: crypto.randomUUID(), name: title, sourceUrl: sender.tab.url, createdAt: Date.now(),
      snapshots: [{ id: crypto.randomUUID(), title, width: frame.width, height: frame.height, screenshot: frame.screenshot,
        layers: [], images: [], colors: [], typography: [], components: [], headings: [], text: '' }], flows: [] };
    await atlasProjects.save(project);
    await chrome.tabs.create({ url: chrome.runtime.getURL('studio.html') + '#project=' + project.id });
    return { ok: true };
  })().then(reply, error => reply({ error: error.message }));
  return true;
});

async function chooseCaptureElement(tabId, help) {
  if (pendingSelections.has(tabId)) throw new Error('A selection is already open on this tab.');
  const token = crypto.randomUUID();
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingSelections.delete(tabId);
      chrome.tabs.sendMessage(tabId, { type: 'cancel-picker' }).catch(() => {});
      reject(new Error('Selection timed out.'));
    }, 120000);
    pendingSelections.set(tabId, { token, resolve: () => { clearTimeout(timeout); resolve(); }, reject: error => { clearTimeout(timeout); reject(error); } });
    chrome.tabs.sendMessage(tabId, { type: 'choose-element', token, help: help || 'Choose an element. Esc to cancel.' }).catch(error => {
      pendingSelections.get(tabId)?.reject(error);
      pendingSelections.delete(tabId);
    });
  });
}

async function captureProject(tabId, mode = 'page', widths, options = {}) {
  if (capturingTabs.has(tabId)) throw new Error('A capture is already running on this tab.');
  capturingTabs.add(tabId);
  const target = { tabId };
  let attached = false;
  const snapshots = [];
  let originalScroll;
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'capture-prepare' });
    await chrome.debugger.attach(target, '1.3');
    attached = true;
    const send = async (method, params = {}) => {
      let timeout;
      try {
        return await Promise.race([chrome.debugger.sendCommand(target, method, params), new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Capture timed out while running ' + method + '. Try the open webpage.')), 20000);
        })]);
      } finally { clearTimeout(timeout); }
    };
    originalScroll = (await send('Runtime.evaluate', { expression: '({x:scrollX,y:scrollY})', returnByValue: true })).result.value;
    if (options.transparent) await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    for (const setting of widths?.length ? widths : [null]) {
      const viewport = typeof setting === 'number' ? { width: setting, height: 900 } : setting;
      if (viewport) {
        await send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
        await captureDelay(700);
      }
      await send('Runtime.evaluate', { expression: 'scrollTo(0,0)' });
      await send('Runtime.evaluate', { expression: 'Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,2000))]).then(()=>true)', awaitPromise: true });
      const result = await send('Runtime.evaluate', { expression: '(' + atlasExtract.toString() + ')(' + (mode === 'selection') + ')', returnByValue: true });
      if (result.exceptionDetails || !result.result.value) throw new Error('Could not read this page.');
      const snapshot = result.result.value;
      if (options.fullPage === false && mode !== 'selection') {
        snapshot.width = viewport?.width || snapshot.width;
        snapshot.height = viewport?.height || 900;
        snapshot.origin = { x: 0, y: 0 };
        snapshot.layers = snapshot.layers.filter(layer => layer.x < snapshot.width && layer.y < snapshot.height && layer.x + layer.width > 0 && layer.y + layer.height > 0);
      }
      if (!snapshot.width || !snapshot.height || snapshot.width > 16384 || snapshot.height > 30000 || snapshot.width * snapshot.height > 65000000) {
        throw new Error('This page is too large for one image. Use section capture or a smaller viewport.');
      }
      const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
        clip: { x: Math.max(0, snapshot.origin.x), y: Math.max(0, snapshot.origin.y), width: snapshot.width, height: snapshot.height, scale: 1 } });
      snapshots.push({ id: crypto.randomUUID(), ...snapshot, screenshot: 'data:image/png;base64,' + image.data,
        viewport: viewport?.width || Math.round(snapshot.width), viewportHeight: viewport?.height || snapshot.height,
        captureDevice: viewport?.device, captureLabel: viewport?.label, capturedAt: Date.now() });
    }
    const project = { id: crypto.randomUUID(), schema: 1, name: snapshots[0].title, sourceUrl: snapshots[0].url,
      createdAt: Date.now(), snapshots, presentation: null, composition: null, flows: [] };
    if (options.appendTo) {
      const existing = await atlasProjects.update(options.appendTo, project => {
        if (!project) return;
        project.snapshots.push(...snapshots);
        if (project.composition?.selectedIds) project.composition.selectedIds.push(...snapshots.map(s => s.id));
        project.lastCapture = options;
        return project;
      });
      if (existing) return existing;
    }
    project.lastCapture = options;
    await atlasProjects.save(project);
    return project;
  } finally {
    if (attached) {
      if (options.transparent) await chrome.debugger.sendCommand(target, 'Emulation.setDefaultBackgroundColorOverride').catch(() => {});
      if (widths?.length) await chrome.debugger.sendCommand(target, 'Emulation.clearDeviceMetricsOverride').catch(() => {});
      if (originalScroll) await chrome.debugger.sendCommand(target, 'Runtime.evaluate', { expression: 'scrollTo(' + originalScroll.x + ',' + originalScroll.y + ')' }).catch(() => {});
      await chrome.debugger.detach(target).catch(() => {});
    }
    capturingTabs.delete(tabId);
    await chrome.tabs.sendMessage(tabId, { type: 'capture-restore' }).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !['capture', 'open-studio', 'open-capture', 'source-details', 'capture-tab', 'capture-url', 'choose-element', 'selected-element', 'selection-cancel'].includes(message.type)) return;
  (async () => {
    if (['selected-element', 'selection-cancel'].includes(message.type)) {
      const pending = pendingSelections.get(sender.tab?.id);
      if (pending && pending.token === message.token) {
        pendingSelections.delete(sender.tab.id);
        if (message.type === 'selection-cancel') pending.reject(new Error('Selection cancelled.'));
        else pending.resolve();
      }
      return { ok: true };
    }
    if (message.type === 'open-capture') {
      if (!sender.tab?.id) throw new Error('Choose a webpage first.');
      await chrome.tabs.create({ url: chrome.runtime.getURL('studio.html') + '#capture=' + encodeURIComponent(message.mode || 'page') + '&tab=' + sender.tab.id });
      return { ok: true };
    }
    if (message.type === 'source-details') {
      if (!sender.url?.startsWith(chrome.runtime.getURL('studio.html'))) throw new Error('Open Studio first.');
      const tab = await chrome.tabs.get(message.tabId);
      if (!/^https?:/i.test(tab.url || '')) throw new Error('Choose an HTTP or HTTPS webpage.');
      return { title: tab.title, url: tab.url };
    }
    if (message.type === 'open-studio') {
      await chrome.tabs.create({ url: chrome.runtime.getURL('studio.html') });
      return { ok: true };
    }
    let tabId = sender.tab?.id;
    let viewports = message.responsive ? [1440, 768, 390] : undefined;
    const options = message.options || {};
    if (options.viewports) {
      if (!Array.isArray(options.viewports) || !options.viewports.length || options.viewports.length > 9) throw new Error('Choose 1–9 screen sizes.');
      viewports = options.viewports.map(view => {
        if (![view.width, view.height].every(value => Number.isInteger(value) && value >= 120 && value <= 8192)) throw new Error('Screen dimensions must be between 120 and 8192 pixels.');
        return { width: view.width, height: view.height, device: String(view.device || 'flat'), label: String(view.label || '').slice(0, 120) };
      });
    }
    if (message.type === 'choose-element') {
      if (!tabId) throw new Error('Choose a webpage first.');
      return chrome.tabs.sendMessage(tabId, { type: 'choose-element', help: message.help });
    }
    if (message.type === 'capture-tab') {
      if (!sender.url?.startsWith(chrome.runtime.getURL('studio.html'))) throw new Error('Open Capture from Studio.');
      const source = await chrome.tabs.get(message.tabId);
      if (!/^https?:/i.test(source.url || '')) throw new Error('Choose a webpage to capture.');
      await chrome.tabs.update(source.id, { active: true });
      try {
        if (message.mode === 'selection') {
          await chooseCaptureElement(source.id, message.help);
        }
        const project = await captureProject(source.id, message.mode, viewports, options);
        return { id: project.id };
      } finally { await chrome.tabs.update(sender.tab.id, { active: true }).catch(() => {}); }
    }
    if (message.type === 'capture-url') {
      if (sender.tab?.url?.startsWith(chrome.runtime.getURL('studio.html')) !== true) throw new Error('Open Capture from the studio.');
      const url = new URL(message.url);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Enter an HTTP or HTTPS webpage URL.');
      const tab = await chrome.tabs.create({ url: url.href, active: true });
      tabId = tab.id;
      try {
        const started = Date.now();
        while ((await chrome.tabs.get(tabId)).status !== 'complete') {
          if (Date.now() - started > 30000) throw new Error('The page took too long to load. Try capturing its open tab.');
          await captureDelay(250);
        }
        await captureDelay(700);
        if (message.mode === 'selection') await chooseCaptureElement(tabId, message.help);
        const project = await captureProject(tabId, message.mode === 'selection' ? 'selection' : 'page', viewports, options);
        return { id: project.id };
      } finally { await chrome.tabs.remove(tabId).catch(() => {}); }
    }
    if (!tabId) throw new Error('Open a webpage to capture it.');
    const project = await captureProject(tabId, message.mode, viewports, options);
    await chrome.tabs.create({ url: chrome.runtime.getURL('studio.html') + '#project=' + project.id });
    return { id: project.id };
  })().then(reply, error => reply({ error: error.message }));
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.type !== 'studio-image' || sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('studio.html'))) return;
  (async () => {
    const url = new URL(message.url);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported image URL.');
    const response = await fetch(url.href, { credentials: 'omit', signal: AbortSignal.timeout(15000) });
    const type = response.headers.get('content-type')?.split(';')[0];
    if (!response.ok || !/^image\/(?:png|jpeg|webp|gif|avif|bmp|svg\+xml)$/i.test(type || '')) throw new Error('Image unavailable. Import a screenshot or use an image from the captured page.');
    if (Number(response.headers.get('content-length')) > 12000000) throw new Error('Image is too large.');
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 12000000) throw new Error('Image is too large.');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let binary = '';
    for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    return { data: `data:${type};base64,${btoa(binary)}` };
  })().then(reply, error => reply({ error: error.message }));
  return true;
});

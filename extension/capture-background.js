importScripts('projects.js', 'extract.js');
const capturingTabs = new Set();
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

async function captureProject(tabId, mode = 'page', widths) {
  if (capturingTabs.has(tabId)) throw new Error('A capture is already running on this tab.');
  capturingTabs.add(tabId);
  const target = { tabId };
  let attached = false;
  const snapshots = [];
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
    for (const viewport of widths?.length ? widths : [null]) {
      if (viewport) {
        await send('Emulation.setDeviceMetricsOverride', { width: viewport, height: 900, deviceScaleFactor: 1, mobile: false });
        await captureDelay(700);
      }
      await send('Runtime.evaluate', { expression: 'Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,2000))]).then(()=>true)', awaitPromise: true });
      const result = await send('Runtime.evaluate', { expression: '(' + atlasExtract.toString() + ')(' + (mode === 'selection') + ')', returnByValue: true });
      if (result.exceptionDetails || !result.result.value) throw new Error('Could not read this page.');
      const snapshot = result.result.value;
      if (!snapshot.width || !snapshot.height || snapshot.width > 16384 || snapshot.height > 30000 || snapshot.width * snapshot.height > 65000000) {
        throw new Error('This page is too large for one image. Use section capture or a smaller viewport.');
      }
      const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
        clip: { x: Math.max(0, snapshot.origin.x), y: Math.max(0, snapshot.origin.y), width: snapshot.width, height: snapshot.height, scale: 1 } });
      snapshots.push({ id: crypto.randomUUID(), ...snapshot, screenshot: 'data:image/png;base64,' + image.data,
        viewport: viewport || Math.round(snapshot.width), capturedAt: Date.now() });
    }
    const project = { id: crypto.randomUUID(), schema: 1, name: snapshots[0].title, sourceUrl: snapshots[0].url,
      createdAt: Date.now(), snapshots, presentation: null, composition: null, flows: [] };
    await atlasProjects.save(project);
    return project;
  } finally {
    if (attached) {
      if (widths?.length) await chrome.debugger.sendCommand(target, 'Emulation.clearDeviceMetricsOverride').catch(() => {});
      await chrome.debugger.detach(target).catch(() => {});
    }
    capturingTabs.delete(tabId);
    await chrome.tabs.sendMessage(tabId, { type: 'capture-restore' }).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !['capture', 'open-studio', 'capture-url', 'choose-element'].includes(message.type)) return;
  (async () => {
    if (message.type === 'open-studio') {
      await chrome.tabs.create({ url: chrome.runtime.getURL('studio.html') });
      return { ok: true };
    }
    let tabId = sender.tab?.id;
    if (message.type === 'choose-element') {
      if (!tabId) throw new Error('Choose a webpage first.');
      return chrome.tabs.sendMessage(tabId, { type: 'choose-element', help: message.help });
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
        const project = await captureProject(tabId, 'page', message.responsive ? [1440, 768, 390] : undefined);
        return { id: project.id };
      } finally { await chrome.tabs.remove(tabId).catch(() => {}); }
    }
    if (!tabId) throw new Error('Open a webpage to capture it.');
    const project = await captureProject(tabId, message.mode, message.responsive ? [1440, 768, 390] : undefined);
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
    if (!response.ok || !/^image\/(?:png|jpeg|webp|gif|avif|bmp)$/i.test(type || '')) throw new Error('Image unavailable. Import a screenshot or use an image from the captured page.');
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

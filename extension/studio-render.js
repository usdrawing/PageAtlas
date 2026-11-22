const atlasRender = (() => {
  const ns = 'http://www.w3.org/2000/svg';
  const node = (tag, attrs = {}, text) => {
    const element = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) if (value !== undefined) element.setAttribute(key, String(value));
    if (text !== undefined) element.textContent = String(text);
    return element;
  };
  const safeImage = value => typeof value === 'string' && /^(?:https?:\/\/|data:image\/|blob:)/i.test(value) ? value : '';
  function cleanSVG(code) {
    if (typeof code !== 'string' || code.length > 2000000) return null;
    const document = new DOMParser().parseFromString(code, 'image/svg+xml');
    if (document.querySelector('parsererror') || document.documentElement.localName !== 'svg') return null;
    const allowed = new Set('svg g path rect circle ellipse line polyline polygon text tspan defs linearGradient radialGradient stop clipPath mask symbol use'.split(' '));
    for (const element of [document.documentElement, ...document.querySelectorAll('*')]) {
      if (!allowed.has(element.localName)) { element.remove(); continue; }
      for (const attr of [...element.attributes]) {
        if (/^on/i.test(attr.name) || ['style', 'class'].includes(attr.name) ||
          (attr.localName === 'href' && !/^#[\w.:-]+$/.test(attr.value)) ||
          (/url\s*\(/i.test(attr.value) && !/^url\(#[\w.:-]+\)$/.test(attr.value))) element.removeAttributeNode(attr);
      }
    }
    return document.documentElement;
  }
  function svg(width, height, background) {
    const root = node('svg', { xmlns: ns, width, height, viewBox: `0 0 ${width} ${height}` });
    if (background) root.append(node('rect', { width, height, fill: background }));
    return root;
  }
  async function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Image could not be loaded.'));
      image.src = url;
    });
  }
  async function crop(snapshot, layer) {
    const image = await loadImage(snapshot.screenshot);
    const canvas = document.createElement('canvas');
    const scale = image.naturalWidth / snapshot.width;
    canvas.width = Math.max(1, Math.ceil(layer.width * scale));
    canvas.height = Math.max(1, Math.ceil(layer.height * scale));
    if (canvas.width * canvas.height > 20000000) return snapshot.screenshot;
    canvas.getContext('2d').drawImage(image, layer.x * scale, layer.y * scale, layer.width * scale, layer.height * scale, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }
  const cropCache = new WeakMap();
  async function layerImage(snapshot, layer) {
    let cached = cropCache.get(layer);
    if (!cached) { cached = crop(snapshot, layer); cropCache.set(layer, cached); }
    return cached;
  }
  async function editable(snapshot) {
    const root = svg(snapshot.width, snapshot.height, '#ffffff');
    const layers = snapshot.layers || [];
    if (!layers.length) root.append(node('image', { width: snapshot.width, height: snapshot.height, href: snapshot.screenshot }));
    // Raster fallbacks preserve non-text media while text and shapes remain editable.
    for (const [index, layer] of layers.entries()) {
      let element;
      if (layer.type === 'text') {
        element = node('text', { x: layer.direction === 'rtl' ? layer.x + layer.width : layer.x, y: layer.y + layer.fontSize * .83, fill: layer.fill,
          'font-family': layer.fontFamily, 'font-size': layer.fontSize, 'font-weight': layer.fontWeight,
          'font-style': layer.fontStyle, direction: layer.direction, 'xml:space': 'preserve' }, layer.text);
      } else if (layer.type === 'rect') {
        element = node('rect', { x: layer.x, y: layer.y, width: layer.width, height: layer.height, rx: layer.radius,
          fill: layer.fill, stroke: layer.borderWidth ? layer.border : 'none', 'stroke-width': layer.borderWidth });
      } else if (layer.type === 'image' || layer.type === 'svg') {
        const vector = layer.type === 'svg' && cleanSVG(layer.code);
        if (vector && !vector.querySelector('use')) {
          element = node('svg', { x: layer.x, y: layer.y, width: layer.width, height: layer.height,
            viewBox: vector.getAttribute('viewBox') || `0 0 ${layer.width} ${layer.height}` });
          for (const attr of ['fill', 'stroke', 'stroke-width']) if (vector.hasAttribute(attr)) element.setAttribute(attr, vector.getAttribute(attr));
          for (const child of [...vector.childNodes]) element.append(child.cloneNode(true));
        } else {
        element = node('image', { x: layer.x, y: layer.y, width: layer.width, height: layer.height,
          href: await layerImage(snapshot, layer), preserveAspectRatio: 'none' });
        }
      }
      if (!element) continue;
      element.dataset.layer = index;
      element.setAttribute('opacity', layer.opacity ?? 1);
      root.append(element);
    }
    return root;
  }
  function wrap(text, max) {
    const lines = [];
    for (const paragraph of String(text || '').split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        if ((line + ' ' + word).length > max && line) { lines.push(line); line = ''; }
        line += (line ? ' ' : '') + word;
      }
      lines.push(line);
    }
    return lines;
  }
  function textBlock(root, text, x, y, width, fontSize, color, weight = 400, maxLines = 12) {
    const element = node('text', { x, y, fill: color, 'font-family': 'Arial, sans-serif', 'font-size': fontSize, 'font-weight': weight });
    const lines = wrap(text, Math.max(8, Math.floor(width / (fontSize * .55)))).slice(0, maxLines);
    lines.forEach((line, index) => element.append(node('tspan', { x, dy: index ? fontSize * 1.28 : 0 }, line)));
    root.append(element);
    return lines.length * fontSize * 1.28;
  }
  const devices = {
    iphone: { width: 390, height: 844, frame: 15, radius: 46, name: 'iPhone' },
    android: { width: 412, height: 892, frame: 12, radius: 31, name: 'Android' },
    ipad: { width: 820, height: 1180, frame: 25, radius: 35, name: 'iPad' },
    tablet: { width: 800, height: 1100, frame: 22, radius: 28, name: 'Tablet' },
    laptop: { width: 1440, height: 900, frame: 28, radius: 22, name: 'Laptop' },
    desktop: { width: 1600, height: 1000, frame: 24, radius: 16, name: 'Desktop' },
    browser: { width: 1440, height: 900, frame: 14, radius: 12, name: 'Browser' },
    flat: { width: 0, height: 0, frame: 0, radius: 6, name: 'Screenshot' }
  };
  function device(root, image, deviceName, x, y, targetWidth, rotation, index, imageSize, cropY = 0) {
    const d = { ...(devices[deviceName] || devices.iphone) };
    if (deviceName === 'flat') { d.width = imageSize.width; d.height = Math.min(imageSize.height, imageSize.width * 1.6); }
    const scale = targetWidth / (d.width + d.frame * 2);
    const w = d.width + d.frame * 2, h = d.height + d.frame * 2;
    const group = node('g', { transform: `translate(${x} ${y}) rotate(${rotation} ${targetWidth / 2} ${h * scale / 2}) scale(${scale})` });
    group.append(node('rect', { x: 8, y: 20, width: w, height: h, rx: d.radius + 3, fill: '#000000', opacity: .14, filter: 'url(#device-shadow)' }));
    group.append(node('rect', { width: w, height: h, rx: d.radius, fill: '#171b1d', stroke: '#6b7479', 'stroke-width': 2 }));
    const clipId = 'screen-' + index;
    const defs = node('defs');
    const clip = node('clipPath', { id: clipId });
    clip.append(node('rect', { x: d.frame, y: d.frame, width: d.width, height: d.height, rx: Math.max(1, d.radius - d.frame) }));
    defs.append(clip);
    group.append(defs);
    const screen = node('g', { 'clip-path': `url(#${clipId})` });
    screen.append(node('rect', { x: d.frame, y: d.frame, width: d.width, height: d.height, fill: '#ffffff' }));
    const scaledHeight = imageSize.height / imageSize.width * d.width;
    screen.append(node('image', { x: d.frame, y: d.frame - Math.max(0, scaledHeight - d.height) * cropY,
      width: d.width, height: scaledHeight, href: image, preserveAspectRatio: 'none' }));
    group.append(screen);
    if (deviceName === 'iphone') group.append(node('rect', { x: w / 2 - 58, y: d.frame + 9, width: 116, height: 29, rx: 15, fill: '#111315' }));
    if (deviceName === 'android') group.append(node('circle', { cx: w / 2, cy: d.frame + 13, r: 5, fill: '#111315' }));
    if (deviceName === 'laptop') group.append(node('path', { d: `M-60 ${h - 3} H${w + 60} L${w + 30} ${h + 25} H-30Z`, fill: '#bdc5c8', stroke: '#778086', 'stroke-width': 2 }));
    if (deviceName === 'desktop') {
      group.append(node('path', { d: `M${w * .44} ${h}H${w * .56}L${w * .59} ${h + 130}H${w * .41}Z`, fill: '#aab3b9' }));
      group.append(node('rect', { x: w * .3, y: h + 127, width: w * .4, height: 15, rx: 7, fill: '#ccd1d4' }));
    }
    root.append(group);
    return h * scale;
  }
  function composition(snapshots, config) {
    const { width, height, background, title, subtitle, device: deviceName, arrangement = 'single', rotation = 0, crop = 0 } = config;
    const root = svg(width, height, background);
    const defs = node('defs');
    const filter = node('filter', { id: 'device-shadow', x: '-30%', y: '-30%', width: '170%', height: '170%' });
    filter.append(node('feGaussianBlur', { stdDeviation: 16 }));
    defs.append(filter);
    root.append(defs);
    const padding = width * .075;
    let top = height * .08;
    if (title) top += textBlock(root, title, padding, top + width * .055, width - padding * 2, width * .055, config.foreground || '#143e2a', 700, 3) + height * .025;
    if (subtitle) top += textBlock(root, subtitle, padding, top + width * .023, width - padding * 2, width * .023, config.foreground || '#143e2a', 400, 3) + height * .03;
    const count = arrangement === 'single' ? 1 : Math.min(3, Math.max(2, snapshots.length));
    const available = height - top - height * .08;
    for (let index = 0; index < count; index++) {
      const snapshot = snapshots[index % snapshots.length];
      const name = arrangement === 'mixed' ? ['laptop', 'iphone', 'ipad'][index] : deviceName;
      const d = devices[name] || devices.iphone;
      const ratio = name === 'flat' ? Math.min(snapshot.height / snapshot.width, 1.6) : (d.height + d.frame * 2 + (name === 'desktop' ? 145 : 25)) / (d.width + d.frame * 2);
      const cell = (width - padding * 2) / count;
      const deviceWidth = Math.min(cell * (count === 1 ? .95 : .85), available / ratio);
      const left = padding + cell * index + (cell - deviceWidth) / 2;
      const angle = arrangement === 'angled' ? (index - (count - 1) / 2) * 9 : rotation;
      device(root, snapshot.screenshot, name, left, top + (available - deviceWidth * ratio) / 2, deviceWidth, angle, index, snapshot, crop);
    }
    return root;
  }
  function slide(slide, theme = {}) {
    const root = svg(1600, 900, slide.background || theme.background || '#f4f6ef');
    const ink = slide.color || theme.color || '#153b29';
    const accent = theme.accent || '#176248';
    root.append(node('rect', { x: 72, y: 74, width: 44, height: 5, rx: 2, fill: accent }));
    const hasImage = safeImage(slide.image);
    const textWidth = hasImage ? 680 : 1390;
    const titleHeight = textBlock(root, slide.title, 80, 173, textWidth, slide.layout === 'cover' ? 80 : 58, ink, 700, 4);
    let top = 173 + titleHeight + 45;
    if (slide.body) top += textBlock(root, slide.body, 84, top, textWidth, 30, ink, 400, 7) + 36;
    for (const bullet of (slide.bullets || []).slice(0, 6)) {
      root.append(node('circle', { cx: 90, cy: top - 8, r: 5, fill: accent }));
      top += textBlock(root, bullet, 112, top, textWidth - 35, 28, ink, 400, 3) + 21;
    }
    if (hasImage) root.append(node('image', { x: 850, y: 100, width: 670, height: 700, href: hasImage, preserveAspectRatio: 'xMidYMid meet' }));
    if (slide.footer) textBlock(root, slide.footer, 84, 854, 1400, 18, ink, 400, 1);
    return root;
  }
  function serialize(svgElement) {
    const clone = svgElement.cloneNode(true);
    clone.querySelectorAll('[data-layer]').forEach(element => { element.removeAttribute('data-layer'); element.removeAttribute('class'); });
    return new XMLSerializer().serializeToString(clone);
  }
  async function raster(root, type = 'image/png', scale = 1) {
    const width = Number(root.getAttribute('width')) * scale;
    const height = Number(root.getAttribute('height')) * scale;
    if (width * height > 65000000 || width > 16384 || height > 30000) throw new Error('Choose smaller output dimensions.');
    const objectURL = URL.createObjectURL(new Blob([serialize(root)], { type: 'image/svg+xml' }));
    try {
      const image = await loadImage(objectURL);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (type === 'image/jpeg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); }
      context.drawImage(image, 0, 0, width, height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, type, .94));
      if (!blob) throw new Error('Export failed.');
      return blob;
    } finally { URL.revokeObjectURL(objectURL); }
  }
  function download(data, name, type = 'application/octet-stream') {
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 180);
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
  async function zip(files) {
    const chunks = [], directory = [];
    const encoder = new TextEncoder();
    let offset = 0;
    const crcTable = Array.from({ length: 256 }, (_, i) => { for (let j = 0; j < 8; j++) i = i & 1 ? 0xedb88320 ^ (i >>> 1) : i >>> 1; return i >>> 0; });
    for (const file of files) {
      const data = new Uint8Array(await file.blob.arrayBuffer());
      const name = encoder.encode(file.name);
      let crc = 0xffffffff;
      for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
      crc = (crc ^ 0xffffffff) >>> 0;
      const header = new Uint8Array(30), view = new DataView(header.buffer);
      view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true);
      view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true); view.setUint16(26, name.length, true);
      chunks.push(header, name, data);
      const central = new Uint8Array(46), cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
      directory.push(central, name);
      offset += header.length + name.length + data.length;
    }
    const centralSize = directory.reduce((sum, chunk) => sum + chunk.length, 0);
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
    return new Blob([...chunks, ...directory, end], { type: 'application/zip' });
  }
  return { node, svg, safeImage, cleanSVG, loadImage, crop, editable, composition, slide, devices, serialize, raster, download, zip, textBlock };
})();

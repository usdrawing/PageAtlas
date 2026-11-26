/* This function is self-contained so it can execute in a captured page. */
function atlasExtract(selection) {
  const root = selection ? document.querySelector('[data-pageatlas-selected]') : document.body;
  if (!root) throw new Error('The selected element is no longer available. Select it again.');
  const selectedRect = root.getBoundingClientRect();
  const origin = selection ? { x: selectedRect.x + scrollX, y: selectedRect.y + scrollY } : { x: 0, y: 0 };
  const width = selection ? selectedRect.width : Math.max(document.documentElement.scrollWidth, innerWidth);
  const height = selection ? selectedRect.height : Math.max(document.documentElement.scrollHeight, innerHeight);
  const layers = [], images = [], fonts = new Map(), colors = new Set(), components = [];
  const clean = text => (text || '').replace(/\s+/g, ' ').trim();
  const box = rect => ({ x: rect.x + scrollX - origin.x, y: rect.y + scrollY - origin.y, width: rect.width, height: rect.height });
  const visible = element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility === 'visible' && style.display !== 'none' && Number(style.opacity) > 0;
  };
  for (const node of [root, ...root.querySelectorAll('*')]) {
    if (node.closest('page-atlas-panel,script,style,noscript,[hidden]') || !visible(node)) continue;
    const style = getComputedStyle(node);
    const rect = box(node.getBoundingClientRect());
    for (const color of [style.color, style.backgroundColor, style.borderTopColor]) {
      if (color && !['rgba(0, 0, 0, 0)', 'transparent'].includes(color)) colors.add(color);
    }
    const family = style.fontFamily;
    if (clean(node.textContent)) fonts.set(family + style.fontSize + style.fontWeight, { family, size: style.fontSize, weight: style.fontWeight });
    if (layers.length < 10000 && (style.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(style.borderTopWidth) > 0)) {
      layers.push({ type: 'rect', ...rect, fill: style.backgroundColor, border: style.borderTopColor,
        borderWidth: parseFloat(style.borderTopWidth), radius: parseFloat(style.borderTopLeftRadius) || 0, opacity: Number(style.opacity) });
    }
    if (node.matches('canvas,video,iframe') || style.backgroundImage !== 'none') {
      if (layers.length < 10000) layers.push({ type: 'image', ...rect, label: node.getAttribute('aria-label') || node.localName, rasterFallback: true });
    }
    if (node instanceof HTMLImageElement && node.currentSrc) {
      const asset = { type: 'image', ...rect, url: node.currentSrc, label: node.alt || 'Image', fit: style.objectFit };
      images.push(asset);
      if (layers.length < 10000) layers.push(asset);
    } else if (node instanceof SVGSVGElement) {
      const clone = node.cloneNode(true);
      const originals = [node, ...node.querySelectorAll('*')];
      [clone, ...clone.querySelectorAll('*')].forEach((part, index) => {
        const computed = getComputedStyle(originals[index]);
        for (const property of ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'font-family', 'font-size', 'font-weight']) part.setAttribute(property, computed.getPropertyValue(property));
      });
      if (layers.length < 10000) layers.push({ type: 'svg', ...rect, code: new XMLSerializer().serializeToString(clone), label: node.getAttribute('aria-label') || 'SVG' });
    }
    if (node.closest('svg')) continue;
    for (const child of node.childNodes) {
      if (child.nodeType !== Node.TEXT_NODE || !clean(child.textContent) || layers.length >= 10000) continue;
      // Word ranges preserve line wrapping without flattening an entire paragraph.
      const tokens = /\S+\s*/g;
      for (const match of child.textContent.matchAll(tokens)) {
        if (layers.length >= 10000) break;
        const range = document.createRange();
        range.setStart(child, match.index);
        range.setEnd(child, match.index + match[0].length);
        const r = range.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        layers.push({ type: 'text', ...box(r), text: match[0], fill: style.color, fontFamily: family,
          fontSize: parseFloat(style.fontSize), fontWeight: style.fontWeight, fontStyle: style.fontStyle,
          direction: style.direction, opacity: Number(style.opacity) });
      }
    }
    if (node.matches('button,[role=button],input,select') && components.length < 80) {
      components.push({ label: clean(node.innerText || node.getAttribute('aria-label') || node.getAttribute('placeholder')).slice(0, 100),
        ...rect, fill: style.backgroundColor, color: style.color, radius: parseFloat(style.borderRadius) || 0, fontFamily: family, fontSize: parseFloat(style.fontSize) });
    }
  }
  const meta = selector => clean(document.querySelector(selector)?.getAttribute('content'));
  let structured = {};
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    if (script.textContent.length > 150000) continue;
    try {
      const value = JSON.parse(script.textContent);
      const entries = Array.isArray(value) ? value : value['@graph'] || [value];
      const organization = entries.find(item => /Organization|WebSite|SoftwareApplication|Product/i.test(String(item['@type'])));
      if (organization) structured = { ...structured, ...organization };
    } catch {}
  }
  const logoValue = typeof structured.logo === 'string' ? structured.logo : structured.logo?.url || structured.logo?.contentUrl;
  const logoNode = document.querySelector('header img[alt*="logo" i],img[class*="logo" i],a[aria-label*="home" i] img');
  let logo = logoValue || logoNode?.currentSrc || document.querySelector('link[rel~="icon"]')?.href || '';
  try { logo = new URL(logo, location.href).href; if (!/^https?:/.test(logo)) logo = ''; } catch { logo = ''; }
  const bodyStyle = getComputedStyle(document.body);
  const brand = { title: meta('meta[property="og:title"]') || structured.name || document.title,
    description: meta('meta[name="description"]') || meta('meta[property="og:description"]') || structured.description || '',
    logo, themeColor: meta('meta[name="theme-color"]'), color: bodyStyle.color,
    background: bodyStyle.backgroundColor === 'rgba(0, 0, 0, 0)' ? '#eef3eb' : bodyStyle.backgroundColor,
    fontFamily: bodyStyle.fontFamily, direction: bodyStyle.direction };
  return { width, height, origin, brand, title: document.title || clean(root.matches('h1') ? root.innerText : root.querySelector('h1')?.innerText) || location.hostname, url: location.href,
    text: clean(root.innerText).slice(0, 60000), layers, images, colors: [...colors].slice(0, 200),
    typography: [...fonts.values()].slice(0, 150), components,
    headings: [...root.querySelectorAll('h1,h2,h3')].filter(visible).map(node => clean(node.innerText)).slice(0, 100),
    truncated: layers.length >= 10000 };
}

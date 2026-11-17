const atlasInspect = (() => {
  const svgNS = 'http://www.w3.org/2000/svg';
  const geometry = new Set('svg g path circle ellipse rect line polyline polygon'.split(' '));
  const attributes = 'viewBox d cx cy r rx ry x y x1 y1 x2 y2 width height points fill stroke stroke-width stroke-linecap stroke-linejoin fill-rule clip-rule transform opacity'.split(' ');
  const glyphs = /[\p{Extended_Pictographic}\u2190-\u21ff\u2600-\u27bf](?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic})*/gu;
  const safeURL = (value, image = false) => {
    if (!value) return '';
    try {
      const url = new URL(value, location.href);
      return /^https?:$|^blob:$/.test(url.protocol) || image && /^data:image\//i.test(value) ? url.href : '';
    } catch { return ''; }
  };
  function vector(node) {
    const clone = element => {
      if (!geometry.has(element.localName)) return null;
      const result = document.createElementNS(svgNS, element.localName);
      for (const key of attributes) {
        const value = element.getAttribute(key);
        if (value && !/url\s*\(/i.test(value)) result.setAttribute(key, value);
      }
      for (const child of element.children) {
        const safe = clone(child);
        if (safe) result.append(safe);
      }
      return result;
    };
    const svg = clone(node);
    if (!svg?.querySelector('path,circle,ellipse,rect,line,polyline,polygon')) return '';
    if (!svg.hasAttribute('viewBox')) svg.setAttribute('viewBox', '0 0 ' + (parseFloat(node.getAttribute('width')) || 24) + ' ' + (parseFloat(node.getAttribute('height')) || 24));
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    for (const key of ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']) {
      if (!svg.hasAttribute(key)) svg.setAttribute(key, getComputedStyle(node).getPropertyValue(key));
    }
    return new XMLSerializer().serializeToString(svg);
  }
  function identify(node) {
    const classes = node.getAttribute('class') || '';
    const material = /(?:material-icons|material-symbols|MuiSvgIcon)/i.test(classes) ||
      (/Material Icons|Material Symbols/i.test(getComputedStyle(node).fontFamily) && node.textContent.trim().length > 0);
    const lucide = /(?:^|\s)lucide(?:\s|-)/i.test(classes) || node.hasAttribute('data-lucide');
    if (!material && !lucide && node.localName !== 'svg') return null;
    const name = node.getAttribute('aria-label') || node.getAttribute('data-lucide') ||
      classes.match(/(?:^|\s)lucide-([\w-]+)/)?.[1] || node.getAttribute('data-testid')?.replace(/Icon$/, '') ||
      node.querySelector('title')?.textContent || node.closest('button,a')?.getAttribute('aria-label');
    const ligature = material && node.localName !== 'svg' && node.textContent.trim().slice(0, 80);
    return { source: material ? 'Material' : lucide ? 'Lucide' : 'SVG',
      label: name || ligature, svg: node.localName === 'svg' ? vector(node) : '',
      glyph: ligature || '', font: ligature ? getComputedStyle(node).fontFamily : '' };
  }
  function colors(root) {
    const result = new Map();
    const properties = ['color', 'backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'fill', 'stroke'];
    for (const node of [root, ...root.querySelectorAll('*')]) {
      if (!node.getClientRects().length || node.closest('[hidden],[inert]')) continue;
      const style = getComputedStyle(node);
      if (style.visibility !== 'visible') continue;
      const found = new Set();
      const values = [style.backgroundImage, style.boxShadow, style.textShadow];
      for (const property of properties) {
        if (property.startsWith('border') && !parseFloat(style[property.replace('Color', 'Width')])) continue;
        if (['fill', 'stroke'].includes(property) && !(node instanceof SVGElement)) continue;
        values.push(style[property]);
      }
      for (const match of values.join(' ').matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/g)) {
        if (Number(match[4]) === 0) continue;
        const channels = match.slice(1, 4).map(Number);
        if (match[4] && Number(match[4]) < 1) channels.push(Math.round(Number(match[4]) * 255));
        found.add('#' + channels.map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase());
      }
      for (const value of found) result.set(value, (result.get(value) || 0) + 1);
    }
    return [...result].sort((a, b) => b[1] - a[1]).map(([value]) => value);
  }
  function paletteSVG(colors) {
    const columns = Math.min(8, colors.length);
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + columns * 96 + '" height="' +
      Math.ceil(colors.length / columns) * 78 + '">' + colors.map((color, index) => {
        const x = index % columns * 96, y = Math.floor(index / columns) * 78;
        return '<rect x="' + x + '" y="' + y + '" width="90" height="52" rx="5" fill="' + color +
          '"/><text x="' + (x + 4) + '" y="' + (y + 69) + '" font-size="12" font-family="sans-serif">' + color + '</text>';
      }).join('') + '</svg>';
  }
  return { safeURL, identify, glyphs, colors, paletteSVG };
})();

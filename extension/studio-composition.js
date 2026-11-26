/* One composition engine is shared by the preview, clipboard and all exports. */
const atlasComposition = (() => {
  const { node, svg, textBlock } = atlasRender;
  let sequence = 0;
  const models = {
    iphone: { name: 'iPhone · titanium', width: 390, height: 844, bezel: 10, radius: 49, family: 'phone', metal: '#8d9294' },
    android: { name: 'Android · graphite', width: 412, height: 915, bezel: 8, radius: 32, family: 'phone', metal: '#5c6268' },
    ipad: { name: 'iPad · space gray', width: 820, height: 1180, bezel: 22, radius: 36, family: 'tablet', metal: '#8b9198' },
    tablet: { name: 'Android tablet', width: 800, height: 1280, bezel: 18, radius: 25, family: 'tablet', metal: '#6a7177' },
    macbook: { name: 'MacBook · silver', width: 1440, height: 900, bezel: 20, radius: 24, family: 'laptop', metal: '#c0c6cb' },
    windows: { name: 'Windows laptop', width: 1366, height: 768, bezel: 17, radius: 15, family: 'laptop', metal: '#68717b' },
    imac: { name: 'iMac · silver', width: 1920, height: 1080, bezel: 18, radius: 21, family: 'monitor', metal: '#c5cbce' },
    desktop: { name: 'Windows monitor', width: 1920, height: 1080, bezel: 14, radius: 12, family: 'monitor', metal: '#3e4751' },
    browser: { name: 'Browser window', width: 1440, height: 900, bezel: 10, radius: 16, family: 'browser', metal: '#d9dfe2' },
    flat: { name: 'Screenshot only', width: 0, height: 0, bezel: 0, radius: 0, family: 'flat', metal: '#000000' }
  };
  models.laptop = models.macbook;
  Object.assign(atlasRender.devices, models);
  const templates = {
    gallery: { name: 'Gallery', text: false },
    cascade: { name: 'Cascade', text: false },
    spotlight: { name: 'Spotlight', text: false },
    grid: { name: 'Grid', text: false },
    editorial: { name: 'Editorial', text: true },
    campaign: { name: 'Campaign', text: true },
    headline: { name: 'Headline', text: true },
    showcase: { name: 'Showcase', text: true }
  };
  function defaultDevice(snapshot) {
    if (snapshot.captureDevice) return snapshot.captureDevice;
    const width = snapshot.viewport || snapshot.width;
    return width > 1100 ? 'macbook' : width > 600 ? 'ipad' : 'iphone';
  }
  function selected(project, config, fallback) {
    if (Array.isArray(config.selectedIds)) return project.snapshots.filter(snapshot => config.selectedIds.includes(snapshot.id));
    return config.arrangement === 'single' ? [fallback || project.snapshots[0]] : project.snapshots;
  }
  function modelFor(snapshot, config) {
    const override = config.screenOptions?.[snapshot.id] || {};
    const name = override.device || snapshot.captureDevice || config.device || defaultDevice(snapshot);
    return { ...override, name: config.withMockup === false ? 'flat' : (models[name] ? name : defaultDevice(snapshot)) };
  }
  function dimensions(snapshot, name) {
    const model = models[name] || models.iphone;
    const d = { ...model };
    if (name === 'flat') { d.width = snapshot.width; d.height = snapshot.height; }
    const chin = name === 'imac' ? 100 : 0;
    const top = d.family === 'browser' ? 46 : 0;
    const w = d.width + d.bezel * 2;
    const h = d.height + d.bezel * 2 + chin + top;
    const extra = d.family === 'monitor' ? 220 : d.family === 'laptop' ? 34 : 0;
    const wide = d.family === 'laptop' ? 100 : 0;
    return { ...d, w, h, totalWidth: w + wide, totalHeight: h + extra, chin, top, wide };
  }
  function drawDevice(root, snapshot, option, box, index, config) {
    const d = dimensions(snapshot, option.name);
    const scale = Math.min(box.width / d.totalWidth, box.height / d.totalHeight);
    const left = box.x + (box.width - d.totalWidth * scale) / 2;
    const top = box.y + (box.height - d.totalHeight * scale) / 2;
    const wrapper = node('g', { 'data-screen-id': snapshot.id, 'data-device': option.name,
      transform: `translate(${left} ${top}) rotate(${box.angle || 0} ${d.totalWidth * scale / 2} ${d.totalHeight * scale / 2}) scale(${scale})` });
    const group = node('g', { transform: `translate(${d.wide / 2} 0)` });
    wrapper.append(group);
    const id = root.id + '-device-' + index;
    const defs = node('defs');
    const metal = node('linearGradient', { id: id + '-metal', x1: '0', x2: '1', y1: '0', y2: '1' });
    for (const [offset, color] of [[0, '#e1e5e7'], [.16, d.metal], [.53, '#50585e'], [.81, d.metal], [1, '#e2e6e7']]) metal.append(node('stop', { offset, 'stop-color': color }));
    defs.append(metal);
    const clip = node('clipPath', { id: id + '-clip' });
    clip.append(node('rect', { x: d.bezel, y: d.bezel + d.top, width: d.width, height: d.height, rx: Math.max(0, d.radius - d.bezel) }));
    defs.append(clip);
    group.append(defs);
    if (config.shadow !== false) group.append(node('rect', { x: 5, y: 20, width: d.w, height: d.h, rx: d.radius, fill: '#000000', opacity: .2, filter: `url(#${root.id}-shadow)` }));
    if (d.family !== 'flat') {
      group.append(node('rect', { x: -2, y: -2, width: d.w + 4, height: d.h + 4, rx: d.radius + 2, fill: `url(#${id}-metal)` }));
      group.append(node('rect', { x: 1, y: 1, width: d.w - 2, height: d.h - 2, rx: d.radius, fill: '#111416', stroke: '#343a3e', 'stroke-width': 1.2 }));
    }
    const screen = node('g', { 'clip-path': `url(#${id}-clip)` });
    screen.append(node('rect', { x: d.bezel, y: d.bezel + d.top, width: d.width, height: d.height, fill: '#ffffff' }));
    const imageHeight = snapshot.height / snapshot.width * d.width;
    const fit = option.fit || config.fit || 'cover';
    if (fit === 'contain') screen.append(node('image', { x: d.bezel, y: d.bezel + d.top, width: d.width, height: d.height, href: snapshot.screenshot, preserveAspectRatio: 'xMidYMin meet' }));
    else screen.append(node('image', { x: d.bezel, y: d.bezel + d.top - Math.max(0, imageHeight - d.height) * (option.crop ?? config.crop ?? 0), width: d.width, height: imageHeight, href: snapshot.screenshot, preserveAspectRatio: 'none' }));
    group.append(screen);
    const camera = option.camera ?? config.camera ?? true;
    const notch = option.notch || config.notch || 'island';
    if (d.family === 'phone') {
      if (option.name === 'iphone' && notch !== 'none') {
        const island = notch === 'island';
        group.append(node('rect', { x: d.w / 2 - (island ? 55 : 84), y: island ? d.bezel + 9 : d.bezel - 1,
          width: island ? 110 : 168, height: island ? 28 : 34, rx: island ? 15 : 17, fill: '#080b0d' }));
        if (camera) group.append(node('circle', { cx: d.w / 2 + (island ? 35 : 54), cy: d.bezel + 22, r: 4, fill: '#162b3c', stroke: '#222c34', 'stroke-width': 1 }));
      } else if (option.name === 'android' && camera) {
        group.append(node('circle', { cx: d.w / 2, cy: d.bezel + 15, r: 6, fill: '#070a0c', stroke: '#333c44', 'stroke-width': 1.5 }));
        group.append(node('circle', { cx: d.w / 2, cy: d.bezel + 15, r: 2, fill: '#192e42' }));
      }
    }
    if (d.family === 'phone') {
      group.append(node('rect', { x: -4, y: d.h * .2, width: 3, height: 42, rx: 1, fill: '#777e84' }));
      group.append(node('rect', { x: d.w + 1, y: d.h * .26, width: 3, height: 64, rx: 1, fill: '#777e84' }));
      group.append(node('rect', { x: d.w / 2 - 49, y: d.h - d.bezel - 9, width: 98, height: 4, rx: 2, fill: '#777e84', opacity: .6 }));
    }
    if (camera && ['tablet', 'laptop', 'monitor'].includes(d.family)) group.append(node('circle', { cx: d.w / 2, cy: d.bezel / 2, r: d.family === 'tablet' ? 3.5 : 3, fill: '#1c3348', stroke: '#0b0f13', 'stroke-width': 2 }));
    if (d.family === 'laptop') {
      group.append(node('path', { d: `M-50 ${d.h - 2} H${d.w + 50} V${d.h + 12} Q${d.w + 38} ${d.h + 32} ${d.w + 5} ${d.h + 32} H-5 Q-38 ${d.h + 32} -50 ${d.h + 12}Z`, fill: `url(#${id}-metal)` }));
      group.append(node('path', { d: `M${d.w * .41} ${d.h - 1} H${d.w * .59} L${d.w * .58} ${d.h + 10} H${d.w * .42}Z`, fill: '#737c84', opacity: .7 }));
      group.append(node('path', { d: `M-42 ${d.h + 14} H${d.w + 42}`, stroke: '#f1f3f5', 'stroke-width': 1.2, opacity: .6 }));
    }
    if (d.family === 'monitor') {
      if (d.chin) group.append(node('rect', { x: 0, y: d.height + d.bezel * 2, width: d.w, height: d.chin, fill: d.metal }));
      group.append(node('path', { d: `M${d.w * .455} ${d.h}H${d.w * .545}L${d.w * .57} ${d.h + 188}H${d.w * .43}Z`, fill: `url(#${id}-metal)` }));
      group.append(node('path', { d: `M${d.w * .32} ${d.h + 185}H${d.w * .68}L${d.w * .72} ${d.h + 208}H${d.w * .28}Z`, fill: d.metal, stroke: '#90989f', 'stroke-width': 1 }));
    }
    if (d.family === 'browser') {
      group.append(node('rect', { x: d.bezel, y: d.bezel, width: d.width, height: d.top, fill: '#e9ecee' }));
      [0, 1, 2].forEach((n) => group.append(node('circle', { cx: d.bezel + 20 + n * 19, cy: d.bezel + 22, r: 5, fill: ['#ed6a5f', '#f5bf4f', '#61c554'][n] })));
      group.append(node('rect', { x: d.w * .25, y: d.bezel + 9, width: d.w * .5, height: 26, rx: 7, fill: '#ffffff' }));
    }
    root.append(wrapper);
  }
  function composition(snapshots, config) {
    const width = Number(config.width) || 1600, height = Number(config.height) || 1200;
    const root = svg(width, height, config.transparent ? null : config.background || '#e6eee3');
    root.dataset.transparent = String(Boolean(config.transparent));
    root.id = 'pageatlas-composition-' + (++sequence);
    const defs = node('defs'), filter = node('filter', { id: root.id + '-shadow', x: '-40%', y: '-40%', width: '190%', height: '200%' });
    filter.append(node('feGaussianBlur', { stdDeviation: 16 })); defs.append(filter); root.append(defs);
    if (!snapshots.length) return root;
    const withText = config.showText ?? Boolean(config.title || config.subtitle);
    const name = templates[config.template] && templates[config.template].text === withText ? config.template : withText ? 'editorial' : 'gallery';
    const padding = Math.min(width, height) * .075;
    let area = { x: padding, y: padding, width: width - padding * 2, height: height - padding * 2 };
    const ink = config.foreground || '#153b29';
    const family = config.fontFamily || 'Arial, sans-serif';
    const rtl = config.direction === 'rtl';
    function words(text, x, y, maxWidth, size, weight, lines) {
      const target = node('g'); root.append(target);
      const used = textBlock(target, text, x, y, maxWidth, size, ink, weight, lines);
      target.querySelectorAll('text').forEach(element => {
        element.setAttribute('font-family', family);
        if (rtl) { element.setAttribute('direction', 'rtl'); element.setAttribute('x', x + maxWidth); element.querySelectorAll('tspan').forEach(span => span.setAttribute('x', x + maxWidth)); }
        if (name === 'headline') {
          element.setAttribute('text-anchor', 'middle'); element.setAttribute('x', x + maxWidth / 2);
          element.querySelectorAll('tspan').forEach(span => span.setAttribute('x', x + maxWidth / 2));
        }
      });
      return used;
    }
    if (withText) {
      const side = name === 'editorial' && width > height * 1.08;
      const textWidth = side ? area.width * .35 : area.width * .9;
      const x = rtl && side ? width - padding - textWidth : padding;
      let y = side ? height * .28 : padding + width * .045;
      if (config.showLogo && config.logo && atlasRender.safeImage(config.logo)) {
        root.append(node('image', { x, y: side ? padding : padding * .55, width: textWidth * .45, height: Math.min(60, height * .06), href: config.logo, preserveAspectRatio: 'xMinYMid meet' }));
        if (!side) y += height * .055;
      }
      const size = Math.min(side ? width * .044 : width * .049, height * .075);
      const used = words(config.title || '', x, y, textWidth, size, 700, 3);
      words(config.subtitle || '', x, y + used + size * .7, textWidth, size * .4, 400, 4);
      if (side) { area.width *= .59; area.x = rtl ? padding : width - padding - area.width; }
      else { const reserved = Math.max(height * .23, used + size * 3); area.y += reserved; area.height -= reserved; }
    }
    if (!withText && config.showLogo && atlasRender.safeImage(config.logo)) {
      root.append(node('image', { x: padding, y: padding * .5, width: width * .16, height: height * .055, href: config.logo, preserveAspectRatio: 'xMinYMid meet' }));
      area.y += height * .055; area.height -= height * .055;
    }
    const count = snapshots.length;
    const options = snapshots.map(snapshot => modelFor(snapshot, config));
    const ratios = snapshots.map((snapshot, index) => { const d = dimensions(snapshot, options[index].name); return d.totalWidth / d.totalHeight; });
    if (name !== 'grid' && count === 3 && ratios[0] > 1 && area.width < area.height * .95) {
      const gap = Math.min(area.width, area.height) * .045;
      const topHeight = area.height * .45;
      drawDevice(root, snapshots[0], options[0], { x: area.x, y: area.y, width: area.width, height: topHeight, angle: 0 }, 0, config);
      const rowHeight = Math.min(area.height - topHeight - gap, (area.width - gap) / (ratios[1] + ratios[2]));
      let x = area.x + (area.width - rowHeight * (ratios[1] + ratios[2]) - gap) / 2;
      snapshots.slice(1).forEach((snapshot, index) => {
        const cellWidth = rowHeight * ratios[index + 1];
        drawDevice(root, snapshot, options[index + 1], { x, y: area.y + topHeight + gap, width: cellWidth, height: rowHeight, angle: 0 }, index + 1, config);
        x += cellWidth + gap;
      });
      return root;
    }
    if (['spotlight', 'showcase'].includes(name) && count > 1 && count <= 3 && area.width > area.height * .9) {
      const gap = area.width * .045;
      const primaryWidth = area.width * .64;
      drawDevice(root, snapshots[0], options[0], { x: area.x, y: area.y, width: primaryWidth, height: area.height, angle: 0 }, 0, config);
      snapshots.slice(1).forEach((snapshot, index) => {
        const cellHeight = (area.height - gap * (count - 2)) / (count - 1);
        drawDevice(root, snapshot, options[index + 1], { x: area.x + primaryWidth + gap, y: area.y + index * (cellHeight + gap),
          width: area.width - primaryWidth - gap, height: cellHeight, angle: 0 }, index + 1, config);
      });
      return root;
    }
    const grid = name === 'grid' || (count > 3) || (area.width < area.height * .9 && count > 2);
    const rows = grid ? Math.ceil(count / Math.ceil(Math.sqrt(count * area.width / area.height))) : 1;
    const cols = Math.ceil(count / rows);
    const gap = Math.min(area.width, area.height) * .045;
    if (grid) {
      snapshots.forEach((snapshot, index) => drawDevice(root, snapshot, options[index], {
        x: area.x + index % cols * (area.width + gap) / cols, y: area.y + Math.floor(index / cols) * (area.height + gap) / rows,
        width: (area.width - gap * (cols - 1)) / cols, height: (area.height - gap * (rows - 1)) / rows, angle: 0
      }, index, config));
    } else {
      const availableWidth = area.width - gap * (count - 1);
      const maxHeight = Math.min(area.height * .94, availableWidth / ratios.reduce((a, b) => a + b, 0));
      const totalWidth = maxHeight * ratios.reduce((a, b) => a + b, 0) + gap * (count - 1);
      let x = area.x + (area.width - totalWidth) / 2;
      snapshots.forEach((snapshot, index) => {
        const angle = ['cascade', 'campaign'].includes(name) ? (index - (count - 1) / 2) * 5 : config.rotation || 0;
        const margin = Math.abs(angle) > 0 ? .1 : 0;
        const cellWidth = maxHeight * ratios[index];
        drawDevice(root, snapshot, options[index], { x: x + cellWidth * margin / 2, y: area.y + (area.height - maxHeight) / 2 + (name === 'cascade' && index % 2 ? maxHeight * .04 : 0), width: cellWidth * (1 - margin), height: maxHeight * (1 - margin), angle }, index, config);
        x += cellWidth + gap;
      });
    }
    return root;
  }
  function defaults(project) {
    const snapshot = project.snapshots[0];
    const brand = snapshot.brand || {};
    return { width: 1600, height: 1200, background: brand.themeColor || brand.background || '#e6eee3', foreground: brand.themeColor ? contrast(brand.themeColor) : brand.color || '#153b29',
      title: brand.title || project.name, subtitle: brand.description || '', logo: brand.logoData || '', showLogo: Boolean(brand.logoData),
      fontFamily: brand.fontFamily || 'Arial, sans-serif', direction: brand.direction || 'ltr',
      showText: false, transparent: false, autoContrast: true, camera: true, notch: 'island', withMockup: true,
      template: 'gallery', arrangement: 'selected', selectedIds: project.snapshots.map(s => s.id), screenOptions: {}, rotation: 0, crop: 0, fit: 'cover', shadow: true };
  }
  function contrast(color) {
    const context = document.createElement('canvas').getContext('2d'); context.fillStyle = color;
    const value = context.fillStyle;
    const rgb = /^#([a-f\d]{6})$/i.exec(value);
    const channels = rgb ? [0, 2, 4].map(index => parseInt(rgb[1].slice(index, index + 2), 16)) : /rgb/.test(value) ? value.match(/[\d.]+/g).slice(0, 3).map(Number) : [230, 238, 227];
    const linear = channels.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4));
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722 > .35 ? '#132c20' : '#ffffff';
  }
  return { models, templates, selected, modelFor, defaultDevice, defaults, composition, contrast };
})();
atlasRender.composition = atlasComposition.composition;

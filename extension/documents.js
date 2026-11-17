const atlasDocuments = (() => {
  const limit = 20 * 1024 * 1024;
  const decoder = new TextDecoder();
  async function limited(stream, max = limit) {
    const reader = stream.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > max) throw new Error('Size exceeded');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const data = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    return data;
  }
  function archive(data) {
    const view = new DataView(data.buffer);
    const u16 = at => view.getUint16(at, true);
    const u32 = at => view.getUint32(at, true);
    let eocd = data.length - 22;
    while (eocd >= Math.max(0, data.length - 65557) && u32(eocd) !== 0x06054b50) eocd--;
    if (eocd < 0 || u32(eocd) !== 0x06054b50) throw new Error('ZIP directory unavailable');
    let offset = u32(eocd + 16);
    const entries = new Map();
    for (let index = 0; index < u16(eocd + 10); index++) {
      if (u32(offset) !== 0x02014b50) throw new Error('Invalid ZIP');
      const nameLength = u16(offset + 28);
      const name = decoder.decode(data.subarray(offset + 46, offset + 46 + nameLength));
      entries.set(name, [u32(offset + 42), u32(offset + 20), u16(offset + 10)]);
      offset += 46 + nameLength + u16(offset + 30) + u16(offset + 32);
    }
    let expandedSize = 0;
    async function bytesFor(name) {
      const entry = entries.get(name);
      if (!entry) return null;
      const [local, length, method] = entry;
      if (u32(local) !== 0x04034b50) throw new Error('Invalid ZIP entry');
      const begin = local + 30 + u16(local + 26) + u16(local + 28);
      const bytes = data.subarray(begin, begin + length);
      if (bytes.length !== length || ![0, 8].includes(method)) throw new Error('Unsupported ZIP entry');
      const raw = method === 0 ? bytes : await limited(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')), 8 * 1024 * 1024);
      expandedSize += raw.byteLength;
      if (expandedSize > 40 * 1024 * 1024) throw new Error('ZIP expansion limit exceeded');
      return raw;
    }
    return { names: [...entries.keys()], bytes: bytesFor, async xml(name) {
      const bytes = await bytesFor(name);
      if (!bytes) return null;
      const xml = new DOMParser().parseFromString(decoder.decode(bytes), 'application/xml');
      if (xml.querySelector('parsererror')) throw new Error('Invalid XML');
      return xml;
    } };
  }
  const tags = (xml, name) => Array.from(xml?.getElementsByTagNameNS('*', name) || []);
  const strings = (xml, name) => tags(xml, name).map(node => node.textContent).join('');
  const attr = (element, key) => Array.from(element?.attributes || []).find(a => a.localName === key)?.value || '';
  async function embeddedImage(zip, rels, base, id) {
    if (!id) return null;
    const rel = tags(rels, 'Relationship').find(node => node.getAttribute('Id') === id);
    const target = rel?.getAttribute('Target');
    if (!target || rel.getAttribute('TargetMode') === 'External' || /^[a-z]+:/i.test(target)) return null;
    const name = new URL(target, 'https://archive.invalid/' + base).pathname.slice(1);
    const ext = name.split('.').pop()?.toLowerCase();
    const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }[ext];
    if (!mime) return null;
    const bytes = await zip.bytes(name);
    return bytes?.length ? new Blob([bytes], { type: mime }) : null;
  }
  const ext = (label, url) => (label.match(/\.([a-z0-9]+)$/i) || url.match(/\.([a-z0-9]+)(?:[?#]|$)/i))?.[1].toLowerCase();
  function type(item) { return ext(item.label.trim(), item.url || ''); }
  async function preview(item, signal) {
    const kind = type(item);
    if (!['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'csv', 'md', 'json'].includes(kind)) return null;
    const response = await fetch(item.url, { signal, credentials: 'same-origin' });
    if (!response.ok || !response.body || Number(response.headers.get('content-length')) > limit) throw new Error('File unavailable');
    const data = await limited(response.body);
    if (kind === 'pdf') {
      if (!decoder.decode(data.subarray(0, 1024)).includes('%PDF-')) return null;
      return { pdf: new Blob([data], { type: 'application/pdf' }) };
    }
    if (!['docx', 'xlsx', 'pptx'].includes(kind)) return { text: decoder.decode(data.subarray(0, 120000)) };
    const zip = archive(data);
    if (kind === 'docx') {
      const xml = await zip.xml('word/document.xml');
      const rels = await zip.xml('word/_rels/document.xml.rels');
      const body = tags(xml, 'body')[0];
      const blocks = [];
      for (const child of Array.from(body?.children || []).slice(0, 500)) {
        if (child.localName === 'tbl') {
          blocks.push({ rows: tags(child, 'tr').map(row => tags(row, 'tc').map(cell => tags(cell, 'p').map(p => strings(p, 't')).join('\n'))) });
          continue;
        }
        if (child.localName !== 'p') continue;
        const style = attr(tags(child, 'pStyle')[0], 'val');
        const align = attr(tags(child, 'jc')[0], 'val');
        const runs = tags(child, 'r').map(run => ({ text: strings(run, 't') || (tags(run, 'br').length ? '\n' : ''),
          bold: tags(run, 'b').length > 0, italic: tags(run, 'i').length > 0 }));
        const images = [];
        for (const blip of tags(child, 'blip').slice(0, 5)) {
          const image = await embeddedImage(zip, rels, 'word/document.xml', attr(blip, 'embed'));
          if (image) images.push(image);
        }
        blocks.push({ style, align, runs, images });
      }
      return { blocks };
    }
    const sortNames = (pattern) => zip.names.filter(name => pattern.test(name)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    if (kind === 'pptx') {
      const size = tags(await zip.xml('ppt/presentation.xml'), 'sldSz')[0];
      const width = Number(size?.getAttribute('cx')) || 12192000;
      const height = Number(size?.getAttribute('cy')) || 6858000;
      return { slides: await Promise.all(sortNames(/^ppt\/slides\/slide\d+\.xml$/).slice(0, 24).map(async name => {
        const xml = await zip.xml(name);
        const rels = await zip.xml(name.replace(/([^/]+)$/, '_rels/$1.rels'));
        const shapes = [];
        for (const shape of Array.from(tags(xml, 'spTree')[0]?.children || []).slice(0, 150)) {
          const transform = tags(shape, 'xfrm')[0];
          const off = tags(transform, 'off')[0], extent = tags(transform, 'ext')[0];
          const lines = tags(shape, 'p').map(p => strings(p, 't')).filter(Boolean);
          const image = await embeddedImage(zip, rels, name, attr(tags(shape, 'blip')[0], 'embed'));
          if (!lines.length && !image) continue;
          shapes.push({ lines, image, box: off && extent ? [Number(off.getAttribute('x')) / width, Number(off.getAttribute('y')) / height,
            Number(extent.getAttribute('cx')) / width, Number(extent.getAttribute('cy')) / height] : null });
        }
        return { ratio: width / height, shapes };
      })) };
    }
    const shared = tags(await zip.xml('xl/sharedStrings.xml'), 'si').map(si => strings(si, 't'));
    const sheets = await Promise.all(sortNames(/^xl\/worksheets\/sheet\d+\.xml$/).slice(0, 12).map(async name =>
      tags(await zip.xml(name), 'row').slice(0, 100).map(row => {
        const cells = [];
        for (const cell of tags(row, 'c')) {
          const letters = cell.getAttribute('r')?.match(/^[A-Z]+/)?.[0];
          const column = letters ? [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1 : cells.length;
          if (column >= 20) continue;
          const value = strings(cell, 'v');
          cells[column] = cell.getAttribute('t') === 's' ? shared[Number(value)] : value || strings(cell, 't');
        }
        return Array.from(cells, value => value || '');
      })));
    return { sheets };
  }
  return { type, preview };
})();

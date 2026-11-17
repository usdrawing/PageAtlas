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
    return { names: [...entries.keys()], async xml(name) {
      const entry = entries.get(name);
      if (!entry) return null;
      const [local, length, method] = entry;
      if (u32(local) !== 0x04034b50) throw new Error('Invalid ZIP entry');
      const begin = local + 30 + u16(local + 26) + u16(local + 28);
      const bytes = data.subarray(begin, begin + length);
      if (bytes.length !== length || ![0, 8].includes(method)) throw new Error('Unsupported ZIP entry');
      const raw = method === 0 ? bytes : await limited(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')), 8 * 1024 * 1024);
      const xml = new DOMParser().parseFromString(decoder.decode(raw), 'application/xml');
      if (xml.querySelector('parsererror')) throw new Error('Invalid XML');
      return xml;
    } };
  }
  const tags = (xml, name) => Array.from(xml?.getElementsByTagNameNS('*', name) || []);
  const strings = (xml, name) => tags(xml, name).map(node => node.textContent).join('');
  const ext = (label, url) => (label.match(/\.([a-z0-9]+)$/i) || url.match(/\.([a-z0-9]+)(?:[?#]|$)/i))?.[1].toLowerCase();
  function type(item) { return ext(item.label.trim(), item.url || ''); }
  async function preview(item, signal) {
    const kind = type(item);
    if (!['docx', 'xlsx', 'pptx', 'txt', 'csv', 'md', 'json'].includes(kind)) return null;
    const response = await fetch(item.url, { signal, credentials: 'same-origin' });
    if (!response.ok || !response.body || Number(response.headers.get('content-length')) > limit) throw new Error('File unavailable');
    const data = await limited(response.body);
    if (!['docx', 'xlsx', 'pptx'].includes(kind)) return { text: decoder.decode(data.subarray(0, 120000)) };
    const zip = archive(data);
    if (kind === 'docx') {
      return { text: tags(await zip.xml('word/document.xml'), 'p').slice(0, 1200).map(p => strings(p, 't')).filter(Boolean).join('\n\n') };
    }
    const sortNames = (pattern) => zip.names.filter(name => pattern.test(name)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    if (kind === 'pptx') {
      return { sections: await Promise.all(sortNames(/^ppt\/slides\/slide\d+\.xml$/).slice(0, 24).map(async name =>
        tags(await zip.xml(name), 'p').map(p => strings(p, 't')).filter(Boolean).join('\n'))) };
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

figma.showUI(__html__, { width: 360, height: 320, themeColors: true });
figma.ui.onmessage = async message => {
  try {
    if (message.type === 'export') {
      const selected = figma.currentPage.selection;
      if (selected.length !== 1 || !('exportAsync' in selected[0])) throw new Error('Select one frame or component first.');
      const frame = selected[0];
      const bytes = await frame.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } });
      figma.ui.postMessage({ type: 'frame', name: frame.name, width: frame.width, height: frame.height, bytes: Array.from(bytes) });
    } else if (message.type === 'import') {
      if (typeof message.svg !== 'string' || message.svg.length > 30000000) throw new Error('Choose an SVG under 30 MB.');
      const node = figma.createNodeFromSvg(message.svg);
      node.name = 'PageAtlas import';
      figma.currentPage.appendChild(node);
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
      figma.ui.postMessage({ type: 'done' });
    }
  } catch (error) { figma.ui.postMessage({ type: 'error', text: error.message }); }
};

# PageAtlas Figma Companion

This optional local development plugin exports a selected frame to PageAtlas and imports SVG assets from Studio. It has no network access.

1. In Figma, use Plugins → Development → New plugin and create a plugin with a UI. Figma assigns a plugin ID.
2. Copy this directory's `code.js` and `ui.html` to that plugin folder.
3. Keep the generated `id`. Use the remaining fields from the included `manifest.json`, which is a template without a registered ID.
4. Run the plugin, select one frame and click Export selected frame.
5. With PageAtlas enabled on Figma in Chrome, click Send frame to PageAtlas. A `.pageatlas` file is also downloaded for import through Studio if Figma's plugin sandbox prevents the direct handoff.

For the reverse direction, export SVG from Studio and select it in the companion's SVG import control. SVG can also be imported directly into Figma or Adobe XD. Website captures provide editable shapes and text, with raster fallbacks for complex elements. They do not reconstruct native Auto Layout or component instances.

This workflow requires verification inside a live Figma session. PageAtlas's screenshot and mockup workflows work independently of the companion.

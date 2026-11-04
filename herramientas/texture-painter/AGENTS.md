# SpanStories Texture Painter

Scope: Blender add-on plus local Codex plugin. Both call the same Python API.
Mandatory self-improvement: follow AUTO_MEJORA.md for every resolved technical
error. A character-only workaround does not close a program defect. Update the
responsible add-on/plugin code, agent skill, regression coverage and authorized
installation; report unverified or blocked steps honestly.
Texture work MUST NOT change vertices, topology, UV coordinates, shape keys,
rigs, modifiers, animation or existing original images. Never unwrap.
Selection is stored in add-on state; overlays do not write texture pixels.
PNG and standard glTF Base Color are required deliverables for Three.js.
Flatten painting layers on export; never require Blender shader nodes at runtime.
Use the connected original Lamine.blend for the live test. Do not overwrite it
without explicit save authorization. Keep runtime test changes reversible.

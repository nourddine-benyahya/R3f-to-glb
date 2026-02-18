# R3f-to-glb

A drop-in GLB/GLTF export button and utility library for [React Three Fiber](https://github.com/pmndrs/react-three-fiber) scenes.

It clones your scene, cleans up internal R3F/Three.js objects (lights, cameras, CSG duplicates, wireframes, invisible meshes, helpers, empty groups), deduplicates materials, assigns readable names, and exports a clean `.glb` file ready for Blender, game engines, or any 3D tool.

## Installation

```bash
npm install r3f-glb-exporter
```

### Peer Dependencies

Your project must already have these installed:

```bash
npm install react react-dom three @react-three/fiber
```

> **Note:** `@react-three/drei` is **not** required. The export button works as a standard HTML element outside the Canvas.

## Quick Start

Wrap your app with `<SceneProvider>`, place `<SceneCapture />` inside the Canvas, and put `<ExportButton />` **anywhere** you want — sidebar, toolbar, header, etc.

```tsx
import React from 'react';
import { Canvas } from '@react-three/fiber';
import { SceneProvider, SceneCapture, ExportButton } from 'r3f-glb-exporter';

function App() {
  return (
    <SceneProvider>
      <div style={{ display: 'flex' }}>

        <aside style={{ padding: 20 }}>
          <h2>Controls</h2>
          <ExportButton filename="my-model" className="my-btn">
            Export GLB
          </ExportButton>
        </aside>

        <main style={{ flex: 1 }}>
          <Canvas>
            <SceneCapture />
            <ambientLight />
            <mesh>
              <boxGeometry />
              <meshStandardMaterial color="orange" />
            </mesh>
          </Canvas>
        </main>

      </div>
    </SceneProvider>
  );
}
```

## ExportButton

`<ExportButton>` is a **completely unstyled `<button>` element** — no default colors, padding, or shadows. You own the styling entirely. Every standard HTML button attribute is forwarded directly to the underlying `<button>` tag.

### Styling

Use whatever approach your project already uses:

```tsx
{/* Tailwind */}
<ExportButton filename="model" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
  Export GLB
</ExportButton>

{/* Inline style */}
<ExportButton filename="model" style={{ background: 'navy', color: '#fff', padding: '8px 16px' }}>
  Export GLB
</ExportButton>

{/* CSS module */}
<ExportButton filename="model" className={styles.exportBtn}>
  Export GLB
</ExportButton>
```

The button is automatically `disabled` while the export is running. Style the disabled state however you want (`disabled:opacity-50`, CSS `:disabled`, etc.).

### Native button attributes

Any valid `<button>` attribute passes through: `id`, `name`, `className`, `style`, `aria-label`, `data-*`, `onMouseEnter`, `onFocus`, `tabIndex`, `title`, `form`, and so on.

```tsx
<ExportButton
  filename="model"
  id="export-btn"
  name="export"
  aria-label="Download 3D model"
  title="Export to GLB"
  tabIndex={0}
  data-testid="export-button"
  className={styles.btn}
  onClick={(e) => console.log('clicked', e)}
>
  Download
</ExportButton>
```

### Export & cleanup props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `filename` | `string` | `"scene"` | Output filename without `.glb` extension |
| `showStats` | `boolean` | `true` | Log scene stats (vertices, triangles, meshes, textures) to the console |

### Scene cleanup props

All default to `true` for the cleanest possible output. Set any to `false` to keep those objects in the export.

| Prop | Type | Default | What it does |
|------|------|---------|--------------|
| `removeHelpers` | `boolean` | `true` | Removes GridHelper, AxesHelper, BoxHelper, and other helper objects |
| `removeCameras` | `boolean` | `true` | Removes camera objects |
| `removeLights` | `boolean` | `true` | Removes lights and their targets (fixes `sun` / `sun.001` nodes in Blender) |
| `removeCSGChildren` | `boolean` | `true` | Removes duplicate meshes from `@react-three/csg` (operands stored as mesh children) |
| `removeInvisibleMeshes` | `boolean` | `true` | Removes meshes with `visible={false}`, fully transparent materials, or hidden materials |
| `removeLineObjects` | `boolean` | `true` | Removes `LineSegments`, `Line2`, and `Line` objects (selection outlines, highlights) |
| `removeWireframeMeshes` | `boolean` | `true` | Removes meshes where all materials have `wireframe: true` (GLTF does not support wireframe) |
| `assignReadableNames` | `boolean` | `true` | Auto-names unnamed objects based on geometry type and material color (e.g. `Box_#ff6600`) |
| `mergeMeshesInGroups` | `boolean` | `true` | Merges all meshes inside each group into a single mesh (protects IP — clients can't inspect individual components) |
| `removeEmptyGroups` | `boolean` | `true` | Removes Group / Object3D nodes that contain no mesh descendants. Empty groups create useless nodes in Blender |
| `deduplicateMaterials` | `boolean` | `true` | When multiple meshes share a material with the same name, they are all reassigned to one shared material instance. Prevents `_2` / `_3` postfix duplicates in Blender |

### Example — opt out of specific cleanup

```tsx
<ExportButton
  filename="my-scene"
  removeLights={false}           // keep lights in the export
  removeCSGChildren={false}      // keep CSG child meshes
  assignReadableNames={false}    // keep original Three.js names
  mergeMeshesInGroups={false}    // export individual meshes (don't merge)
  removeEmptyGroups={false}      // keep empty group nodes
  deduplicateMaterials={false}   // allow duplicate material instances
/>
```

---

## Using the Hook Directly

Build your own UI with the `useGLBExport` hook — it works anywhere inside `<SceneProvider>`:

```tsx
import { useGLBExport } from 'r3f-glb-exporter';

function CustomDownloadButton() {
  const { exportScene, isExporting, error } = useGLBExport();

  return (
    <button
      onClick={() => exportScene({ filename: 'my-door' })}
      disabled={isExporting}
    >
      {isExporting ? 'Exporting...' : 'Download GLB'}
    </button>
  );
}
```

### Using an External Scene Ref

```tsx
import React, { useRef } from 'react';
import * as THREE from 'three';
import { SceneProvider, SceneCapture, ExportButton } from 'r3f-glb-exporter';

function App() {
  const sceneRef = useRef<THREE.Scene | null>(null);

  return (
    <SceneProvider sceneRef={sceneRef}>
      <ExportButton filename="dashboard-model" className={styles.btn}>
        Export
      </ExportButton>
      <Canvas>
        <SceneCapture />
        {/* your scene */}
      </Canvas>
    </SceneProvider>
  );
}
```

---

## Advanced: Utility Functions

### prepareSceneForExport

Clones and cleans the scene without exporting. Returns the cleaned clone.

```tsx
import { useThree } from '@react-three/fiber';
import { prepareSceneForExport } from 'r3f-glb-exporter';

function MyComponent() {
  const { scene } = useThree();

  const handleCleanup = () => {
    const cleanScene = prepareSceneForExport(scene, {
      removeLights: false,
      assignReadableNames: true,
      removeEmptyGroups: true,
      deduplicateMaterials: true,
    });
    console.log(cleanScene);
  };
}
```

### exportToGLB

Exports and triggers a browser file download.

```tsx
import { prepareSceneForExport, exportToGLB } from 'r3f-glb-exporter';

const cleanScene = prepareSceneForExport(scene);

await exportToGLB(cleanScene, {
  filename: 'my-model',
  binary: true,
  maxTextureSize: 4096,
  onStart: () => console.log('Export started...'),
  onComplete: (blob) => console.log(`Done! ${blob.size} bytes`),
  onError: (err) => console.error('Failed:', err),
});
```

### exportToGLBBlob

Returns the blob without triggering a download. Useful for server uploads.

```tsx
import { prepareSceneForExport, exportToGLBBlob } from 'r3f-glb-exporter';

const cleanScene = prepareSceneForExport(scene);
const blob = await exportToGLBBlob(cleanScene);

await fetch('/api/upload-model', {
  method: 'POST',
  body: blob,
});
```

### getSceneStats

Returns vertex, triangle, mesh, and texture counts.

```tsx
import { getSceneStats } from 'r3f-glb-exporter';

const stats = getSceneStats(scene);
// { vertices: 12450, triangles: 8300, meshes: 42, textures: 5 }
```

---

## GLBExportOptions

Advanced options for `exportToGLB` / `exportToGLBBlob`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `filename` | `string` | `"scene"` | Output filename (without extension) |
| `binary` | `boolean` | `true` | `true` → `.glb` binary, `false` → `.gltf` JSON |
| `maxTextureSize` | `number` | `4096` | Maximum texture dimension in pixels |
| `onlyVisible` | `boolean` | `false` | Only export visible objects |
| `animations` | `AnimationClip[]` | `[]` | Animation clips to include |
| `trs` | `boolean` | `false` | Export TRS instead of matrix |
| `includeCustomExtensions` | `boolean` | `false` | Include custom glTF extensions |
| `onStart` | `() => void` | — | Called when export begins |
| `onComplete` | `(blob: Blob) => void` | — | Called with result blob on success |
| `onError` | `(error: Error) => void` | — | Called if export fails |

---

## What Gets Cleaned Up

| Problem | Cleanup Option | Why it matters |
|---------|----------------|----------------|
| `sun` / `sun.001` nodes in Blender | `removeLights` | Three.js DirectionalLight creates a target Object3D that exports as a separate node |
| Duplicate meshes (mesh inside mesh) | `removeCSGChildren` | `@react-three/csg` stores operand meshes as children even though the parent already has the computed result |
| Solid boxes covering the model | `removeWireframeMeshes` | GLTF doesn't support wireframe rendering — wireframe boxes export as solid filled geometry |
| Invisible geometry in export | `removeInvisibleMeshes` | Click targets and interaction planes with `visible={false}` still get exported |
| GridHelper, AxesHelper in export | `removeHelpers` | Development helpers shouldn't appear in production exports |
| Selection outlines in export | `removeLineObjects` | Line-based highlights from the editor |
| Generic `Node_0`, `Obj_1` names | `assignReadableNames` | Three.js doesn't name objects by default |
| Clients can inspect mesh details | `mergeMeshesInGroups` | Merges all meshes per group so internal structure is hidden |
| Empty group nodes in Blender | `removeEmptyGroups` | Groups left empty after cleanup produce useless nodes |
| `Material_2`, `Material_3` duplicates | `deduplicateMaterials` | Identical materials get deduplicated to one shared instance, eliminating `_2` / `_3` postfixes |

## License

MIT

# R3f-to-glb

A drop-in GLB/GLTF export button and utility library for [React Three Fiber](https://github.com/pmndrs/react-three-fiber) scenes.

It clones your scene, cleans up internal R3F/Three.js objects (lights, cameras, CSG duplicates, wireframes, invisible meshes, helpers), assigns readable names, and exports a clean `.glb` file ready for Blender, game engines, or any 3D tool.

## Installation

```bash
npm install r3f-glb-exporter
```

### Peer Dependencies

Your project must already have these installed:

```bash
npm install react react-dom three @react-three/fiber @react-three/drei
```

## Quick Start

Add `<ExportButton />` inside your `<Canvas>` and a download button appears in the corner of your scene:

```tsx
import { Canvas } from '@react-three/fiber';
import { ExportButton } from 'r3f-glb-exporter';

function App() {
  return (
    <Canvas>
      <ambientLight />
      <mesh>
        <boxGeometry />
        <meshStandardMaterial color="orange" />
      </mesh>

      <ExportButton filename="my-model" />
    </Canvas>
  );
}
```

Click the download icon button and a `my-model.glb` file is saved to your downloads.

## ExportButton Props

### General Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `filename` | `string` | `"scene"` | Output filename (without `.glb` extension) |
| `position` | `"top-left"` \| `"top-right"` \| `"bottom-left"` \| `"bottom-right"` | `"top-right"` | Where the button appears on screen |
| `showStats` | `boolean` | `true` | Log scene stats (vertices, triangles, meshes, textures) to the console after export |
| `style` | `React.CSSProperties` | `undefined` | Custom CSS styles for the button |
| `className` | `string` | `undefined` | Custom CSS class name |
| `options` | `GLBExportOptions` | `{}` | Advanced export options (see below) |

### Scene Cleanup Props

These control what gets removed from the scene before export. **All default to `true`**, which gives you the cleanest possible output. Set any to `false` to keep those objects in the export:

| Prop | Type | Default | What it does |
|------|------|---------|--------------|
| `removeHelpers` | `boolean` | `true` | Removes GridHelper, AxesHelper, BoxHelper, and other helper objects |
| `removeCameras` | `boolean` | `true` | Removes camera objects from the export |
| `removeLights` | `boolean` | `true` | Removes lights and their targets (fixes `sun` / `sun.001` nodes that show up in Blender) |
| `removeCSGChildren` | `boolean` | `true` | Removes duplicate meshes created by `@react-three/csg`. CSG stores internal operands (Base, Subtraction) as children of the result mesh - this strips them out |
| `removeInvisibleMeshes` | `boolean` | `true` | Removes meshes with `visible={false}`, fully transparent materials (`opacity: 0`), or hidden materials. Catches click targets and interaction planes |
| `removeLineObjects` | `boolean` | `true` | Removes `LineSegments`, `Line2`, and `Line` objects (selection outlines, highlights) |
| `removeWireframeMeshes` | `boolean` | `true` | Removes meshes where all materials have `wireframe: true`. GLTF does not support wireframe rendering, so these would export as solid filled geometry |
| `assignReadableNames` | `boolean` | `true` | Auto-names unnamed objects based on their geometry type and material color (e.g. `Box_#ff6600`, `Sphere_#ffffff`). Objects that already have a name are left untouched |
| `mergeMeshesInGroups` | `boolean` | `true` | Merges all meshes inside each group into a single mesh. This **protects your geometry details** from being accessed by clients - they can't see or modify individual components. Set to `false` to export all individual meshes |

### Example with Custom Props

```tsx
<ExportButton
  filename="my-scene"
  position="bottom-left"
  removeLights={false}         // keep lights in the export
  removeCSGChildren={false}    // keep CSG child meshes
  assignReadableNames={false}  // keep original Three.js names
  mergeMeshesInGroups={false}  // keep individual meshes (don't merge)
/>
```

## Advanced: Using the Utility Functions Directly

If you need more control (e.g. uploading to a server instead of downloading, or integrating into your own UI), you can use the underlying functions:

### prepareSceneForExport

Clones the scene and applies all cleanup. Does not export anything - just returns the cleaned scene.

```tsx
import { useThree } from '@react-three/fiber';
import { prepareSceneForExport } from 'r3f-glb-exporter';

function MyComponent() {
  const { scene } = useThree();

  const handleCleanup = () => {
    const cleanScene = prepareSceneForExport(scene, {
      removeLights: false,        // keep lights
      assignReadableNames: true,  // auto-name objects
    });

    // cleanScene is a clone - your original scene is untouched
    console.log(cleanScene);
  };
}
```

### exportToGLB

Exports and triggers a file download.

```tsx
import { prepareSceneForExport, exportToGLB } from 'r3f-glb-exporter';

const cleanScene = prepareSceneForExport(scene);

await exportToGLB(cleanScene, {
  filename: 'my-model',      // saves as my-model.glb
  binary: true,               // .glb (binary) or .gltf (JSON)
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

// Upload to your server
await fetch('/api/upload-model', {
  method: 'POST',
  body: blob,
});
```

### getSceneStats

Returns vertex, triangle, mesh, and texture counts for a scene.

```tsx
import { getSceneStats } from 'r3f-glb-exporter';

const stats = getSceneStats(scene);
console.log(stats);
// { vertices: 12450, triangles: 8300, meshes: 42, textures: 5 }
```

## GLBExportOptions

These are the advanced options you can pass to `exportToGLB` or `exportToGLBBlob`, or via the `options` prop on `ExportButton`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `filename` | `string` | `"scene"` | Output filename (without extension) |
| `binary` | `boolean` | `true` | `true` for `.glb` (binary), `false` for `.gltf` (JSON) |
| `maxTextureSize` | `number` | `4096` | Maximum texture dimension in pixels |
| `onlyVisible` | `boolean` | `false` | Only export visible objects (Three.js built-in filter) |
| `animations` | `AnimationClip[]` | `[]` | Animation clips to include |
| `trs` | `boolean` | `false` | Export as TRS (translate/rotate/scale) instead of matrix |
| `includeCustomExtensions` | `boolean` | `false` | Include custom glTF extensions |
| `onStart` | `() => void` | - | Called when export begins |
| `onComplete` | `(blob: Blob) => void` | - | Called with the result blob on success |
| `onError` | `(error: Error) => void` | - | Called if export fails |

## What Gets Cleaned Up

Here's what each cleanup option removes and why:

| Problem | Cleanup Option | Why it matters |
|---------|----------------|----------------|
| `sun` / `sun.001` nodes in Blender | `removeLights` | Three.js DirectionalLight creates a target Object3D that exports as a separate node |
| Duplicate meshes (mesh inside mesh) | `removeCSGChildren` | `@react-three/csg` keeps operand meshes as children even though the parent already has the computed result |
| Solid boxes covering your model | `removeWireframeMeshes` | GLTF spec doesn't support wireframe rendering, so wireframe boxes export as solid filled geometry |
| Empty/invisible geometry in export | `removeInvisibleMeshes` | Click targets and interaction planes with `visible={false}` still get exported |
| GridHelper, AxesHelper in export | `removeHelpers` | Development helpers shouldn't appear in production exports |
| Selection outlines in export | `removeLineObjects` | Line-based highlights and outlines from the editor |
| Generic `Node_0`, `Obj_1` names | `assignReadableNames` | Three.js doesn't name objects by default, so GLTFExporter generates generic names |
| Clients can see/copy mesh details | `mergeMeshesInGroups` | Merges all meshes in each group into one, so the internal geometry structure is hidden and clients can't access or copy individual components |

## License

MIT

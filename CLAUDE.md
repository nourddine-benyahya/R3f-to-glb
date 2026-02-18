# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**r3f-glb-exporter** is an npm library for exporting React Three Fiber (R3F) 3D scenes to GLB/GLTF format. It provides:
- A drop-in `<ExportButton />` component for users to download GLB files
- A `useGLBExport()` hook for custom export UI
- Scene preparation utilities to automatically clean up internal Three.js/R3F objects
- Direct utility functions (`prepareSceneForExport`, `exportToGLB`, `exportToGLBBlob`, `getSceneStats`)

The library handles common export problems: duplicate meshes from CSG operations, leftover helpers/lights/cameras, wireframe objects that can't be represented in GLTF, invisible click targets, empty groups, duplicate materials/textures, and generic auto-generated names.

## Build & Development

```bash
npm run build              # Build with Rollup (outputs to dist/)
npm run prepublishOnly     # Runs build before publishing (npm automatically runs this)
```

**Key build configuration:**
- **Rollup** (`rollup.config.js`): Bundles TypeScript → CommonJS (`dist/index.js`) and ESM (`dist/index.esm.js`)
- **Babel** (`babel.config.js`): Transpiles JSX/modern syntax for compatibility
- **TypeScript** (`tsconfig.json`): Strict mode, generates type declarations in `dist/index.d.ts`
- **Plugins**: Resolves node modules, handles CommonJS, transpiles TypeScript

**Important:** The library is designed as an NPM package with external peer dependencies:
- React, React DOM, Three.js, and @react-three/fiber are **external** (not bundled)
- They must be installed by consumers of the library
- See `package.json` `peerDependencies` for required versions

## Architecture

### Core Layers

1. **Scene Context** (`src/SceneContext.tsx`)
   - Provides React Context (`SceneProvider`) to make the R3F scene accessible anywhere
   - `SceneCapture` component (placed in Canvas) bridges the R3F scene into context
   - `useScene()` hook retrieves the scene ref from any component
   - This enables export buttons to live outside the Canvas (sidebars, toolbars, etc.)

2. **Scene Preparation** (`src/prepareScene.ts`)
   - Main orchestrator: clones the scene and applies cleanup options
   - Calls helper functions based on `PrepareSceneOptions`
   - Sanitizes invalid transforms (NaN/Infinity) and material properties (IOR validation)
   - Returns a clean clone without modifying the original scene

3. **Cleanup Helpers** (`src/helpers/sceneCleanup.ts`)
   - `removeUnwantedObjects()`: Removes helpers, cameras, lights based on flags
   - `removeCSGChildren()`: Strips internal operand meshes from CSG operations
   - `removeEmptyGroups()`: Removes Group/Object3D nodes with no mesh descendants (multi-pass to catch nested empty groups)
   - `removeInvisibleMeshes()`, `removeLineObjects()`, `removeWireframeMeshes()`: Type-specific removal

4. **Scene Naming** (`src/helpers/namingUtils.ts`)
   - Auto-names unnamed objects based on geometry type and material color
   - Preserves existing names (only renames unnamed objects)
   - Critical for meaningful Blender/game engine imports
   - Color extraction from materials to create readable names like `Box_#ff6600`

5. **Material Deduplication** (`src/helpers/materialDedup.ts`)
   - After naming, identifies materials that share the same name (truly identical materials)
   - Replaces all duplicate material references with the first canonical instance
   - Eliminates `_2` / `_3` postfix duplicates that appear in Blender
   - Must run after `assignReadableNames` so names are available for matching

6. **Mesh Merging** (`src/helpers/meshMerger.ts`)
   - Merges all descendant meshes within named groups into single multi-material meshes
   - Protects IP: clients can't inspect or copy individual components
   - Only merges groups explicitly marked (or all groups if `mergeMeshesInGroups: true`)

7. **Export** (`src/export.ts`)
   - `exportToGLB()`: Exports scene and triggers browser download
   - `exportToGLBBlob()`: Returns blob without downloading (for server uploads)
   - Uses `GLTFExporter` from three-stdlib
   - Handles both `.glb` (binary) and `.gltf` (JSON) formats

8. **Public Components & Hooks**
   - `ExportButton` (`src/ExportButton.tsx`): **Completely unstyled** `<button>` — no built-in styles at all. Extends `React.ButtonHTMLAttributes<HTMLButtonElement>` so every native button attribute (id, name, className, style, aria-*, data-*, event handlers…) passes through directly to the DOM element. Consumers own all styling.
   - `useGLBExport()` (`src/useGLBExport.ts`): Hook wrapping the export flow (state, error handling, loading)

### Data Flow for Export

```
User clicks ExportButton or calls exportScene()
    ↓
useGLBExport hook calls prepareSceneForExport(scene, options)
    ↓
prepareScene.ts:
  1. Clone scene
  2. Sanitize transforms & materials (NaN/Infinity, IOR, textures)
  3. removeUnwantedObjects (helpers, cameras, lights, invisible, lines, wireframe)
  4. removeCSGChildren
  5. assignReadableNames
  6. deduplicateMaterials (must run after naming)
  7. mergeExportGroups
  8. removeEmptyGroups
    ↓
Return cleaned clone
    ↓
Call exportToGLB() or exportToGLBBlob()
    ↓
GLTFExporter.parse() → Blob
    ↓
saveAs() (if exportToGLB) OR return blob (if exportToGLBBlob)
```

## Key Files & Purposes

| File | Purpose |
|------|---------|
| `src/index.ts` | Public API exports |
| `src/types.ts` | `GLBExportOptions` and `PrepareSceneOptions` interfaces |
| `src/SceneContext.tsx` | React Context for scene access |
| `src/prepareScene.ts` | Main orchestrator: clones and cleans scene |
| `src/export.ts` | `exportToGLB` and `exportToGLBBlob` utilities |
| `src/ExportButton.tsx` | Unstyled `<button>` component — all HTML button attributes forwarded |
| `src/useGLBExport.ts` | Hook for custom export UI |
| `src/helpers/sceneCleanup.ts` | Object removal helpers (`removeUnwantedObjects`, `removeCSGChildren`, `removeEmptyGroups`) |
| `src/helpers/namingUtils.ts` | Auto-naming logic for unnamed objects |
| `src/helpers/materialDedup.ts` | Material/texture deduplication by name |
| `src/helpers/meshMerger.ts` | Mesh merging for groups |
| `src/helpers/sceneStats.ts` | Scene statistics (vertex/triangle counts) |
| `rollup.config.js` | Bundle configuration (CJS + ESM outputs) |
| `tsconfig.json` | TypeScript compiler options |
| `babel.config.js` | JSX/modern syntax transpilation |

## Public API & Usage Patterns

### Pattern 1: SceneProvider + SceneCapture + ExportButton (Recommended)

```tsx
<SceneProvider>
  <Canvas>
    <SceneCapture />  {/* inside Canvas */}
    <YourScene />
  </Canvas>
  {/* ExportButton is completely unstyled — style it yourself */}
  <ExportButton filename="my-model" className="your-class">
    Export GLB
  </ExportButton>
</SceneProvider>
```

Every native `<button>` attribute is accepted: `id`, `name`, `className`, `style`, `aria-label`, `data-*`, `onMouseEnter`, etc.

### Pattern 2: useGLBExport Hook (Custom UI)

```tsx
function CustomButton() {
  const { exportScene, isExporting } = useGLBExport();
  return <button onClick={() => exportScene({ filename: 'model' })}>Export</button>;
}
```

### Pattern 3: Direct Utilities (Full Control)

```tsx
const cleanScene = prepareSceneForExport(scene, { removeLights: false });
const blob = await exportToGLBBlob(cleanScene);
// send to server, etc.
```

## Common Development Tasks

### Adding a New Cleanup Option

1. Add the flag to `PrepareSceneOptions` in `src/types.ts`
2. Create a helper function in `src/helpers/sceneCleanup.ts`
3. Call it in `prepareScene.ts` based on the option
4. Update `ExportButton.tsx` props if user-facing
5. Document in README.md

### Testing the Export Locally

While no test suite is configured, you can validate exports by:
1. Building: `npm run build`
2. Using in a test React Three Fiber app
3. Checking the generated `.glb` in Blender or online GLTF viewers
4. Verifying console stats output: vertex/triangle counts, mesh names

### Updating Dependencies

Key dependencies to be aware of:
- **three-stdlib**: Provides `GLTFExporter`
- **file-saver**: Used to trigger browser downloads
- Peer dependencies: React, React DOM, Three.js, @react-three/fiber (pinned in package.json)

When updating, ensure:
- No breaking changes to exporter API
- Type definitions still match (especially Three.js types)
- Rollup output (CJS + ESM) builds without warnings

## Notes for Future Developers

- **No test suite**: This is a standalone library published to npm. Tests should be added if modifications are made to core cleanup/export logic.
- **Scene cloning is critical**: The original scene is never modified; a clone is always created to preserve user's runtime state.
- **Three.js object traversal**: Scene cleanup uses `traverse()` extensively. Understand this pattern for extending cleanup logic.
- **Material arrays**: Meshes can have single materials or arrays of materials; code handles both.
- **GLTF limitations**: The code accounts for GLTF/GLB format limitations (e.g., no wireframe support, IOR >= 1.0 requirement).
- **TypeScript strict mode**: All code is written with `strict: true`. Maintain this standard for type safety.

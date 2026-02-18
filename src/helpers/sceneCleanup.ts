import * as THREE from 'three';

interface CleanupOptions {
  removeHelpers: boolean;
  removeCameras: boolean;
  removeLights: boolean;
  removeInvisibleMeshes: boolean;
  removeLineObjects: boolean;
  removeWireframeMeshes: boolean;
}

/**
 * Traverses the scene clone and removes non-exportable objects:
 * helpers, cameras, lights, invisible meshes, line objects, wireframe meshes.
 */
export function removeUnwantedObjects(
  clone: THREE.Scene,
  options: CleanupOptions,
): void {
  const {
    removeHelpers,
    removeCameras,
    removeLights,
    removeInvisibleMeshes,
    removeLineObjects,
    removeWireframeMeshes,
  } = options;

  const toRemove: THREE.Object3D[] = [];

  // Diagnostic counters
  let helperCount = 0;
  let cameraCount = 0;
  let lightCount = 0;
  let invisibleMeshCount = 0;
  let transparentMatCount = 0;
  let hiddenMatCount = 0;
  let lineCount = 0;
  let wireframeCount = 0;

  clone.traverse((child) => {
    // Remove helpers (GridHelper, AxesHelper, BoxHelper, etc.)
    if (removeHelpers && child.type.includes('Helper')) {
      helperCount++;
      toRemove.push(child);
    }

    // Remove cameras
    if (removeCameras && child instanceof THREE.Camera) {
      cameraCount++;
      toRemove.push(child);
    }

    // Remove lights and their targets (prevents sun/sun.001 in export)
    if (removeLights && child instanceof THREE.Light) {
      lightCount++;
      toRemove.push(child);
      if (
        'target' in child &&
        (child as any).target instanceof THREE.Object3D
      ) {
        toRemove.push((child as any).target);
      }
    }

    // Remove invisible meshes (click targets, interaction planes)
    if (
      removeInvisibleMeshes &&
      child instanceof THREE.Mesh &&
      !child.visible
    ) {
      invisibleMeshCount++;
      toRemove.push(child);
    }

    // Remove invisible materials (meshes with opacity=0 transparent materials)
    if (
      removeInvisibleMeshes &&
      child instanceof THREE.Mesh &&
      child.visible
    ) {
      const mat = child.material;
      if (
        mat &&
        !Array.isArray(mat) &&
        'opacity' in mat &&
        'transparent' in mat
      ) {
        if (mat.transparent && mat.opacity === 0) {
          transparentMatCount++;
          toRemove.push(child);
        }
      }
      // Also check meshBasicMaterial with visible=false
      if (mat && !Array.isArray(mat) && 'visible' in mat && !mat.visible) {
        hiddenMatCount++;
        toRemove.push(child);
      }
    }

    // Remove Line2/LineSegments (selection highlights)
    if (
      removeLineObjects &&
      (child instanceof THREE.LineSegments ||
        child.type === 'Line2' ||
        child.type === 'Line')
    ) {
      lineCount++;
      toRemove.push(child);
    }

    // Remove wireframe meshes (zone boundary boxes).
    // GLTF does not support wireframe rendering, so these export as solid
    // boxes that cover the actual content.
    if (removeWireframeMeshes && child instanceof THREE.Mesh) {
      const mats = Array.isArray(child.material)
        ? child.material
        : [child.material];
      const allWireframe =
        mats.length > 0 &&
        mats.every(
          (m) => m && 'wireframe' in m && (m as any).wireframe === true,
        );
      if (allWireframe) {
        wireframeCount++;
        toRemove.push(child);
      }
    }
  });

  console.log(
    `[GLB Export] removeUnwantedObjects breakdown: ` +
      `helpers=${helperCount}, cameras=${cameraCount}, lights=${lightCount}, ` +
      `invisibleMeshes=${invisibleMeshCount}, transparentMat=${transparentMatCount}, ` +
      `hiddenMat=${hiddenMatCount}, lines=${lineCount}, wireframes=${wireframeCount}, ` +
      `total=${toRemove.length}`,
  );

  // Safely remove collected objects after traversal
  toRemove.forEach((obj) => obj.removeFromParent());
}

/**
 * Returns true when an Object3D has at least one Mesh descendant
 * (used to decide whether a group is "empty" for export purposes).
 */
function hasMeshDescendant(obj: THREE.Object3D): boolean {
  if (obj instanceof THREE.Mesh) return true;
  for (const child of obj.children) {
    if (hasMeshDescendant(child)) return true;
  }
  return false;
}

/**
 * Removes Group / Object3D nodes that contain no Mesh descendants after
 * all other cleanup steps.  Iterates until no more empty groups exist so
 * that newly-emptied parent groups are also removed.
 */
export function removeEmptyGroups(clone: THREE.Scene): void {
  let totalRemoved = 0;
  let pass = 0;

  // Repeat until a full pass finds nothing to remove (handles nested empty groups)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    pass++;
    const toRemove: THREE.Object3D[] = [];

    clone.traverse((child) => {
      // Only target non-Mesh containers (Groups and plain Object3Ds)
      if (child === clone) return;
      if (child instanceof THREE.Mesh) return;
      if (!hasMeshDescendant(child)) {
        toRemove.push(child);
      }
    });

    if (toRemove.length === 0) break;

    toRemove.forEach((obj) => obj.removeFromParent());
    totalRemoved += toRemove.length;

    if (pass > 20) {
      // Safety valve – should never be needed in practice
      console.warn('[GLB Export] removeEmptyGroups: exceeded 20 passes, stopping.');
      break;
    }
  }

  console.log(
    `[GLB Export] removeEmptyGroups: removed ${totalRemoved} empty group(s) in ${pass} pass(es)`,
  );
}

/**
 * Removes CSG internal children from meshes.
 *
 * @react-three/csg wraps operands (Base, Subtraction) inside a Group
 * under the parent Mesh.  The parent Mesh already has the computed CSG
 * geometry, so all its children are internal operands to strip.
 */
export function removeCSGChildren(clone: THREE.Scene): void {
  const meshesWithChildren: THREE.Mesh[] = [];
  clone.traverse((child) => {
    if (child instanceof THREE.Mesh && child.children.length > 0) {
      meshesWithChildren.push(child);
    }
  });

  console.log(
    `[GLB Export] Found ${meshesWithChildren.length} meshes with children to clean`,
  );

  meshesWithChildren.forEach((mesh) => {
    const childCount = mesh.children.length;
    const childTypes = mesh.children.map((c) => c.type).join(', ');
    console.log(
      `[GLB Export] Removing ${childCount} children from mesh "${mesh.name || mesh.uuid}": [${childTypes}]`,
    );
    mesh.clear();
  });
}

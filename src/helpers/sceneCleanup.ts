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

  clone.traverse((child) => {
    // Remove helpers (GridHelper, AxesHelper, BoxHelper, etc.)
    if (removeHelpers && child.type.includes('Helper')) {
      toRemove.push(child);
    }

    // Remove cameras
    if (removeCameras && child instanceof THREE.Camera) {
      toRemove.push(child);
    }

    // Remove lights and their targets (prevents sun/sun.001 in export)
    if (removeLights && child instanceof THREE.Light) {
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
          toRemove.push(child);
        }
      }
      // Also check meshBasicMaterial with visible=false
      if (mat && !Array.isArray(mat) && 'visible' in mat && !mat.visible) {
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
        toRemove.push(child);
      }
    }
  });

  // Safely remove collected objects after traversal
  toRemove.forEach((obj) => obj.removeFromParent());
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

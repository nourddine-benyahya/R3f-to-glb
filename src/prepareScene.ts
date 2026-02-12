import * as THREE from 'three';
import type { PrepareSceneOptions } from './types';
import { removeUnwantedObjects, removeCSGChildren } from './helpers/sceneCleanup';
import { assignReadableNames } from './helpers/namingUtils';
import { mergeExportGroups } from './helpers/meshMerger';
import { logSceneHierarchy } from './helpers/debug';

/** Count all meshes in a scene tree */
function countMeshes(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) count++;
  });
  return count;
}

/**
 * Clones and cleans a scene for export by removing non-exportable elements.
 */
export function prepareSceneForExport(
  scene: THREE.Scene,
  options: PrepareSceneOptions = {},
): THREE.Scene {
  const {
    removeHelpers = true,
    removeCameras = true,
    removeLights = true,
    removeCSGChildren: shouldRemoveCSG = true,
    removeInvisibleMeshes = true,
    removeLineObjects = true,
    removeWireframeMeshes = true,
    assignReadableNames: shouldAssignNames = true,
    mergeMeshesInGroups = true,
  } = options;

  // --- Diagnostic: count meshes in original scene ---
  const originalCount = countMeshes(scene);
  console.log(`[GLB Export] Original scene: ${originalCount} mesh(es)`);

  const clone = scene.clone(true);

  // --- Diagnostic: count meshes after clone ---
  const cloneCount = countMeshes(clone);
  console.log(`[GLB Export] After clone: ${cloneCount} mesh(es)`);
  if (cloneCount < originalCount) {
    console.warn(
      `[GLB Export] WARNING: scene.clone(true) lost ${originalCount - cloneCount} mesh(es)!`,
    );
  }

  console.log('[GLB Export] Scene structure BEFORE cleanup:');
  logSceneHierarchy(clone, 0, 3);

  // 1. Remove non-exportable objects (helpers, cameras, lights, etc.)
  removeUnwantedObjects(clone, {
    removeHelpers,
    removeCameras,
    removeLights,
    removeInvisibleMeshes,
    removeLineObjects,
    removeWireframeMeshes,
  });
  const afterCleanup = countMeshes(clone);
  console.log(`[GLB Export] After removeUnwantedObjects: ${afterCleanup} mesh(es)`);

  // 2. Strip CSG internal children
  if (shouldRemoveCSG) {
    removeCSGChildren(clone);
  }
  const afterCSG = countMeshes(clone);
  console.log(`[GLB Export] After removeCSGChildren: ${afterCSG} mesh(es)`);

  // 3. Auto-name unnamed objects
  if (shouldAssignNames) {
    assignReadableNames(clone);
  }

  // 4. Merge meshes inside "exportGroup" groups
  if (mergeMeshesInGroups) {
    mergeExportGroups(clone);
  }
  const afterMerge = countMeshes(clone);
  console.log(`[GLB Export] After merge: ${afterMerge} mesh(es)`);

  console.log('[GLB Export] Scene structure AFTER cleanup:');
  logSceneHierarchy(clone, 0, 3);

  return clone;
}

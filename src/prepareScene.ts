import * as THREE from 'three';
import type { PrepareSceneOptions } from './types';
import { removeUnwantedObjects, removeCSGChildren } from './helpers/sceneCleanup';
import { assignReadableNames } from './helpers/namingUtils';
import { mergeExportGroups } from './helpers/meshMerger';
import { logSceneHierarchy } from './helpers/debug';

/**
 * Clones and cleans a scene for export by removing non-exportable elements.
 *
 * @example
 * const cleanScene = prepareSceneForExport(scene);
 * await exportToGLB(cleanScene);
 *
 * @example
 * const cleanScene = prepareSceneForExport(scene, {
 *   removeLights: false,        // keep lights in export
 *   assignReadableNames: false,  // keep original names
 * });
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

  const clone = scene.clone(true);

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

  // 2. Strip CSG internal children
  if (shouldRemoveCSG) {
    removeCSGChildren(clone);
  }

  // 3. Auto-name unnamed objects
  if (shouldAssignNames) {
    assignReadableNames(clone);
  }

  // 4. Merge meshes inside "exportGroup" groups
  if (mergeMeshesInGroups) {
    mergeExportGroups(clone);
  }

  console.log('[GLB Export] Scene structure AFTER cleanup:');
  logSceneHierarchy(clone, 0, 3);

  return clone;
}

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

const isInvalid = (v: number) => isNaN(v) || !isFinite(v);

/**
 * Sanitize values that would break the GLTFExporter:
 *  1. NaN / Infinity in position, rotation, scale
 *  2. MeshPhysicalMaterial.ior < 1.0 (glTF requires >= 1.0)
 *  3. Custom attributes (prefixed with _) whose count doesn't match position
 *  4. Invalid texture sources (null, undefined, or not yet loaded)
 */
function sanitizeForExport(root: THREE.Object3D): void {
  root.traverse((object) => {
    // 1. Fix NaN / Infinity transforms
    if (isInvalid(object.position.x)) object.position.x = 0;
    if (isInvalid(object.position.y)) object.position.y = 0;
    if (isInvalid(object.position.z)) object.position.z = 0;

    if (isInvalid(object.rotation.x)) object.rotation.x = 0;
    if (isInvalid(object.rotation.y)) object.rotation.y = 0;
    if (isInvalid(object.rotation.z)) object.rotation.z = 0;

    if (isInvalid(object.scale.x)) object.scale.x = 1;
    if (isInvalid(object.scale.y)) object.scale.y = 1;
    if (isInvalid(object.scale.z)) object.scale.z = 1;

    object.updateMatrix();

    if (object instanceof THREE.Mesh) {
      // 2. Fix IOR < 1.0 on MeshPhysicalMaterial
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const mat of materials) {
        if (
          mat &&
          'ior' in mat &&
          typeof (mat as any).ior === 'number' &&
          (mat as any).ior < 1.0
        ) {
          (mat as any).ior = 1.0;
        }
      }

      // 3. Remove custom attributes with mismatched vertex counts
      const geo = object.geometry;
      if (geo && geo.attributes && geo.attributes.position) {
        const expectedCount = geo.attributes.position.count;
        for (const key of Object.keys(geo.attributes)) {
          if (key.startsWith('_') && geo.attributes[key].count !== expectedCount) {
            console.warn(
              `[GLB Export] Removing attribute "${key}" from mesh "${object.name || object.uuid}" ` +
                `(count ${geo.attributes[key].count} vs position ${expectedCount})`,
            );
            geo.deleteAttribute(key);
          }
        }
      }

      // 4. Remove invalid texture sources (prevents drawImage errors)
      for (const mat of materials) {
        if (!mat) continue;

        // Common texture properties to check
        const textureProps = [
          'map', 'normalMap', 'roughnessMap', 'metalnessMap',
          'emissiveMap', 'aoMap', 'bumpMap', 'displacementMap',
          'specularMap', 'envMap', 'lightMap', 'alphaMap',
        ];

        for (const prop of textureProps) {
          if (prop in mat) {
            const texture = (mat as any)[prop];
            if (texture && texture.image) {
              // Check if image is valid
              const img = texture.image;
              const isValid =
                img instanceof HTMLImageElement ||
                img instanceof HTMLCanvasElement ||
                img instanceof ImageBitmap ||
                img instanceof OffscreenCanvas ||
                (typeof HTMLVideoElement !== 'undefined' && img instanceof HTMLVideoElement);

              if (!isValid) {
                console.warn(
                  `[GLB Export] Removing invalid texture "${prop}" from material on mesh "${object.name || object.uuid}"`,
                );
                (mat as any)[prop] = null;
              } else if (img instanceof HTMLImageElement && !img.complete) {
                console.warn(
                  `[GLB Export] Removing not-yet-loaded texture "${prop}" from material on mesh "${object.name || object.uuid}"`,
                );
                (mat as any)[prop] = null;
              }
            } else if (texture && !texture.image) {
              // Texture exists but has no image
              console.warn(
                `[GLB Export] Removing texture "${prop}" with no image source from material on mesh "${object.name || object.uuid}"`,
              );
              (mat as any)[prop] = null;
            }
          }
        }
      }
    }
  });
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

  // 0. Sanitize values that would break the GLTFExporter
  sanitizeForExport(clone);

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

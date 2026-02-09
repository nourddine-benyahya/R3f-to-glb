/**
 * GLB Exporter Utility
 *
 * Provides utilities for exporting Three.js scenes to GLB/GLTF format.
 * Includes cleanup for lights, CSG internals, invisible click targets,
 * wireframe meshes, selection highlights, and auto-naming.
 *
 * @example
 * import { exportToGLB } from 'r3f-glb-exporter';
 * await exportToGLB(scene, { filename: 'my-model' });
 *
 * @example
 * import { exportToGLBBlob } from 'r3f-glb-exporter';
 * const blob = await exportToGLBBlob(scene);
 * await fetch('/api/upload', { method: 'POST', body: blob });
 */

import * as THREE from 'three';
import { GLTFExporter } from 'three-stdlib';
import { saveAs } from 'file-saver';

/**
 * Export options for GLB export
 */
export interface GLBExportOptions {
  /** Filename without extension (default: 'scene') */
  filename?: string;
  /** Export as binary .glb (true) or JSON .gltf (false). Default: true */
  binary?: boolean;
  /** Max texture dimension. Default: 4096 */
  maxTextureSize?: number;
  /** Export only visible objects. Default: false (export everything) */
  onlyVisible?: boolean;
  /** Include animations. Default: [] */
  animations?: THREE.AnimationClip[];
  /** Export TRS instead of matrix. Default: false */
  trs?: boolean;
  /** Include custom glTF extensions. Default: false */
  includeCustomExtensions?: boolean;
  /** Callback when export starts */
  onStart?: () => void;
  /** Callback when export completes successfully */
  onComplete?: (blob: Blob) => void;
  /** Callback when export fails */
  onError?: (error: Error) => void;
}

const DEFAULT_OPTIONS: Required<Omit<GLBExportOptions, 'onStart' | 'onComplete' | 'onError'>> = {
  filename: 'scene',
  binary: true,
  maxTextureSize: 4096,
  onlyVisible: false,
  animations: [],
  trs: false,
  includeCustomExtensions: false,
};

/**
 * Exports a Three.js scene or object to GLB/GLTF format and triggers download
 */
export async function exportToGLB(
  input: THREE.Object3D | THREE.Object3D[],
  options: GLBExportOptions = {}
): Promise<Blob> {
  const config = { ...DEFAULT_OPTIONS, ...options };

  config.onStart?.();

  const exporter = new GLTFExporter();

  const exporterOptions = {
    binary: config.binary,
    maxTextureSize: config.maxTextureSize,
    onlyVisible: config.onlyVisible,
    animations: config.animations,
    trs: config.trs,
    includeCustomExtensions: config.includeCustomExtensions,
  };

  return new Promise((resolve, reject) => {
    exporter.parse(
      input,
      (result) => {
        try {
          let blob: Blob;

          if (result instanceof ArrayBuffer) {
            blob = new Blob([result], { type: 'application/octet-stream' });
          } else {
            const jsonString = JSON.stringify(result, null, 2);
            blob = new Blob([jsonString], { type: 'application/json' });
          }

          const extension = config.binary ? 'glb' : 'gltf';
          const fullFilename = `${config.filename}.${extension}`;

          saveAs(blob, fullFilename);

          config.onComplete?.(blob);
          resolve(blob);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          config.onError?.(error);
          reject(error);
        }
      },
      (err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        config.onError?.(error);
        reject(error);
      },
      exporterOptions
    );
  });
}

/**
 * Exports a Three.js scene and returns the blob without downloading.
 * Useful for server uploads or custom handling.
 */
export async function exportToGLBBlob(
  input: THREE.Object3D | THREE.Object3D[],
  options: Omit<GLBExportOptions, 'filename'> = {}
): Promise<Blob> {
  const config = { ...DEFAULT_OPTIONS, ...options };

  const exporter = new GLTFExporter();

  const exporterOptions = {
    binary: config.binary,
    maxTextureSize: config.maxTextureSize,
    onlyVisible: config.onlyVisible,
    animations: config.animations,
    trs: config.trs,
    includeCustomExtensions: config.includeCustomExtensions,
  };

  return new Promise((resolve, reject) => {
    exporter.parse(
      input,
      (result) => {
        try {
          let blob: Blob;

          if (result instanceof ArrayBuffer) {
            blob = new Blob([result], { type: 'application/octet-stream' });
          } else {
            const jsonString = JSON.stringify(result, null, 2);
            blob = new Blob([jsonString], { type: 'application/json' });
          }

          resolve(blob);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      },
      (err) => {
        reject(err instanceof Error ? err : new Error(String(err)));
      },
      exporterOptions
    );
  });
}

/**
 * Debug helper: logs scene hierarchy to console
 */
function logSceneHierarchy(obj: THREE.Object3D, depth: number, maxDepth: number): void {
  if (depth > maxDepth) return;
  const indent = '  '.repeat(depth);
  const name = obj.name || obj.uuid.slice(0, 8);
  const childInfo = obj.children.length > 0 ? ` [${obj.children.length} children]` : '';
  console.log(`${indent}${obj.type}: "${name}"${childInfo}`);
  for (const child of obj.children) {
    logSceneHierarchy(child, depth + 1, maxDepth);
  }
}

/**
 * Options for scene preparation/cleanup before export
 */
export interface PrepareSceneOptions {
  /** Remove helper objects (GridHelper, AxesHelper, etc.). Default: true */
  removeHelpers?: boolean;
  /** Remove camera objects from export. Default: true */
  removeCameras?: boolean;
  /** Remove light objects from export (prevents sun/sun.001 nodes). Default: true */
  removeLights?: boolean;
  /** Remove CSG internal child meshes (prevents duplicate geometry). Default: true */
  removeCSGChildren?: boolean;
  /** Remove meshes with visible=false (click targets, interaction planes). Default: true */
  removeInvisibleMeshes?: boolean;
  /** Remove Line2/LineSegments objects (selection highlights). Default: true */
  removeLineObjects?: boolean;
  /** Remove meshes with wireframe materials (zone boundaries). Default: true */
  removeWireframeMeshes?: boolean;
  /** Assign readable names to unnamed objects. Default: true */
  assignReadableNames?: boolean;
}

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
  options: PrepareSceneOptions = {}
): THREE.Scene {
  const {
    removeHelpers = true,
    removeCameras = true,
    removeLights = true,
    removeCSGChildren = true,
    removeInvisibleMeshes = true,
    removeLineObjects = true,
    removeWireframeMeshes = true,
    assignReadableNames = true,
  } = options;

  const clone = scene.clone(true);

  console.log('[GLB Export] Scene structure BEFORE cleanup:');
  logSceneHierarchy(clone, 0, 3);

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
      if ('target' in child && (child as any).target instanceof THREE.Object3D) {
        toRemove.push((child as any).target);
      }
    }

    // Remove invisible meshes (click targets, interaction planes)
    if (removeInvisibleMeshes && child instanceof THREE.Mesh && !child.visible) {
      toRemove.push(child);
    }

    // Remove invisible materials (meshes with opacity=0 transparent materials)
    if (removeInvisibleMeshes && child instanceof THREE.Mesh && child.visible) {
      const mat = child.material;
      if (mat && !Array.isArray(mat) && 'opacity' in mat && 'transparent' in mat) {
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
    if (removeLineObjects && (child instanceof THREE.LineSegments || child.type === 'Line2' || child.type === 'Line')) {
      toRemove.push(child);
    }

    // Remove wireframe meshes (zone boundary boxes).
    // GLTF does not support wireframe rendering, so these export as solid
    // boxes that cover the actual content.
    if (removeWireframeMeshes && child instanceof THREE.Mesh) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      const allWireframe = mats.length > 0 && mats.every(
        (m) => m && 'wireframe' in m && (m as any).wireframe === true
      );
      if (allWireframe) {
        toRemove.push(child);
      }
    }
  });

  // Remove CSG internal children: @react-three/csg wraps operands
  // (Base, Subtraction) inside a Group under the parent Mesh.
  // The parent Mesh already has the computed CSG geometry, so all its
  // children (groups and nested meshes) are internal operands to strip.
  if (removeCSGChildren) {
    const meshesWithChildren: THREE.Mesh[] = [];
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh && child.children.length > 0) {
        meshesWithChildren.push(child);
      }
    });

    console.log(`[GLB Export] Found ${meshesWithChildren.length} meshes with children to clean`);

    meshesWithChildren.forEach((mesh) => {
      const childCount = mesh.children.length;
      const childTypes = mesh.children.map(c => c.type).join(', ');
      console.log(`[GLB Export] Removing ${childCount} children from mesh "${mesh.name || mesh.uuid}": [${childTypes}]`);
      mesh.clear();
    });
  }

  // Safely remove collected objects after traversal
  toRemove.forEach((obj) => obj.removeFromParent());

  // Assign readable names to unnamed objects
  if (assignReadableNames) {
    const nameCounts: Record<string, number> = {};

    const getUniqueName = (base: string): string => {
      nameCounts[base] = (nameCounts[base] || 0) + 1;
      return nameCounts[base] === 1 ? base : `${base}_${nameCounts[base]}`;
    };

    const getMaterialColor = (mesh: THREE.Mesh): string | null => {
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (mat && 'color' in mat && (mat as any).color instanceof THREE.Color) {
        return '#' + (mat as any).color.getHexString();
      }
      return null;
    };

    const getGeometryLabel = (mesh: THREE.Mesh): string => {
      const geoType = mesh.geometry?.type || 'Geometry';
      return geoType.replace('Buffer', '').replace('Geometry', '') || 'Mesh';
    };

    clone.traverse((child) => {
      if (child.name && child.name.length > 0) return;
      if (child === clone) return;

      if (child instanceof THREE.Mesh) {
        const geoLabel = getGeometryLabel(child);
        const color = getMaterialColor(child);
        const base = color ? `${geoLabel}_${color}` : geoLabel;
        child.name = getUniqueName(base);
      } else if (child instanceof THREE.Group || child.type === 'Object3D') {
        child.name = getUniqueName('Group');
      }
    });
  }

  console.log('[GLB Export] Scene structure AFTER cleanup:');
  logSceneHierarchy(clone, 0, 3);

  return clone;
}

/**
 * Gets statistics about a scene (vertex count, triangle count, etc.).
 * Useful for warning users about large exports.
 */
export function getSceneStats(scene: THREE.Object3D): {
  vertices: number;
  triangles: number;
  textures: number;
  meshes: number;
} {
  let vertices = 0;
  let triangles = 0;
  let meshes = 0;
  const textures = new Set<THREE.Texture>();

  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshes++;
      const geometry = child.geometry;

      if (geometry.index) {
        triangles += geometry.index.count / 3;
      } else if (geometry.attributes.position) {
        triangles += geometry.attributes.position.count / 3;
      }

      if (geometry.attributes.position) {
        vertices += geometry.attributes.position.count;
      }

      const material = child.material;
      const materials = Array.isArray(material) ? material : [material];

      for (const mat of materials) {
        if (mat instanceof THREE.MeshStandardMaterial ||
            mat instanceof THREE.MeshPhysicalMaterial) {
          if (mat.map) textures.add(mat.map);
          if (mat.normalMap) textures.add(mat.normalMap);
          if (mat.roughnessMap) textures.add(mat.roughnessMap);
          if (mat.metalnessMap) textures.add(mat.metalnessMap);
          if (mat.aoMap) textures.add(mat.aoMap);
          if (mat.emissiveMap) textures.add(mat.emissiveMap);
        }
      }
    }
  });

  return {
    vertices,
    triangles: Math.floor(triangles),
    textures: textures.size,
    meshes,
  };
}

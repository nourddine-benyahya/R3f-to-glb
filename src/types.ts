import * as THREE from 'three';

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

export const DEFAULT_OPTIONS: Required<Omit<GLBExportOptions, 'onStart' | 'onComplete' | 'onError'>> = {
  filename: 'scene',
  binary: true,
  maxTextureSize: 4096,
  onlyVisible: false,
  animations: [],
  trs: false,
  includeCustomExtensions: false,
};

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
  /**
   * Merge all descendant meshes inside groups named "exportGroup" into
   * a single multi-material mesh.  When true, finds every group with
   * name="exportGroup" and merges all its descendant meshes.
   * When false, exports the scene as-is without any merging. Default: true
   */
  mergeMeshesInGroups?: boolean;
  /**
   * Remove groups (and Object3D nodes) that have no visible mesh descendants
   * after all other cleanup steps. Empty groups produce useless nodes in
   * Blender / game engines. Default: true
   */
  removeEmptyGroups?: boolean;
  /**
   * Deduplicate materials, textures and colors by name: when two materials
   * share the same resolved name the second mesh is reassigned to reuse the
   * first material instead of keeping a separate copy.  Prevents _1 / _2
   * postfix duplicates in Blender. Default: true
   */
  deduplicateMaterials?: boolean;
}

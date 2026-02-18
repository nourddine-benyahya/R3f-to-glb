import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────
//  Comprehensive naming for ALL Three.js objects that GLTFExporter
//  outputs as named entities: Textures, Materials, Geometries, and
//  every Object3D subclass (Mesh, SkinnedMesh, InstancedMesh, Bone,
//  Line, Points, Sprite, LOD, Camera, Light, Group, etc.).
// ─────────────────────────────────────────────────────────────────────

// ── shared helpers ─────────────────────────────────────────────────

/** Sanitize a string for glTF-safe naming and deduplicate. */
function getUniqueName(
  counts: Record<string, number>,
  base: string,
): string {
  // Strip file extension if present, sanitize special chars
  const clean =
    (base.includes('.') ? base.split('.').slice(0, -1).join('.') : base)
      .replace(/[^a-zA-Z0-9_#]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'Unnamed';

  counts[clean] = (counts[clean] || 0) + 1;
  return counts[clean] === 1 ? clean : `${clean}_${counts[clean]}`;
}

/** Extract hex color string from a material's `.color` property. */
function getMaterialColorHex(mat: THREE.Material): string | null {
  if (mat && 'color' in mat && (mat as any).color instanceof THREE.Color) {
    return '#' + (mat as any).color.getHexString();
  }
  return null;
}

/**
 * All material properties that can hold a THREE.Texture.
 * Ordered roughly by how descriptive they are for naming.
 */
const TEXTURE_MAP_PROPS = [
  'map',              // diffuse / albedo
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'aoMap',            // ambient occlusion
  'bumpMap',
  'displacementMap',
  'specularMap',
  'envMap',
  'lightMap',
  'alphaMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'transmissionMap',
  'thicknessMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'anisotropyMap',
  'specularIntensityMap',
  'specularColorMap',
  'gradientMap',       // MeshToonMaterial
] as const;

/**
 * Try to extract a human-readable name from a texture.
 * Priority: `.name` → filename from `.image.src` → null.
 */
function getTextureLabelFromTexture(tex: THREE.Texture): string | null {
  if (tex.name && tex.name.trim().length > 0) return tex.name.trim();

  if (tex.image) {
    const src: string | undefined = tex.image.src || tex.image.currentSrc;
    if (typeof src === 'string' && src.length > 0) {
      const filename = src.split('/').pop()?.split('?')[0];
      if (filename) return filename;
    }
  }
  return null;
}

/**
 * Try to get the best texture name from a material's first non-null map.
 * Returns the label from the first texture that has a recognisable name.
 */
function getPrimaryTextureName(mat: THREE.Material): string | null {
  for (const prop of TEXTURE_MAP_PROPS) {
    if (!(prop in mat)) continue;
    const tex = (mat as any)[prop] as THREE.Texture | null;
    if (!tex) continue;
    const label = getTextureLabelFromTexture(tex);
    if (label) return label;
  }
  return null;
}

/**
 * Extract a short, clean geometry-type label.
 * `"BoxBufferGeometry"` → `"Box"`, `"BufferGeometry"` → `"Geometry"`.
 */
function getGeometryLabel(geo: THREE.BufferGeometry | undefined): string {
  if (!geo) return 'Mesh';
  const raw = geo.type || 'BufferGeometry';
  return raw.replace('Buffer', '').replace('Geometry', '') || 'Geometry';
}

// ── main function ──────────────────────────────────────────────────

/**
 * Assigns unique, readable names to **every** nameable Three.js object
 * in a cloned scene. Runs 4 passes in order:
 *
 *   1. **Textures**    – by image filename or map-role fallback
 *   2. **Materials**   – by texture name → hex color → material type
 *   3. **Geometries**  – by geometry type (Box, Sphere, etc.)
 *   4. **Object3D nodes** – every subclass (Mesh, SkinnedMesh, InstancedMesh,
 *      Group, Bone, Line, Points, Sprite, LOD, Camera, Light, …)
 *
 * Objects that already have a non-empty `.name` are never renamed.
 */
export function assignReadableNames(clone: THREE.Scene): void {
  const textureCounts: Record<string, number> = {};
  const geometryCounts: Record<string, number> = {};
  const objectCounts: Record<string, number> = {};

  const visitedTextures = new Set<string>();
  const visitedMaterials = new Set<string>();
  const visitedGeometries = new Set<string>();

  // ── Pass 1: Name Textures ──────────────────────────────────────

  const nameTexture = (tex: THREE.Texture, mapRole: string): void => {
    if (!tex || visitedTextures.has(tex.uuid)) return;
    visitedTextures.add(tex.uuid);

    // Already named → keep
    if (tex.name && tex.name.trim().length > 0) return;

    // Try image filename, fall back to the map role (e.g. "normalMap")
    const label = getTextureLabelFromTexture(tex) || mapRole;
    tex.name = getUniqueName(textureCounts, label);
  };

  const nameTexturesOnMaterial = (mat: THREE.Material): void => {
    for (const prop of TEXTURE_MAP_PROPS) {
      if (!(prop in mat)) continue;
      const tex = (mat as any)[prop] as THREE.Texture | null;
      if (tex) nameTexture(tex, prop);
    }
  };

  // ── Pass 2: Name Materials ─────────────────────────────────────

  const nameMaterial = (mat: THREE.Material): void => {
    if (!mat || visitedMaterials.has(mat.uuid)) return;
    visitedMaterials.add(mat.uuid);

    // Also name its textures (pass 1)
    nameTexturesOnMaterial(mat);

    // Already named → keep
    if (mat.name && mat.name.trim().length > 0) return;

    // Short type prefix: "MeshStandardMaterial" → "Standard"
    let baseName =
      mat.type
        .replace('Mesh', '')
        .replace('Material', '')
        .replace('Shader', 'Shader') || 'Mat';

    const textureName = getPrimaryTextureName(mat);
    const colorHex = getMaterialColorHex(mat);

    if (textureName) {
      baseName = textureName;           // e.g. "wood_diffuse"
    } else if (colorHex) {
      baseName += `_${colorHex}`;       // e.g. "Standard_#ff0000"
    }

    mat.name = baseName;
  };

  // ── Pass 3: Name Geometries ────────────────────────────────────

  const nameGeometry = (geo: THREE.BufferGeometry): void => {
    if (!geo || visitedGeometries.has(geo.uuid)) return;
    visitedGeometries.add(geo.uuid);

    if (geo.name && geo.name.trim().length > 0) return;

    const label = getGeometryLabel(geo);
    geo.name = getUniqueName(geometryCounts, label);
  };

  // ── Pass 4: Name Object3D Nodes ────────────────────────────────

  /**
   * Derive a descriptive base name for any Object3D based on its concrete
   * subclass. Handles every Three.js type that GLTFExporter can output.
   */
  const getObjectBaseName = (child: THREE.Object3D): string => {
    // ── Mesh variants ──
    if ((child as any).isInstancedMesh) {
      const im = child as THREE.InstancedMesh;
      const geo = getGeometryLabel(im.geometry);
      return `Instanced_${geo}_x${im.count}`;
    }
    if ((child as any).isSkinnedMesh) {
      const sm = child as THREE.SkinnedMesh;
      const geo = getGeometryLabel(sm.geometry);
      const mat = Array.isArray(sm.material) ? sm.material[0] : sm.material;
      let suffix = '';
      if (mat) {
        const tex = getPrimaryTextureName(mat);
        const col = getMaterialColorHex(mat);
        if (tex) suffix = `_${tex}`;
        else if (col) suffix = `_${col}`;
      }
      return `SkinnedMesh_${geo}${suffix}`;
    }
    if (child instanceof THREE.Mesh) {
      const geo = getGeometryLabel(child.geometry);
      const mat = Array.isArray(child.material) ? child.material[0] : child.material;
      let suffix = '';
      if (mat) {
        const tex = getPrimaryTextureName(mat);
        const col = getMaterialColorHex(mat);
        if (tex) suffix = `_${tex}`;
        else if (col) suffix = `_${col}`;
      }
      return `${geo}${suffix}`;
    }

    // ── Line variants ──
    if (child instanceof THREE.LineLoop) return 'LineLoop';
    if (child instanceof THREE.LineSegments) return 'LineSegments';
    if (child instanceof THREE.Line) return 'Line';

    // ── Points ──
    if (child instanceof THREE.Points) return 'Points';

    // ── Sprite ──
    if (child instanceof THREE.Sprite) return 'Sprite';

    // ── LOD ──
    if (child instanceof THREE.LOD) return 'LOD';

    // ── Bone ──
    if (child instanceof THREE.Bone) return 'Bone';

    // ── Camera variants ──
    if (child instanceof THREE.PerspectiveCamera) return 'PerspectiveCamera';
    if (child instanceof THREE.OrthographicCamera) return 'OrthographicCamera';
    if (child instanceof THREE.Camera) return 'Camera';

    // ── Light variants ──
    if (child instanceof THREE.DirectionalLight) return 'DirectionalLight';
    if (child instanceof THREE.SpotLight) return 'SpotLight';
    if (child instanceof THREE.PointLight) return 'PointLight';
    if (child instanceof THREE.RectAreaLight) return 'RectAreaLight';
    if (child instanceof THREE.HemisphereLight) return 'HemisphereLight';
    if (child instanceof THREE.AmbientLight) return 'AmbientLight';
    if (child instanceof THREE.Light) return 'Light';

    // ── Group / generic Object3D ──
    if (child instanceof THREE.Group) return 'Group';
    if (child instanceof THREE.Scene) return 'Scene';

    // Fallback: use the Three.js `.type` field
    return child.type || 'Object3D';
  };

  // ── Single traversal handles passes 1-4 ────────────────────────

  clone.traverse((child) => {
    // Skip the root scene itself
    if (child === clone) return;

    // Passes 1 + 2: Name materials and their textures
    if (child instanceof THREE.Mesh || (child as any).isMesh) {
      const mesh = child as THREE.Mesh;
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      mats.forEach((m) => m && nameMaterial(m));

      // Pass 3: Name geometry
      if (mesh.geometry) nameGeometry(mesh.geometry);
    }

    // Sprites have materials too
    if (child instanceof THREE.Sprite && child.material) {
      nameMaterial(child.material);
    }

    // Lines / Points can have materials
    if (
      (child instanceof THREE.Line || child instanceof THREE.Points) &&
      child.material
    ) {
      const mats = Array.isArray(child.material)
        ? child.material
        : [child.material];
      mats.forEach((m) => m && nameMaterial(m));

      // Lines and Points also have geometry
      if ((child as any).geometry) nameGeometry((child as any).geometry);
    }

    // Pass 4: Name the node itself (skip already-named)
    if (child.name && child.name.trim().length > 0) return;

    child.name = getUniqueName(objectCounts, getObjectBaseName(child));
  });
}

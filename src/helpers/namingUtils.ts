import * as THREE from 'three';

/**
 * Assigns unique, readable names to **Materials** and **Meshes** based on:
 *   1. Existing `.name`       (kept as-is if already set)
 *   2. Texture name           (from `.map.name`)
 *   3. Texture filename       (from `.map.image.src`, e.g. "wood.jpg" → "wood")
 *   4. Hex color fallback     (from `.color`, e.g. "#ff6600")
 *
 * Naming materials individually prevents GLTFExporter from merging
 * visually distinct materials into one generic gray material.
 */
export function assignReadableNames(clone: THREE.Scene): void {
  const materialNameCounts: Record<string, number> = {};
  const objectNameCounts: Record<string, number> = {};
  const visitedMaterials = new Set<string>();

  // ── helpers ──────────────────────────────────────────────────────

  /** Returns "Name", "Name_2", "Name_3", … */
  const getUniqueName = (
    counts: Record<string, number>,
    base: string,
  ): string => {
    // Strip file extension and sanitize for glTF compatibility
    const clean =
      (base.includes('.') ? base.split('.').slice(0, -1).join('.') : base)
        .replace(/[^a-zA-Z0-9_#]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '') || 'Unnamed';

    counts[clean] = (counts[clean] || 0) + 1;
    return counts[clean] === 1 ? clean : `${clean}_${counts[clean]}`;
  };

  /** Extract hex color string from a material, if it has one. */
  const getMaterialColorHex = (mat: THREE.Material): string | null => {
    if (mat && 'color' in mat && (mat as any).color instanceof THREE.Color) {
      return '#' + (mat as any).color.getHexString();
    }
    return null;
  };

  /**
   * Try to extract a human-readable texture name from a material's `map`.
   * Priority: `.map.name` → filename from `.map.image.src`.
   */
  const getTextureName = (mat: THREE.Material): string | null => {
    if (!('map' in mat)) return null;

    const map = (mat as any).map as THREE.Texture | null;
    if (!map) return null;

    // 1. Explicit texture name
    if (map.name && map.name.trim().length > 0) return map.name.trim();

    // 2. Filename from image URL (e.g. "/textures/wood.jpg" → "wood")
    if (map.image) {
      const src: string | undefined =
        map.image.src || map.image.currentSrc;
      if (typeof src === 'string' && src.length > 0) {
        const filename = src.split('/').pop()?.split('?')[0];
        if (filename) return filename;
      }
    }

    return null;
  };

  // ── material naming ──────────────────────────────────────────────

  const processMaterial = (mat: THREE.Material): void => {
    if (!mat || visitedMaterials.has(mat.uuid)) return;
    visitedMaterials.add(mat.uuid);

    // Already named by the user → keep it
    if (mat.name && mat.name.trim().length > 0) return;

    // Short material-type prefix: "MeshStandardMaterial" → "Standard"
    let baseName =
      mat.type
        .replace('Mesh', '')
        .replace('Material', '')
        .replace('Shader', 'Shader') || 'Mat';

    const textureName = getTextureName(mat);
    const colorHex = getMaterialColorHex(mat);

    if (textureName) {
      baseName = textureName; // e.g. "wood_diffuse"
    } else if (colorHex) {
      baseName += `_${colorHex}`; // e.g. "Standard_#ff0000"
    }

    mat.name = getUniqueName(materialNameCounts, baseName);
  };

  // ── traverse ─────────────────────────────────────────────────────

  clone.traverse((child) => {
    // 1. Name every material first
    if (child instanceof THREE.Mesh) {
      const mats = Array.isArray(child.material)
        ? child.material
        : [child.material];
      mats.forEach((m) => m && processMaterial(m));
    }

    // 2. Name the object itself (skip root scene and already-named)
    if (child === clone) return;
    if (child.name && child.name.trim().length > 0) return;

    if (child instanceof THREE.Mesh) {
      const geoLabel =
        (child.geometry?.type || 'Mesh')
          .replace('Buffer', '')
          .replace('Geometry', '') || 'Mesh';

      // Suffix from the primary material's texture or color
      const mat = Array.isArray(child.material)
        ? child.material[0]
        : child.material;
      let suffix = '';
      if (mat) {
        const tex = getTextureName(mat);
        const col = getMaterialColorHex(mat);
        if (tex) suffix = `_${tex}`;
        else if (col) suffix = `_${col}`;
      }

      child.name = getUniqueName(objectNameCounts, `${geoLabel}${suffix}`);
    } else if (child instanceof THREE.Group || child.type === 'Object3D') {
      child.name = getUniqueName(objectNameCounts, 'Group');
    }
  });
}

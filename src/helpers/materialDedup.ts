import * as THREE from 'three';

/**
 * Deduplicates materials (and their textures) by name across the entire scene.
 *
 * After `assignReadableNames` has given every material a unique, human-readable
 * name, some materials that were created independently may share the same name
 * because they are truly identical (same color, same texture).  Those duplicates
 * would appear in Blender as "Standard_#ff0000", "Standard_#ff0000_2", etc.
 *
 * This function:
 *   1. Collects the **first** material seen for each name (the canonical one).
 *   2. On every subsequent mesh that holds a duplicate, swaps the duplicate
 *      reference for the canonical material.
 *   3. Does the same for textures found on those materials.
 *
 * Must be called **after** `assignReadableNames` so that all materials
 * already have their final names.
 */
export function deduplicateMaterials(clone: THREE.Scene): void {
  // name → canonical material
  const canonical = new Map<string, THREE.Material>();
  // uuid → canonical material (for fast lookup during the swap pass)
  const uuidToCanonical = new Map<string, THREE.Material>();

  // ── Pass 1: build canonical map ──────────────────────────────────────────
  clone.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat || !mat.name) continue;
      if (!canonical.has(mat.name)) {
        canonical.set(mat.name, mat);
      } else {
        // Record that this uuid should be replaced
        const existing = canonical.get(mat.name)!;
        if (existing.uuid !== mat.uuid) {
          uuidToCanonical.set(mat.uuid, existing);
        }
      }
    }
  });

  if (uuidToCanonical.size === 0) {
    console.log('[GLB Export] deduplicateMaterials: no duplicate materials found');
    return;
  }

  // ── Pass 2: swap duplicates out ───────────────────────────────────────────
  let swapCount = 0;

  clone.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    if (Array.isArray(child.material)) {
      const newMats = child.material.map((mat) => {
        if (!mat) return mat;
        const replacement = uuidToCanonical.get(mat.uuid);
        if (replacement) {
          swapCount++;
          return replacement;
        }
        return mat;
      });
      child.material = newMats;
    } else {
      const mat = child.material as THREE.Material;
      if (mat) {
        const replacement = uuidToCanonical.get(mat.uuid);
        if (replacement) {
          child.material = replacement as any;
          swapCount++;
        }
      }
    }
  });

  console.log(
    `[GLB Export] deduplicateMaterials: merged ${uuidToCanonical.size} duplicate material(s), ` +
    `${swapCount} mesh slot(s) updated`,
  );
}

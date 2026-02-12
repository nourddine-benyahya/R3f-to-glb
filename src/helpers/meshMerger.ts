import * as THREE from 'three';

/**
 * Merges descendant meshes of groups named "exportGroup" that share materials.
 *
 * Only groups explicitly tagged with name="exportGroup" are processed;
 * everything else is left as-is.
 *
 * Strategy per material bucket:
 *   - Unique-material mesh (only one mesh uses this material): the mesh is
 *     left COMPLETELY UNTOUCHED in the hierarchy — same geometry, same
 *     transforms, same parent chain. No clone, no reparent, no modification.
 *     This preserves the original normals / split-normals / shading exactly.
 *   - Shared-material meshes (2+ meshes use the same material): geometries
 *     are cloned, transformed into the exportGroup's local space, and
 *     concatenated into one geometry.
 *   - Multi-material source meshes are always split by material and their
 *     sub-geometries are merged into the appropriate material buckets.
 */
export function mergeExportGroups(clone: THREE.Scene): void {
  // --- Locate every group tagged name="exportGroup" ---
  const exportGroups: THREE.Object3D[] = [];
  clone.traverse((child) => {
    if (
      child.name === 'exportGroup' &&
      (child instanceof THREE.Group ||
        child.type === 'Object3D' ||
        child.type === 'Group')
    ) {
      exportGroups.push(child);
    }
  });

  if (exportGroups.length === 0) {
    console.warn(
      '[GLB Export] mergeMeshesInGroups is true but no groups named ' +
        '"exportGroup" were found. Add name="exportGroup" to any <group> ' +
        'whose descendants should be merged.',
    );
  }

  for (const exportGroup of exportGroups) {
    // Collect ALL descendant meshes at any depth
    const allMeshes: THREE.Mesh[] = [];
    exportGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        allMeshes.push(child);
      }
    });

    if (allMeshes.length === 0) continue;

    exportGroup.updateWorldMatrix(true, true);
    const groupWorldMatrixInverse = exportGroup.matrixWorld.clone().invert();

    // ---- Phase 1: collect bucket entries ----
    interface BucketEntry {
      /** Original mesh ref — set for single-material source meshes */
      originalMesh?: THREE.Mesh;
      /** The mesh→exportGroup transform */
      combinedMatrix: THREE.Matrix4;
      /** Already-extracted sub-geometry (multi-material splits) */
      extractedGeo?: THREE.BufferGeometry;
    }

    const materialBuckets = new Map<
      string,
      { material: THREE.Material; entries: BucketEntry[] }
    >();

    // Track multi-material source meshes (always need removal + rebuild)
    const multiMaterialSources = new Set<THREE.Mesh>();

    const addEntry = (
      mat: THREE.Material,
      entry: BucketEntry,
    ) => {
      const key = mat.uuid;
      if (!materialBuckets.has(key)) {
        materialBuckets.set(key, { material: mat, entries: [] });
      }
      materialBuckets.get(key)!.entries.push(entry);
    };

    for (const mesh of allMeshes) {
      mesh.updateWorldMatrix(true, false);

      const combinedMatrix = new THREE.Matrix4()
        .copy(groupWorldMatrixInverse)
        .multiply(mesh.matrixWorld);

      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];

      if (mats.length <= 1 || mesh.geometry.groups.length === 0) {
        // Single-material mesh — store reference, DON'T clone/transform yet
        addEntry(mats[0], { originalMesh: mesh, combinedMatrix });
      } else {
        // Multi-material mesh — must extract sub-geometries per material
        multiMaterialSources.add(mesh);
        const isIndexed = mesh.geometry.index !== null;
        for (const grp of mesh.geometry.groups) {
          const matIdx = grp.materialIndex ?? 0;
          const mat = mats[matIdx] ?? mats[0];
          const subGeo = isIndexed
            ? extractIndexedSubGeometry(mesh.geometry, grp)
            : extractNonIndexedSubGeometry(mesh.geometry, grp);
          addEntry(mat, { extractedGeo: subGeo, combinedMatrix });
        }
      }
    }

    // ---- Phase 2: process each material bucket ----
    // Multi-material sources always need removal (they get split by material)
    const meshesToRemove = new Set<THREE.Mesh>(multiMaterialSources);
    const newMeshes: THREE.Mesh[] = [];
    let keptCount = 0;

    for (const [, { material, entries }] of materialBuckets) {
      // ---- Skip path: unique-material mesh ----
      // If this bucket has exactly ONE entry from a single-material source,
      // leave it COMPLETELY UNTOUCHED in the hierarchy. No clone, no reparent,
      // no geometry modification of any kind. The GLTFExporter will find it
      // in its original position with its original transforms and geometry.
      if (
        entries.length === 1 &&
        entries[0].originalMesh &&
        !entries[0].extractedGeo
      ) {
        keptCount++;
        continue;
      }

      // ---- Merge path: shared material or multi-material sub-geometry ----
      // Mark single-material source meshes for removal
      for (const entry of entries) {
        if (entry.originalMesh) {
          meshesToRemove.add(entry.originalMesh);
        }
      }

      const geos: THREE.BufferGeometry[] = [];

      for (const entry of entries) {
        let geo: THREE.BufferGeometry;

        if (entry.extractedGeo) {
          // Sub-geometry from a multi-material split
          geo = entry.extractedGeo;
        } else if (entry.originalMesh) {
          // Single-material mesh that shares a material with others
          geo = entry.originalMesh.geometry.clone();
        } else {
          continue;
        }

        geo.applyMatrix4(entry.combinedMatrix);
        prepareGeometry(geo);
        geos.push(geo);
      }

      if (geos.length === 0) continue;

      const compatible = ensureCompatibleAttributes(geos);
      const merged =
        compatible.length === 1
          ? compatible[0]
          : concatIndexedGeometries(compatible);

      if (!merged) {
        console.warn(
          `[GLB Export] Failed to merge geometries for material ` +
            `"${material.name || material.uuid}" – skipping.`,
        );
        continue;
      }

      // Ensure indexed for GLTFExporter
      if (merged.index === null) {
        const count = merged.attributes.position.count;
        const identity =
          count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
        for (let k = 0; k < count; k++) identity[k] = k;
        merged.setIndex(new THREE.BufferAttribute(identity, 1));
      }

      const matLabel = material.name || `mat${newMeshes.length}`;
      const outMesh = new THREE.Mesh(merged, material);
      outMesh.name = exportGroup.name
        ? `${exportGroup.name}_${matLabel}`
        : `Merged_${matLabel}`;
      newMeshes.push(outMesh);
    }

    // ---- Phase 3: apply changes to the scene tree ----
    // Only remove meshes that were merged or split — leave the rest untouched
    for (const mesh of meshesToRemove) {
      mesh.removeFromParent();
    }

    // Add newly created merged meshes as direct children of exportGroup
    for (const mesh of newMeshes) {
      exportGroup.add(mesh);
    }

    // Clean up empty intermediate groups (bottom-up)
    let changed = true;
    while (changed) {
      changed = false;
      const empties: THREE.Object3D[] = [];
      exportGroup.traverse((child) => {
        if (
          child !== exportGroup &&
          !(child instanceof THREE.Mesh) &&
          child.children.length === 0
        ) {
          empties.push(child);
        }
      });
      for (const g of empties) {
        g.removeFromParent();
        changed = true;
      }
    }

    console.log(
      `[GLB Export] "${exportGroup.name}": kept ${keptCount} mesh(es) untouched, ` +
        `merged ${meshesToRemove.size} source mesh(es) → ${newMeshes.length} output mesh(es)`,
    );
  }
}

// ---------------------------------------------------------------------------
//  Private helpers
// ---------------------------------------------------------------------------

/**
 * Prepares a geometry for merging (used only for the multi-mesh path):
 * - Computes vertex normals if none exist
 * - Ensures the geometry is indexed
 * - Clears stale geometry groups
 */
function prepareGeometry(geo: THREE.BufferGeometry): void {
  if (!geo.attributes.normal) {
    geo.computeVertexNormals();
  }
  if (geo.index === null) {
    const count = geo.attributes.position.count;
    const identity =
      count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
    for (let i = 0; i < count; i++) identity[i] = i;
    geo.setIndex(new THREE.BufferAttribute(identity, 1));
  }
  geo.clearGroups();
}

/**
 * Extracts a sub-geometry from an indexed geometry for a given group.
 */
function extractIndexedSubGeometry(
  sourceGeo: THREE.BufferGeometry,
  grp: { start: number; count: number },
): THREE.BufferGeometry {
  const subGeo = new THREE.BufferGeometry();
  const srcIndex = sourceGeo.index!.array;

  const usedVertices = new Set<number>();
  for (let i = grp.start; i < grp.start + grp.count; i++) {
    usedVertices.add(srcIndex[i]);
  }

  const vertexRemap = new Map<number, number>();
  let nextIdx = 0;
  for (const v of usedVertices) {
    vertexRemap.set(v, nextIdx++);
  }

  for (const [attrName, attr] of Object.entries(sourceGeo.attributes)) {
    const src = attr as THREE.BufferAttribute;
    const itemSize = src.itemSize;
    const newArr = new Float32Array(vertexRemap.size * itemSize);
    for (const [oldIdx, newIdx] of vertexRemap) {
      for (let j = 0; j < itemSize; j++) {
        newArr[newIdx * itemSize + j] = src.array[oldIdx * itemSize + j];
      }
    }
    subGeo.setAttribute(attrName, new THREE.BufferAttribute(newArr, itemSize));
  }

  const newIndices: number[] = [];
  for (let i = grp.start; i < grp.start + grp.count; i++) {
    newIndices.push(vertexRemap.get(srcIndex[i])!);
  }
  subGeo.setIndex(newIndices);

  return subGeo;
}

/**
 * Extracts a sub-geometry from a non-indexed geometry for a given group.
 */
function extractNonIndexedSubGeometry(
  sourceGeo: THREE.BufferGeometry,
  grp: { start: number; count: number },
): THREE.BufferGeometry {
  const subGeo = new THREE.BufferGeometry();
  for (const [attrName, attr] of Object.entries(sourceGeo.attributes)) {
    const src = attr as THREE.BufferAttribute;
    const itemSize = src.itemSize;
    const start = grp.start * itemSize;
    const end = (grp.start + grp.count) * itemSize;
    const sliced = src.array.slice(start, end);
    subGeo.setAttribute(
      attrName,
      new THREE.BufferAttribute(sliced as Float32Array, itemSize),
    );
  }
  return subGeo;
}

/**
 * Ensures all geometries have the same set of attributes.
 * Missing attributes are zero-filled.
 */
function ensureCompatibleAttributes(
  geometries: THREE.BufferGeometry[],
): THREE.BufferGeometry[] {
  if (geometries.length <= 1) return geometries;

  const allAttrNames = new Set<string>();
  for (const geo of geometries) {
    Object.keys(geo.attributes).forEach((n) => allAttrNames.add(n));
  }

  for (const geo of geometries) {
    const vertexCount = geo.attributes.position?.count ?? 0;
    for (const attrName of allAttrNames) {
      if (!geo.attributes[attrName]) {
        let itemSize = 3;
        for (const other of geometries) {
          const otherAttr = other.attributes[attrName] as
            | THREE.BufferAttribute
            | undefined;
          if (otherAttr) {
            itemSize = otherAttr.itemSize;
            break;
          }
        }
        const zeros = new Float32Array(vertexCount * itemSize);
        geo.setAttribute(
          attrName,
          new THREE.BufferAttribute(zeros, itemSize),
        );
      }
    }
  }
  return geometries;
}

/**
 * Concatenates multiple indexed geometries into one indexed geometry.
 */
function concatIndexedGeometries(
  geometries: THREE.BufferGeometry[],
): THREE.BufferGeometry {
  const attrNames = Object.keys(geometries[0].attributes);
  const vertexCounts = geometries.map((g) => g.attributes.position.count);

  const result = new THREE.BufferGeometry();

  for (const name of attrNames) {
    const itemSize = (geometries[0].attributes[name] as THREE.BufferAttribute)
      .itemSize;
    const totalLength = geometries.reduce(
      (sum, g) =>
        sum + (g.attributes[name] as THREE.BufferAttribute).array.length,
      0,
    );
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const g of geometries) {
      const src = (g.attributes[name] as THREE.BufferAttribute).array;
      merged.set(src, offset);
      offset += src.length;
    }
    result.setAttribute(name, new THREE.BufferAttribute(merged, itemSize));
  }

  const totalIndices = geometries.reduce(
    (sum, g) => sum + g.index!.count,
    0,
  );
  const totalVertices = result.attributes.position.count;
  const IndexCtor = totalVertices > 65535 ? Uint32Array : Uint16Array;
  const mergedIndices = new IndexCtor(totalIndices);

  let indexOffset = 0;
  let vertexOffset = 0;
  for (let i = 0; i < geometries.length; i++) {
    const srcIndex = geometries[i].index!.array;
    const indexCount = geometries[i].index!.count;
    for (let j = 0; j < indexCount; j++) {
      mergedIndices[indexOffset + j] = srcIndex[j] + vertexOffset;
    }
    indexOffset += indexCount;
    vertexOffset += vertexCounts[i];
  }

  result.setIndex(new THREE.BufferAttribute(mergedIndices, 1));
  return result;
}

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merges all descendant meshes of groups named "exportGroup" into a
 * single multi-material mesh per group.
 *
 * Only groups explicitly tagged with name="exportGroup" are processed;
 * everything else is left as-is.
 *
 * Key capabilities:
 *   - Attribute normalisation: if geometries have different attribute
 *     sets (e.g. some lack UVs) missing attributes are zero-filled so
 *     mergeGeometries never fails silently.
 *   - Mixed indexed / non-indexed: all converted to non-indexed first.
 *   - Multi-material source meshes: split by their geometry groups so
 *     each sub-geometry lands in the correct material bucket.
 *   - Identity index buffer: forces the three-stdlib GLTFExporter down
 *     its indexed code path so each geometry group's vertex range is
 *     correctly extracted per primitive.
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

    // Inverse world matrix of the exportGroup – used to convert every
    // mesh's geometry from world space into the exportGroup's local space.
    exportGroup.updateWorldMatrix(true, true);
    const groupWorldMatrixInverse = exportGroup.matrixWorld.clone().invert();

    // ---- Build per-material geometry buckets ----
    const materialBuckets = new Map<
      string,
      { material: THREE.Material; geometries: THREE.BufferGeometry[] }
    >();

    const addToBucket = (mat: THREE.Material, geo: THREE.BufferGeometry) => {
      const key = mat.uuid;
      if (!materialBuckets.has(key)) {
        materialBuckets.set(key, { material: mat, geometries: [] });
      }
      materialBuckets.get(key)!.geometries.push(geo);
    };

    for (const mesh of allMeshes) {
      mesh.updateWorldMatrix(true, false);
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];

      if (mats.length <= 1 || mesh.geometry.groups.length === 0) {
        // ---- Single-material mesh (common case) ----
        const geo = mesh.geometry.clone();
        geo.applyMatrix4(mesh.matrixWorld);
        geo.applyMatrix4(groupWorldMatrixInverse);
        addToBucket(mats[0], geo);
      } else {
        // ---- Multi-material mesh → split geometry by its groups ----
        splitMultiMaterialMesh(
          mesh,
          mats,
          groupWorldMatrixInverse,
          addToBucket,
        );
      }
    }

    // ---- Merge geometries inside each material bucket ----
    const perMaterialGeos: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];

    for (const [, { material, geometries }] of materialBuckets) {
      const compatible = ensureCompatibleAttributes(geometries);

      const merged =
        compatible.length === 1
          ? compatible[0]
          : BufferGeometryUtils.mergeGeometries(compatible, false);

      if (merged) {
        perMaterialGeos.push(merged);
        materials.push(material);
      } else {
        console.warn(
          `[GLB Export] Failed to merge ${geometries.length} geometries ` +
            `for material "${material.name || material.uuid}" – skipping.`,
        );
      }

      // Dispose intermediate clones (skip single-geo case – it IS the result)
      if (compatible.length > 1) compatible.forEach((g) => g.dispose());
    }

    if (perMaterialGeos.length === 0) continue;

    // ---- Build the final single merged mesh ----
    const finalMesh = buildCombinedMesh(perMaterialGeos, materials);
    finalMesh.name = exportGroup.name
      ? `${exportGroup.name}_merged`
      : 'Merged';

    // Replace ALL children of the exportGroup with the merged mesh
    while (exportGroup.children.length > 0) {
      exportGroup.children[0].removeFromParent();
    }
    exportGroup.add(finalMesh);

    console.log(
      `[GLB Export] Merged ${allMeshes.length} meshes → 1 mesh ` +
        `(${materials.length} material(s)) in "${exportGroup.name}" → ` +
        `"${finalMesh.name}"`,
    );
  }
}

// ---------------------------------------------------------------------------
//  Private helpers
// ---------------------------------------------------------------------------

/**
 * Splits a multi-material mesh into separate geometries per material
 * and adds each to the appropriate material bucket.
 */
function splitMultiMaterialMesh(
  mesh: THREE.Mesh,
  mats: THREE.Material[],
  groupWorldMatrixInverse: THREE.Matrix4,
  addToBucket: (mat: THREE.Material, geo: THREE.BufferGeometry) => void,
): void {
  const isIndexed = mesh.geometry.index !== null;

  for (const grp of mesh.geometry.groups) {
    const matIdx = grp.materialIndex ?? 0;
    const mat = mats[matIdx] ?? mats[0];
    let subGeo: THREE.BufferGeometry;

    if (isIndexed) {
      subGeo = extractIndexedSubGeometry(mesh.geometry, grp);
    } else {
      subGeo = extractNonIndexedSubGeometry(mesh.geometry, grp);
    }

    subGeo.applyMatrix4(mesh.matrixWorld);
    subGeo.applyMatrix4(groupWorldMatrixInverse);
    addToBucket(mat, subGeo);
  }
}

/**
 * Extracts a sub-geometry from an indexed geometry for a given group.
 * Only copies the vertices actually referenced by the group's index range.
 */
function extractIndexedSubGeometry(
  sourceGeo: THREE.BufferGeometry,
  grp: { start: number; count: number },
): THREE.BufferGeometry {
  const subGeo = new THREE.BufferGeometry();
  const srcIndex = sourceGeo.index!.array;

  // Collect unique vertex indices used by this group
  const usedVertices = new Set<number>();
  for (let i = grp.start; i < grp.start + grp.count; i++) {
    usedVertices.add(srcIndex[i]);
  }

  // Map old vertex index → compacted new index
  const vertexRemap = new Map<number, number>();
  let nextIdx = 0;
  for (const v of usedVertices) {
    vertexRemap.set(v, nextIdx++);
  }

  // Copy attributes for used vertices only
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

  // Build new index buffer
  const newIndices: number[] = [];
  for (let i = grp.start; i < grp.start + grp.count; i++) {
    newIndices.push(vertexRemap.get(srcIndex[i])!);
  }
  subGeo.setIndex(newIndices);

  return subGeo;
}

/**
 * Extracts a sub-geometry from a non-indexed geometry for a given group.
 * Slices the attribute arrays based on group start/count.
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
 * Ensures all geometries have the same set of attributes and index status
 * so that BufferGeometryUtils.mergeGeometries() can merge them.
 *
 * 1. If there is a mix of indexed and non-indexed geometries, all
 *    indexed ones are expanded via toNonIndexed().
 * 2. For every attribute that exists on at least one geometry but
 *    is missing on another, a zero-filled attribute of the same
 *    itemSize is added.
 */
function ensureCompatibleAttributes(
  geometries: THREE.BufferGeometry[],
): THREE.BufferGeometry[] {
  if (geometries.length <= 1) return geometries;

  // Collect union of all attribute names + index status
  const allAttrNames = new Set<string>();
  let hasIndexed = false;
  let hasNonIndexed = false;

  for (const geo of geometries) {
    Object.keys(geo.attributes).forEach((n) => allAttrNames.add(n));
    if (geo.index !== null) hasIndexed = true;
    else hasNonIndexed = true;
  }

  const result: THREE.BufferGeometry[] = [];

  for (let i = 0; i < geometries.length; i++) {
    let geo = geometries[i];

    // Convert indexed → non-indexed when the set is mixed
    if (hasIndexed && hasNonIndexed && geo.index !== null) {
      geo = geo.toNonIndexed();
    }

    const vertexCount = geo.attributes.position?.count ?? 0;

    // Add any missing attributes with zero-filled defaults
    for (const attrName of allAttrNames) {
      if (!geo.attributes[attrName]) {
        // Match itemSize from a geometry that has this attribute
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

    result.push(geo);
  }

  return result;
}

/**
 * Builds a single THREE.Mesh from per-material geometries.
 *
 * For multiple materials the geometries are concatenated into one
 * non-indexed BufferGeometry with explicit geometry groups, plus a
 * trivial identity index buffer to work around a three-stdlib
 * GLTFExporter limitation (it only extracts per-group sub-ranges
 * for indexed geometry).
 */
function buildCombinedMesh(
  perMaterialGeos: THREE.BufferGeometry[],
  materials: THREE.Material[],
): THREE.Mesh {
  if (perMaterialGeos.length === 1) {
    // Only one material – no groups needed
    return new THREE.Mesh(perMaterialGeos[0], materials[0]);
  }

  // Ensure attribute compatibility across per-material geometries
  const compatFinal = ensureCompatibleAttributes(perMaterialGeos);

  // Convert everything to non-indexed so vertex counts are simple
  const nonIndexed = compatFinal.map((g) =>
    g.index !== null ? g.toNonIndexed() : g,
  );

  // Collect attribute names (all share the same set after normalisation)
  const attrNames = Object.keys(nonIndexed[0].attributes);

  // Build the combined geometry by concatenating attribute arrays
  const finalGeo = new THREE.BufferGeometry();

  for (const name of attrNames) {
    const itemSize = (nonIndexed[0].attributes[name] as THREE.BufferAttribute)
      .itemSize;
    const totalLength = nonIndexed.reduce(
      (sum, g) =>
        sum + (g.attributes[name] as THREE.BufferAttribute).array.length,
      0,
    );
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const g of nonIndexed) {
      const src = (g.attributes[name] as THREE.BufferAttribute).array;
      merged.set(src, offset);
      offset += src.length;
    }
    finalGeo.setAttribute(name, new THREE.BufferAttribute(merged, itemSize));
  }

  // Assign geometry groups – each maps an index range to a material
  let vertexOffset = 0;
  for (let i = 0; i < nonIndexed.length; i++) {
    const count = nonIndexed[i].attributes.position.count;
    finalGeo.addGroup(vertexOffset, count, i);
    vertexOffset += count;
  }

  // IMPORTANT: The three-stdlib GLTFExporter only extracts per-group
  // sub-ranges for INDEXED geometry.  For non-indexed geometry every
  // primitive receives the full attribute buffers, which breaks
  // multi-material mapping.  Adding a trivial identity index buffer
  // [0, 1, 2, …, N-1] forces the exporter down its indexed code path
  // so each group's start/count correctly selects only its vertices.
  const totalVertices = finalGeo.attributes.position.count;
  const indices =
    totalVertices > 65535
      ? new Uint32Array(totalVertices)
      : new Uint16Array(totalVertices);
  for (let i = 0; i < totalVertices; i++) indices[i] = i;
  finalGeo.setIndex(new THREE.BufferAttribute(indices, 1));

  const mesh = new THREE.Mesh(finalGeo, materials);

  // Dispose temporaries
  nonIndexed.forEach((g) => g.dispose());

  return mesh;
}

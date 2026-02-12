import * as THREE from 'three';

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
 *     merging never fails silently.
 *   - All geometries are kept indexed to preserve vertex-sharing
 *     (split normals / sharp edges).  Non-indexed inputs receive an
 *     identity index buffer.
 *   - Multi-material source meshes: split by their geometry groups so
 *     each sub-geometry lands in the correct material bucket.
 *   - The final mesh is always indexed, which forces the three-stdlib
 *     GLTFExporter down its indexed code path so each geometry group's
 *     vertex range is correctly extracted per primitive.
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

      // Single combined matrix: exportGroup-local ← world ← mesh-local
      const combinedMatrix = new THREE.Matrix4()
        .copy(groupWorldMatrixInverse)
        .multiply(mesh.matrixWorld);

      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];

      // Helper to process a single geometry before adding to bucket
      const processGeo = (mat: THREE.Material, geo: THREE.BufferGeometry) => {
        // FIX: If material is flat shaded, we must split vertices to bake the look
        // otherwise it will look smooth (puffy) in the exported GLB.
        if ('flatShading' in mat && mat.flatShading === true) {
            geo = geo.toNonIndexed(); 
            geo.computeVertexNormals(); // Re-computes flat normals per face
        }
        
        geo.applyMatrix4(combinedMatrix);
        prepareGeometry(geo);
        addToBucket(mat, geo);
      };

      if (mats.length <= 1 || mesh.geometry.groups.length === 0) {
        // ---- Single-material mesh ----
        const geo = mesh.geometry.clone();
        processGeo(mats[0], geo);
      } else {
        // ---- Multi-material mesh ----
        // We need a custom addToBucket wrapper here to handle the splitting logic
        // re-implemented slightly differently for the split function:
        
        splitMultiMaterialMesh(mesh, mats, combinedMatrix, (mat, geo) => {
             if ('flatShading' in mat && mat.flatShading === true) {
                geo = geo.toNonIndexed();
                geo.computeVertexNormals();
             }
             // splitMultiMaterialMesh already applies matrix, so we just prepare
             prepareGeometry(geo);
             addToBucket(mat, geo);
        });
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
          : concatIndexedGeometries(compatible);

      if (merged) {
        perMaterialGeos.push(merged);
        materials.push(material);
      } else {
        console.warn(
          `[GLB Export] Failed to merge ${geometries.length} geometries ` +
            `for material "${material.name || material.uuid}" – skipping.`,
        );
      }
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
 * Prepares a single geometry for merging:
 * - Computes vertex normals if the geometry has none
 * - Ensures the geometry is indexed (adds identity index if needed)
 * - Clears any stale geometry groups from the source mesh
 */
function prepareGeometry(geo: THREE.BufferGeometry): void {
  // Ensure normals exist — geometries without normals would get zero-filled
  // later by ensureCompatibleAttributes, resulting in black faces.
  if (!geo.attributes.normal) {
    geo.computeVertexNormals();
  }

  // Make sure the geometry is indexed — this preserves vertex-sharing
  // (split normals / sharp edges) throughout the entire merge pipeline.
  if (geo.index === null) {
    const count = geo.attributes.position.count;
    const identity =
      count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
    for (let i = 0; i < count; i++) identity[i] = i;
    geo.setIndex(new THREE.BufferAttribute(identity, 1));
  }

  // Remove stale groups from the original mesh — we assign new groups
  // in buildCombinedMesh based on material buckets.
  geo.clearGroups();
}

/**
 * Splits a multi-material mesh into separate geometries per material
 * and adds each to the appropriate material bucket.
 */
function splitMultiMaterialMesh(
  mesh: THREE.Mesh,
  mats: THREE.Material[],
  combinedMatrix: THREE.Matrix4,
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

    subGeo.applyMatrix4(combinedMatrix);
    prepareGeometry(subGeo);
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
 * Ensures all geometries have the same set of attributes so they can
 * be concatenated.  Missing attributes are zero-filled.
 *
 * All input geometries are expected to be indexed (via prepareGeometry).
 */
function ensureCompatibleAttributes(
  geometries: THREE.BufferGeometry[],
): THREE.BufferGeometry[] {
  if (geometries.length <= 1) return geometries;

  // Collect union of all attribute names
  const allAttrNames = new Set<string>();
  for (const geo of geometries) {
    Object.keys(geo.attributes).forEach((n) => allAttrNames.add(n));
  }

  for (const geo of geometries) {
    const vertexCount = geo.attributes.position?.count ?? 0;

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
  }

  return geometries;
}

/**
 * Concatenates multiple indexed geometries into one indexed geometry.
 * Preserves vertex-sharing (split normals / sharp edges) by never
 * calling toNonIndexed().
 *
 * All inputs must be indexed and have the same attribute set
 * (call ensureCompatibleAttributes first).
 */
function concatIndexedGeometries(
  geometries: THREE.BufferGeometry[],
): THREE.BufferGeometry {
  const attrNames = Object.keys(geometries[0].attributes);
  const vertexCounts = geometries.map((g) => g.attributes.position.count);

  const result = new THREE.BufferGeometry();

  // Concatenate attributes
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

  // Concatenate index arrays with vertex offsets
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

/**
 * Builds a single THREE.Mesh from per-material geometries.
 *
 * Concatenates all per-material geometries into one indexed
 * BufferGeometry with explicit geometry groups.  Vertex-sharing
 * (split normals / sharp edges) is preserved throughout.
 *
 * The resulting mesh is always indexed, which satisfies the
 * three-stdlib GLTFExporter requirement for correct per-group
 * vertex range extraction.
 */
function buildCombinedMesh(
  perMaterialGeos: THREE.BufferGeometry[],
  materials: THREE.Material[],
): THREE.Mesh {
  if (perMaterialGeos.length === 1) {
    const geo = perMaterialGeos[0];
    // Ensure indexed for GLTFExporter even with single material
    if (geo.index === null) {
      const count = geo.attributes.position.count;
      const identity =
        count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
      for (let i = 0; i < count; i++) identity[i] = i;
      geo.setIndex(new THREE.BufferAttribute(identity, 1));
    }
    return new THREE.Mesh(geo, materials[0]);
  }

  // Ensure attribute compatibility across per-material geometries
  ensureCompatibleAttributes(perMaterialGeos);

  const attrNames = Object.keys(perMaterialGeos[0].attributes);
  const vertexCounts = perMaterialGeos.map(
    (g) => g.attributes.position.count,
  );

  // Build the combined geometry by concatenating attribute arrays
  const finalGeo = new THREE.BufferGeometry();

  for (const name of attrNames) {
    const itemSize = (
      perMaterialGeos[0].attributes[name] as THREE.BufferAttribute
    ).itemSize;
    const totalLength = perMaterialGeos.reduce(
      (sum, g) =>
        sum + (g.attributes[name] as THREE.BufferAttribute).array.length,
      0,
    );
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const g of perMaterialGeos) {
      const src = (g.attributes[name] as THREE.BufferAttribute).array;
      merged.set(src, offset);
      offset += src.length;
    }
    finalGeo.setAttribute(name, new THREE.BufferAttribute(merged, itemSize));
  }

  // Concatenate index arrays with vertex offsets and assign groups
  const totalIndices = perMaterialGeos.reduce(
    (sum, g) => sum + g.index!.count,
    0,
  );
  const totalVertices = finalGeo.attributes.position.count;
  const IndexCtor = totalVertices > 65535 ? Uint32Array : Uint16Array;
  const mergedIndices = new IndexCtor(totalIndices);

  let indexOffset = 0;
  let vertexOffset = 0;
  for (let i = 0; i < perMaterialGeos.length; i++) {
    const srcIndex = perMaterialGeos[i].index!.array;
    const indexCount = perMaterialGeos[i].index!.count;
    for (let j = 0; j < indexCount; j++) {
      mergedIndices[indexOffset + j] = srcIndex[j] + vertexOffset;
    }
    // Group ranges are based on INDEX offsets
    finalGeo.addGroup(indexOffset, indexCount, i);
    indexOffset += indexCount;
    vertexOffset += vertexCounts[i];
  }

  finalGeo.setIndex(new THREE.BufferAttribute(mergedIndices, 1));

  // Safety: renormalize all normals to ensure unit length
  const normalAttr = finalGeo.attributes.normal as
    | THREE.BufferAttribute
    | undefined;
  if (normalAttr) {
    const arr = normalAttr.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = arr[i],
        y = arr[i + 1],
        z = arr[i + 2];
      const len = Math.sqrt(x * x + y * y + z * z);
      if (len > 1e-8) {
        arr[i] /= len;
        arr[i + 1] /= len;
        arr[i + 2] /= len;
      }
    }
  }

  return new THREE.Mesh(finalGeo, materials);
}

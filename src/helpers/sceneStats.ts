import * as THREE from 'three';

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
        if (
          mat instanceof THREE.MeshStandardMaterial ||
          mat instanceof THREE.MeshPhysicalMaterial
        ) {
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

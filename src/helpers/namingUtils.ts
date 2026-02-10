import * as THREE from 'three';

/**
 * Assigns readable names to unnamed objects in the scene.
 * Uses geometry type + material color to generate descriptive names
 * (e.g. "Box_#ff6600", "Sphere_#ffffff").
 */
export function assignReadableNames(clone: THREE.Scene): void {
  const nameCounts: Record<string, number> = {};

  const getUniqueName = (base: string): string => {
    nameCounts[base] = (nameCounts[base] || 0) + 1;
    return nameCounts[base] === 1 ? base : `${base}_${nameCounts[base]}`;
  };

  const getMaterialColor = (mesh: THREE.Mesh): string | null => {
    const mat = Array.isArray(mesh.material)
      ? mesh.material[0]
      : mesh.material;
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

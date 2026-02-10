import * as THREE from 'three';

/**
 * Logs a scene hierarchy tree to the console for debugging.
 */
export function logSceneHierarchy(
  obj: THREE.Object3D,
  depth: number,
  maxDepth: number,
): void {
  if (depth > maxDepth) return;
  const indent = '  '.repeat(depth);
  const name = obj.name || obj.uuid.slice(0, 8);
  const childInfo =
    obj.children.length > 0 ? ` [${obj.children.length} children]` : '';
  console.log(`${indent}${obj.type}: "${name}"${childInfo}`);
  for (const child of obj.children) {
    logSceneHierarchy(child, depth + 1, maxDepth);
  }
}

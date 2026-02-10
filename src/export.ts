import * as THREE from 'three';
import { GLTFExporter } from 'three-stdlib';
import { saveAs } from 'file-saver';
import { DEFAULT_OPTIONS, type GLBExportOptions } from './types';

/**
 * Exports a Three.js scene or object to GLB/GLTF format and triggers download.
 */
export async function exportToGLB(
  input: THREE.Object3D | THREE.Object3D[],
  options: GLBExportOptions = {},
): Promise<Blob> {
  const config = { ...DEFAULT_OPTIONS, ...options };

  config.onStart?.();

  const exporter = new GLTFExporter();

  const exporterOptions = {
    binary: config.binary,
    maxTextureSize: config.maxTextureSize,
    onlyVisible: config.onlyVisible,
    animations: config.animations,
    trs: config.trs,
    includeCustomExtensions: config.includeCustomExtensions,
  };

  return new Promise((resolve, reject) => {
    exporter.parse(
      input,
      (result) => {
        try {
          let blob: Blob;

          if (result instanceof ArrayBuffer) {
            blob = new Blob([result], { type: 'application/octet-stream' });
          } else {
            const jsonString = JSON.stringify(result, null, 2);
            blob = new Blob([jsonString], { type: 'application/json' });
          }

          const extension = config.binary ? 'glb' : 'gltf';
          const fullFilename = `${config.filename}.${extension}`;

          saveAs(blob, fullFilename);

          config.onComplete?.(blob);
          resolve(blob);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          config.onError?.(error);
          reject(error);
        }
      },
      (err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        config.onError?.(error);
        reject(error);
      },
      exporterOptions,
    );
  });
}

/**
 * Exports a Three.js scene and returns the blob without downloading.
 * Useful for server uploads or custom handling.
 */
export async function exportToGLBBlob(
  input: THREE.Object3D | THREE.Object3D[],
  options: Omit<GLBExportOptions, 'filename'> = {},
): Promise<Blob> {
  const config = { ...DEFAULT_OPTIONS, ...options };

  const exporter = new GLTFExporter();

  const exporterOptions = {
    binary: config.binary,
    maxTextureSize: config.maxTextureSize,
    onlyVisible: config.onlyVisible,
    animations: config.animations,
    trs: config.trs,
    includeCustomExtensions: config.includeCustomExtensions,
  };

  return new Promise((resolve, reject) => {
    exporter.parse(
      input,
      (result) => {
        try {
          let blob: Blob;

          if (result instanceof ArrayBuffer) {
            blob = new Blob([result], { type: 'application/octet-stream' });
          } else {
            const jsonString = JSON.stringify(result, null, 2);
            blob = new Blob([jsonString], { type: 'application/json' });
          }

          resolve(blob);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      },
      (err) => {
        reject(err instanceof Error ? err : new Error(String(err)));
      },
      exporterOptions,
    );
  });
}

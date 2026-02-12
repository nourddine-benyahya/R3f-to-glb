import { useCallback, useState } from 'react';
import { useScene } from './SceneContext';
import { prepareSceneForExport } from './prepareScene';
import { exportToGLB, exportToGLBBlob } from './export';
import { getSceneStats } from './helpers/sceneStats';
import type { GLBExportOptions, PrepareSceneOptions } from './types';

export interface UseGLBExportOptions extends PrepareSceneOptions {
  /** Filename without extension. Default: 'scene' */
  filename?: string;
  /** Export options passed to GLTFExporter */
  exportOptions?: Omit<GLBExportOptions, 'filename'>;
  /** Log scene stats to console. Default: true */
  showStats?: boolean;
}

interface ExportResult {
  size: number;
  time: number;
}

/**
 * Hook that provides GLB export functions via the SceneContext.
 * Works from **anywhere** in the component tree (inside or outside Canvas),
 * as long as the component is wrapped in a `<SceneProvider>` and
 * `<SceneCapture />` is placed inside the Canvas.
 *
 * @example
 * function DownloadButton() {
 *   const { exportScene, isExporting } = useGLBExport();
 *
 *   return (
 *     <button
 *       onClick={() => exportScene({ filename: 'my-door' })}
 *       disabled={isExporting}
 *     >
 *       {isExporting ? 'Exporting...' : 'Download GLB'}
 *     </button>
 *   );
 * }
 */
export function useGLBExport() {
  const { getScene } = useScene();
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<ExportResult | null>(null);

  /**
   * Exports the current scene to a .glb file and triggers a download.
   * Waits one animation frame before cloning to ensure all async-loaded
   * objects (backend models, lazy components) are committed to the scene.
   */
  const exportScene = useCallback(
    async (options: UseGLBExportOptions = {}) => {
      if (isExporting) return;

      const {
        filename = 'scene',
        exportOptions = {},
        showStats = true,
        ...prepareOptions
      } = options;

      setIsExporting(true);
      setError(null);
      setLastExport(null);

      // Wait for the next animation frame so R3F has committed all
      // pending scene updates (async-loaded models, state changes, etc.)
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );

      const scene = getScene();
      if (!scene) {
        setError('Scene not ready. Place <SceneCapture /> inside your Canvas.');
        setIsExporting(false);
        return;
      }

      const startTime = performance.now();

      try {
        const cleanScene = prepareSceneForExport(scene, prepareOptions);

        if (showStats) {
          const stats = getSceneStats(cleanScene);
          console.log('[GLB Export] Scene stats:', stats);
        }

        await exportToGLB(cleanScene, {
          filename,
          ...exportOptions,
          onComplete: (blob) => {
            const elapsed = performance.now() - startTime;
            setLastExport({ size: blob.size, time: elapsed });
            console.log(
              `[GLB Export] Exported ${filename}.glb ` +
                `(${(blob.size / 1024).toFixed(1)} KB) in ${elapsed.toFixed(0)}ms`,
            );
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Export failed';
        setError(message);
        console.error('[GLB Export] Error:', err);
      } finally {
        setIsExporting(false);
      }
    },
    [getScene, isExporting],
  );

  /**
   * Exports the current scene and returns the Blob without downloading.
   * Useful for server uploads or custom handling.
   */
  const exportSceneToBlob = useCallback(
    async (
      options: Omit<UseGLBExportOptions, 'filename'> = {},
    ): Promise<Blob | null> => {
      const { exportOptions = {}, ...prepareOptions } = options;

      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );

      const scene = getScene();
      if (!scene) {
        console.error(
          '[GLB Export] Scene not ready. Place <SceneCapture /> inside your Canvas.',
        );
        return null;
      }

      const cleanScene = prepareSceneForExport(scene, prepareOptions);
      return exportToGLBBlob(cleanScene, exportOptions);
    },
    [getScene],
  );

  return {
    exportScene,
    exportSceneToBlob,
    isExporting,
    error,
    lastExport,
  };
}

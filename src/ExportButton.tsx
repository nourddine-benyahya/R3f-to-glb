/**
 * ExportButton - React Three Fiber GLB Export Component
 *
 * A drop-in button component that exports the current R3F scene to GLB format.
 * Must be placed inside a Canvas component. All scene cleanup options are
 * configurable via props.
 *
 * @example
 * <Canvas>
 *   <YourScene />
 *   <ExportButton filename="my-model" />
 * </Canvas>
 *
 * @example
 * <Canvas>
 *   <YourScene />
 *   <ExportButton
 *     filename="my-model"
 *     removeLights={false}
 *     removeCSGChildren={false}
 *     position="bottom-left"
 *   />
 * </Canvas>
 */

import React, { useState, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { exportToGLB } from './export';
import { prepareSceneForExport } from './prepareScene';
import { getSceneStats } from './helpers/sceneStats';
import type { GLBExportOptions, PrepareSceneOptions } from './types';

export interface ExportButtonProps extends PrepareSceneOptions {
  /** Filename without extension. Default: 'scene' */
  filename?: string;
  /** Export options passed to GLTFExporter */
  options?: Omit<GLBExportOptions, 'filename'>;
  /** Custom button styles */
  style?: React.CSSProperties;
  /** Custom class name */
  className?: string;
  /** Show scene stats in console after export. Default: true */
  showStats?: boolean;
  /** Position of the button. Default: 'top-right' */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

/**
 * A button component that exports the current R3F scene to GLB.
 * Must be placed inside a Canvas component.
 *
 * All scene cleanup options from `PrepareSceneOptions` are accepted as props
 * (removeHelpers, removeCameras, removeLights, removeCSGChildren,
 * removeInvisibleMeshes, removeLineObjects, removeWireframeMeshes,
 * assignReadableNames, mergeMeshesInGroups). They all default to `true`.
 */
export const ExportButton: React.FC<ExportButtonProps> = ({
  filename = 'scene',
  options = {},
  removeHelpers = true,
  removeCameras = true,
  removeLights = true,
  removeCSGChildren = true,
  removeInvisibleMeshes = true,
  removeLineObjects = true,
  removeWireframeMeshes = true,
  assignReadableNames = true,
  mergeMeshesInGroups = true,
  style,
  className,
  showStats = true,
  position = 'top-right',
}) => {
  const { scene } = useThree();
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<{ size: number; time: number } | null>(null);

  const handleExport = useCallback(async () => {
    if (isExporting) return;

    setIsExporting(true);
    setError(null);
    setLastExport(null);

    const startTime = performance.now();

    try {
      const cleanScene = prepareSceneForExport(scene, {
        removeHelpers,
        removeCameras,
        removeLights,
        removeCSGChildren,
        removeInvisibleMeshes,
        removeLineObjects,
        removeWireframeMeshes,
        assignReadableNames,
        mergeMeshesInGroups,
      });

      if (showStats) {
        const stats = getSceneStats(cleanScene);
        console.log(`[GLB Export] Scene stats:`, stats);
      }

      await exportToGLB(cleanScene, {
        filename,
        ...options,
        onComplete: (blob) => {
          const elapsed = performance.now() - startTime;
          setLastExport({ size: blob.size, time: elapsed });
          console.log(
            `[GLB Export] Exported ${filename}.glb (${(blob.size / 1024).toFixed(1)} KB) in ${elapsed.toFixed(0)}ms`
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
  }, [
    scene, filename, options,
    removeHelpers, removeCameras, removeLights, removeCSGChildren,
    removeInvisibleMeshes, removeLineObjects, removeWireframeMeshes,
    assignReadableNames, mergeMeshesInGroups, isExporting, showStats,
  ]);

  const positionStyles: Record<string, React.CSSProperties> = {
    'top-left': { top: '20px', left: '20px' },
    'top-right': { top: '20px', right: '20px' },
    'bottom-left': { bottom: '20px', left: '20px' },
    'bottom-right': { bottom: '20px', right: '20px' },
  };

  const buttonStyle: React.CSSProperties = {
    position: 'fixed',
    ...positionStyles[position],
    zIndex: 1000,
    padding: '10px',
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: isExporting ? '#e0e0e0' : '#ffffff',
    color: '#333333',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    cursor: isExporting ? 'wait' : 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    transition: 'all 0.2s ease',
    ...style,
  };

  const errorStyle: React.CSSProperties = {
    position: 'fixed',
    ...positionStyles[position],
    marginTop: '50px',
    background: '#fee2e2',
    color: '#dc2626',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    maxWidth: '250px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  };

  const successStyle: React.CSSProperties = {
    position: 'fixed',
    ...positionStyles[position],
    marginTop: '50px',
    background: '#dcfce7',
    color: '#16a34a',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  };

  return (
    <Html fullscreen style={{ pointerEvents: 'none' }}>
      <div style={{ pointerEvents: 'none', position: 'relative', width: '100%', height: '100%' }}>
        <button
          onClick={handleExport}
          disabled={isExporting}
          style={{ ...buttonStyle, pointerEvents: 'auto' }}
          className={className}
          title={isExporting ? 'Exporting...' : 'Export GLB'}
          onMouseEnter={(e) => {
            if (!isExporting) {
              e.currentTarget.style.background = '#f5f5f5';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isExporting ? '#e0e0e0' : '#ffffff';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {isExporting ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12">
                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
              </circle>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          )}
        </button>

        {error && (
          <div style={{ ...errorStyle, pointerEvents: 'auto' }}>
            {error}
          </div>
        )}

        {lastExport && !error && (
          <div style={{ ...successStyle, pointerEvents: 'none' }}>
            {(lastExport.size / 1024).toFixed(0)} KB
          </div>
        )}
      </div>
    </Html>
  );
};

export default ExportButton;

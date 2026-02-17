/**
 * ExportButton - Universal GLB Export Button
 *
 * A standard React button that exports the current scene to GLB format.
 * Works anywhere in the component tree (inside or outside the Canvas) as long
 * as it is wrapped in a <SceneProvider> and <SceneCapture /> is placed inside
 * the Canvas.
 *
 * No longer depends on @react-three/drei or @react-three/fiber directly.
 */

import React from 'react';
import { useGLBExport, type UseGLBExportOptions } from './useGLBExport';
import type { PrepareSceneOptions } from './types';

export interface ExportButtonProps extends PrepareSceneOptions {
  /** Filename without extension. Default: 'scene' */
  filename?: string;
  /** Custom button styles */
  style?: React.CSSProperties;
  /** Custom class name */
  className?: string;
  /** Show scene stats in console after export. Default: true */
  showStats?: boolean;
  /** Custom button content. Defaults to an SVG download icon / spinner. */
  children?: React.ReactNode;
}

/**
 * A button component that exports the current scene to GLB.
 * Place it **anywhere** in your React tree — it reads the scene from SceneContext.
 *
 * All scene cleanup options from `PrepareSceneOptions` are accepted as props
 * (removeHelpers, removeCameras, removeLights, removeCSGChildren,
 * removeInvisibleMeshes, removeLineObjects, removeWireframeMeshes,
 * assignReadableNames, mergeMeshesInGroups). They all default to `true`.
 *
 * @example
 * <SceneProvider>
 *   <aside>
 *     <ExportButton filename="my-model" />
 *   </aside>
 *   <Canvas>
 *     <SceneCapture />
 *     <YourScene />
 *   </Canvas>
 * </SceneProvider>
 */
export const ExportButton: React.FC<ExportButtonProps> = ({
  filename = 'scene',
  removeHelpers = true,
  removeCameras = true,
  removeLights = true,
  removeCSGChildren = true,
  removeInvisibleMeshes = true,
  removeLineObjects = true,
  removeWireframeMeshes = true,
  assignReadableNames = true,
  mergeMeshesInGroups = true,
  showStats = true,
  style,
  className,
  children,
}) => {
  const { exportScene, isExporting, error, lastExport } = useGLBExport();

  const handleClick = () => {
    const options: UseGLBExportOptions = {
      filename,
      showStats,
      removeHelpers,
      removeCameras,
      removeLights,
      removeCSGChildren,
      removeInvisibleMeshes,
      removeLineObjects,
      removeWireframeMeshes,
      assignReadableNames,
      mergeMeshesInGroups,
    };
    exportScene(options);
  };

  const buttonStyle: React.CSSProperties = {
    padding: '10px',
    width: '40px',
    height: '40px',
    display: 'inline-flex',
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
    background: '#fee2e2',
    color: '#dc2626',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    maxWidth: '250px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    marginTop: '8px',
  };

  const successStyle: React.CSSProperties = {
    background: '#dcfce7',
    color: '#16a34a',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    marginTop: '8px',
  };

  return (
    <div style={{ display: 'inline-block' }}>
      <button
        onClick={handleClick}
        disabled={isExporting}
        style={buttonStyle}
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
        {children || (isExporting ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12">
              <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
            </circle>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        ))}
      </button>

      {error && (
        <div style={errorStyle}>
          {error}
        </div>
      )}

      {lastExport && !error && (
        <div style={successStyle}>
          {(lastExport.size / 1024).toFixed(0)} KB
        </div>
      )}
    </div>
  );
};

export default ExportButton;

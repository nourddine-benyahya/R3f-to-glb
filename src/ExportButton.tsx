/**
 * ExportButton - Unstyled GLB Export Button
 *
 * A plain <button> element with zero built-in styles.
 * You are responsible for all styling (className, style, Tailwind, CSS modules…).
 *
 * Every native HTML button attribute (id, name, className, style, aria-*, data-*,
 * onMouseEnter, onFocus, …) is forwarded directly to the underlying <button>.
 *
 * Works anywhere in the component tree as long as it is wrapped in a
 * <SceneProvider> and <SceneCapture /> is placed inside the Canvas.
 */

import React from 'react';
import { useGLBExport, type UseGLBExportOptions } from './useGLBExport';
import type { PrepareSceneOptions } from './types';

/**
 * All export/cleanup options plus every native <button> attribute.
 * `onClick` is intercepted to trigger the export; a user-supplied `onClick`
 * prop is called first so you can still react to the click event.
 */
export interface ExportButtonProps
  extends PrepareSceneOptions,
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  /** Filename without extension. Default: 'scene' */
  filename?: string;
  /** Log scene stats (vertices, triangles…) to the console. Default: true */
  showStats?: boolean;
  /** Called when the button is clicked (before export starts) */
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

/**
 * A completely unstyled <button> that exports the current R3F scene to GLB.
 *
 * - Place it **anywhere** in your React tree.
 * - Style it with `className`, `style`, Tailwind, CSS modules — whatever you prefer.
 * - Every standard button attribute (id, name, aria-*, data-*, ref, …) is passed through.
 * - The button is automatically `disabled` while an export is in progress.
 *
 * @example
 * // Tailwind
 * <ExportButton filename="my-model" className="px-4 py-2 bg-blue-500 text-white rounded">
 *   Export GLB
 * </ExportButton>
 *
 * @example
 * // Plain style
 * <ExportButton filename="my-model" style={{ background: 'navy', color: '#fff' }}>
 *   Download
 * </ExportButton>
 */
export const ExportButton: React.FC<ExportButtonProps> = ({
  // export / cleanup options
  filename = 'scene',
  showStats = true,
  removeHelpers = true,
  removeCameras = true,
  removeLights = true,
  removeCSGChildren = true,
  removeInvisibleMeshes = true,
  removeLineObjects = true,
  removeWireframeMeshes = true,
  assignReadableNames = true,
  mergeMeshesInGroups = true,
  removeEmptyGroups = true,
  deduplicateMaterials = true,
  // button attributes
  onClick,
  disabled,
  children,
  ...buttonProps          // everything else (id, name, className, style, aria-*, data-*, …)
}) => {
  const { exportScene, isExporting } = useGLBExport();

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    onClick?.(e);

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
      removeEmptyGroups,
      deduplicateMaterials,
    };
    exportScene(options);
  };

  return (
    <button
      {...buttonProps}
      onClick={handleClick}
      disabled={disabled ?? isExporting}
    >
      {children}
    </button>
  );
};

export default ExportButton;

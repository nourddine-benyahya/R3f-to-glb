import React, { createContext, useContext, useRef, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface SceneContextType {
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
  getScene: () => THREE.Scene | null;
}

const SceneContext = createContext<SceneContextType | undefined>(undefined);

/**
 * Provides scene access to all child components via React Context.
 * Wrap your app (around Canvas) with this provider to enable
 * scene export from anywhere, including outside the Canvas.
 *
 * @example
 * // <SceneProvider>
 * //   <Canvas>
 * //     <SceneCapture />
 * //     <YourScene />
 * //   </Canvas>
 * //   <DownloadButton />  // can access scene here
 * // </SceneProvider>
 *
 * @param sceneRef - Optional external ref. When provided, the provider uses
 *   this ref instead of creating its own, letting you bridge a scene you
 *   created elsewhere.
 */
export const SceneProvider: React.FC<{
  children: React.ReactNode;
  sceneRef?: React.MutableRefObject<THREE.Scene | null>;
}> = ({ children, sceneRef: externalRef }) => {
  const internalRef = useRef<THREE.Scene | null>(null);
  const actualRef = externalRef || internalRef;

  const getScene = useCallback(() => actualRef.current, [actualRef]);

  return (
    <SceneContext.Provider value={{ sceneRef: actualRef, getScene }}>
      {children}
    </SceneContext.Provider>
  );
};

/**
 * Hook to access the scene ref from any component inside a SceneProvider.
 * Returns `{ sceneRef, getScene }`.
 */
export const useScene = (): SceneContextType => {
  const context = useContext(SceneContext);
  if (!context) {
    throw new Error(
      'useScene must be used within a SceneProvider. ' +
      'Wrap your app with <SceneProvider> around the <Canvas>.',
    );
  }
  return context;
};

/**
 * Place inside your Canvas to capture the scene reference into the
 * SceneContext. This renders nothing — it only bridges the R3F scene
 * to the SceneProvider.
 *
 * @example
 * // <SceneProvider>
 * //   <Canvas>
 * //     <SceneCapture />
 * //     <YourScene />
 * //   </Canvas>
 * // </SceneProvider>
 */
export const SceneCapture: React.FC = () => {
  const { scene } = useThree();
  const { sceneRef } = useScene();

  React.useEffect(() => {
    sceneRef.current = scene;
    // Cleanup: clear the ref when Canvas unmounts to avoid
    // exporting a stale/disposed scene on route changes.
    return () => {
      sceneRef.current = null;
    };
  }, [scene, sceneRef]);

  return null;
};

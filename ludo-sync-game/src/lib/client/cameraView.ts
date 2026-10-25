/** The "reset camera" button lives in the screen's controls but the camera lives in the 3D scene, so they meet here. */
const listeners = new Set<() => void>();
export const resetCameraView = () => listeners.forEach(l => l());
export const onCameraReset = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

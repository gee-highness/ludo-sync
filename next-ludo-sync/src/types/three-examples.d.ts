// src/types/three-examples.d.ts

declare module "three/examples/jsm/loaders/GLTFLoader" {
    import type { Loader } from "three";
    import { EventDispatcher } from "three";
    import { LoadingManager } from "three";

    export class GLTFLoader extends EventDispatcher {
        constructor(manager?: LoadingManager);
        manager: LoadingManager;
        load(
            url: string,
            onLoad: (gltf: { scene: THREE.Object3D; animations: any[]; parser: any }) => void,
            onProgress?: (event: ProgressEvent<EventTarget>) => void,
            onError?: (event: ErrorEvent) => void
        ): void;
        parse(
            data: ArrayBuffer | string,
            path: string,
            onLoad: (gltf: { scene: THREE.Object3D; animations: any[]; parser: any }) => void,
            onError?: (event: ErrorEvent) => void
        ): void;
    }
}

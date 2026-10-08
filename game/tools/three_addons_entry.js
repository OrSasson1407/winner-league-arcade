// The three.js add-ons the 3D views use, bundled by `npm run vendor:three` into game/vendor/three-addons.min.js
// (it imports three itself from ./three.min.js, so the core isn't downloaded twice).
export { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
export { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
export { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
export { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
export { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
export { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
export { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
export { Reflector } from "three/examples/jsm/objects/Reflector.js";

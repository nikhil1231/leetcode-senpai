// Copies the voice-activity detector's worklet, model and ONNX runtime wasm from node_modules into public/vad/, where
// the browser loads them (src/lib/listen.ts). Run before dev and build; the folder is gitignored.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vad = join(root, "node_modules/@ricky0123/vad-web/dist");
const ort = join(root, "node_modules/onnxruntime-web/dist");
const out = join(root, "public/vad");
const files = [
  [vad, "vad.worklet.bundle.min.js"], [vad, "silero_vad_v5.onnx"],
  [ort, "ort-wasm-simd-threaded.mjs"], [ort, "ort-wasm-simd-threaded.wasm"],
];
if (!existsSync(vad) || !existsSync(ort)) { console.warn("copy-vad: @ricky0123/vad-web isn't installed; skipping."); process.exit(0); }
mkdirSync(out, { recursive: true });
for (const [dir, name] of files) copyFileSync(join(dir, name), join(out, name));

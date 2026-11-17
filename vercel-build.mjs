import { execSync } from "child_process";
import { mkdirSync, cpSync, existsSync } from "fs";

console.log("=== Vercel Build Start ===");
console.log("CWD:", process.cwd());

execSync("pnpm --filter @workspace/elt-analyzer run build", {
  stdio: "inherit",
  env: { ...process.env, PORT: "3000", BASE_PATH: "/" },
});

const srcDir = "artifacts/elt-analyzer/dist/public";
const dstDir = "dist/public";

console.log(`Source exists (${srcDir}):`, existsSync(srcDir));

mkdirSync(dstDir, { recursive: true });
cpSync(srcDir, dstDir, { recursive: true });

console.log(`✓ Output copied to ${dstDir}/`);

import { mkdir } from "fs/promises"
import PackageJson from "../package.json" with { type: "json" }

async function main() {
  console.log("Create dst/ directory")
  await mkdir("dst", { recursive: true })

  console.log("Read package.json")
  const mainFile = PackageJson["main"]
    ?? PackageJson.exports["./"]
    ?? "./src/index.ts"

  const result = await Bun.build({
    entrypoints: [mainFile],
    outdir: "./dst",
    target: "node",
    naming: "main.js",
    banner: `#!/usr/bin/env node`,
  })

  if (result.success) {
    console.log("✓ Built main file to dst/main.js")
  } else {
    console.error("✗ Build failed:", result.logs)
    process.exit(1)
  }

  console.log("\n🎉 Build completed successfully!")
}

if (import.meta.main) {
  main()
}

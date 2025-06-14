import fs from "fs"
import { mkdir, readFile, writeFile } from "fs/promises"
import git from "isomorphic-git"

// Generate suffix sequence: a, b, c, ..., z, aa, ab, ac, ...
function generateSuffix(index: number): string {
  let result = ""
  let num = index

  do {
    result = String.fromCharCode(97 + (num % 26)) + result // 97 is 'a'
    num = Math.floor(num / 26) - 1
  } while (num >= 0)

  return result
}

async function createGitTag(version: string) {
  console.log("Create git tag")

  const baseTag = `v${version}-dst`
  let tagName = baseTag
  let suffixIndex = 0

  // Check if tag already exists and find next available suffix
  while (true) {
    try {
      await git.resolveRef({ fs, dir: ".", ref: `refs/tags/${tagName}` })
      // Tag exists, try next suffix
      const suffix = generateSuffix(suffixIndex)
      tagName = `v${version}${suffix}-dst`
      suffixIndex++
    } catch (error) {
      // Tag doesn't exist, we can use this one
      break
    }
  }

  // Create the tag
  await git.tag({
    fs,
    dir: ".",
    ref: tagName,
    object: await git.resolveRef({ fs, dir: ".", ref: "HEAD" }),
  })

  console.log(`✓ Created git tag: ${tagName}`)

  return tagName
}

async function main() {
  console.log("Create dst/ directory")
  await mkdir("dst", { recursive: true })

  console.log("Read package.json")
  const packageJsonContent = await readFile("package.json", "utf-8")
  const packageJson = JSON.parse(packageJsonContent)
  const mainFile = packageJson.main || "./src/index.ts"

  console.log("Build")
  const result = await Bun.build({
    entrypoints: [mainFile],
    outdir: "./dst",
    target: "node",
    naming: "main.js",
  })

  if (result.success) {
    console.log("✓ Built main file to dst/main.js")
  } else {
    console.error("✗ Build failed:", result.logs)
    process.exit(1)
  }

  console.log("Update package.json")
  const originalDependencies = packageJson.dependencies || {}
  const originalDevDependencies = packageJson.devDependencies || {}

  // Move all dependencies to devDependencies
  const newDevDependencies = {
    ...originalDevDependencies,
    ...originalDependencies,
  }

  // Update package.json
  const updatedPackageJson = {
    ...packageJson,
    dependencies: {},
    devDependencies: newDevDependencies,
    bin: "./dst/main.js",
  }

  // Write updated package.json
  await writeFile("package.json", JSON.stringify(updatedPackageJson, null, 2))
  console.log(
    "✓ Updated package.json - moved dependencies to devDependencies and added bin property",
  )

  // Create git tag
  await createGitTag(packageJson.version)

  console.log("\n🎉 Build completed successfully!")
}

if (import.meta.main) {
  main()
}

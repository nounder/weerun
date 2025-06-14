import fs from "fs"
import { mkdir, readFile, writeFile } from "fs/promises"

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

async function checkForUncommittedChanges(): Promise<boolean> {
  console.log("Checking for uncommitted changes...")

  try {
    const result = await Bun.$`git status --porcelain`.text()
    const changedFiles = result.trim().split("\n").filter(line =>
      line.trim() !== ""
    )

    if (changedFiles.length > 0) {
      console.error("✗ Found uncommitted changes:")
      for (const line of changedFiles) {
        const status = line.substring(0, 2)
        const filepath = line.substring(3)
        let statusText = ""

        if (status === " M") statusText = "modified (not staged)"
        else if (status === "M ") statusText = "staged"
        else if (status === "MM") statusText = "modified (staged and unstaged)"
        else if (status === "??") statusText = "untracked"
        else if (status === "A ") statusText = "added"
        else if (status === "D ") statusText = "deleted"
        else statusText = status.trim()

        console.error(`  ${filepath} - ${statusText}`)
      }
      return true
    }

    console.log("✓ No uncommitted changes found")
    return false
  } catch (error) {
    console.error("Error checking git status:", error)
    return true
  }
}

async function createGitTag(version: string) {
  console.log("Create git tag")

  const baseTag = `v${version}`
  let tagName = baseTag
  let suffixIndex = 0

  // Check if tag already exists and find next available suffix
  while (true) {
    try {
      await Bun.$`git rev-parse --verify refs/tags/${tagName}`.quiet()
      // Tag exists, try next suffix
      const suffix = generateSuffix(suffixIndex)
      tagName = `v${version}${suffix}`
      suffixIndex++
    } catch (error) {
      // Tag doesn't exist, we can use this one
      break
    }
  }

  return tagName
}

async function commitAndTag(tagName: string) {
  console.log("Adding updated files to git...")

  // Add package.json and dst/ directory
  await Bun.$`git add package.json dst/`

  console.log("✓ Added updated files")

  console.log("Creating commit...")
  await Bun.$`git commit -m ${tagName}`

  console.log(`✓ Created commit with message: ${tagName}`)

  // Create the tag on the new commit
  await Bun.$`git tag ${tagName}`

  console.log(`✓ Created git tag: ${tagName}`)

  // Reset the main branch to before the build commit, but keep the tag
  console.log("Resetting main branch to exclude build commit...")
  await Bun.$`git reset --hard HEAD~1`

  console.log("✓ Reset main branch - build commit preserved in tag only")
}

async function main() {
  // Check for uncommitted changes before starting
  const hasChanges = await checkForUncommittedChanges()
  if (hasChanges) {
    console.error(
      "✗ Aborting build due to uncommitted changes. Please commit or stash your changes first.",
    )
    process.exit(1)
  }

  console.log("Create dst/ directory")
  await mkdir("dst", { recursive: true })

  console.log("Read package.json")
  const packageJsonContent = await readFile("package.json", "utf-8")
  const packageJson = JSON.parse(packageJsonContent)
  const mainFile = packageJson.main || "./src/index.ts"

  // Determine tag name before building
  const tagName = await createGitTag(packageJson.version)

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

  // Commit updated files and create tag
  await commitAndTag(tagName)

  console.log("\n🎉 Build completed successfully!")
}

if (import.meta.main) {
  main()
}

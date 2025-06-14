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

async function checkForUncommittedChanges(): Promise<boolean> {
  console.log("Checking for uncommitted changes...")

  const status = await git.statusMatrix({ fs, dir: "." })
  const changedFiles = status.filter(([, head, workdir, stage]) => {
    // File has changes if:
    // - workdir !== head (working directory differs from HEAD)
    // - stage !== head (staged changes differ from HEAD)
    return workdir !== head || stage !== head
  })

  if (changedFiles.length > 0) {
    console.error("✗ Found uncommitted changes:")
    for (const [filepath, head, workdir, stage] of changedFiles) {
      let statusText = ""
      if (workdir !== head && stage === head) {
        statusText = "modified (not staged)"
      } else if (stage !== head && workdir === stage) {
        statusText = "staged"
      } else if (workdir !== head && stage !== head) {
        statusText = "modified (staged and unstaged)"
      } else if (head === 0) {
        statusText = "untracked"
      }
      console.error(`  ${filepath} - ${statusText}`)
    }
    return true
  }

  console.log("✓ No uncommitted changes found")
  return false
}

async function createGitTag(version: string) {
  console.log("Create git tag")

  const baseTag = `v${version}`
  let tagName = baseTag
  let suffixIndex = 0

  // Check if tag already exists and find next available suffix
  while (true) {
    try {
      await git.resolveRef({ fs, dir: ".", ref: `refs/tags/${tagName}` })
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
  await git.add({ fs, dir: ".", filepath: "package.json" })
  await git.add({ fs, dir: ".", filepath: "dst" })

  console.log("✓ Added updated files")

  console.log("Creating commit...")
  const commitSha = await git.commit({
    fs,
    dir: ".",
    message: tagName,
    author: {
      name: "Build Script",
      email: "build@weerun.dev",
    },
  })

  console.log(`✓ Created commit: ${commitSha}`)

  // Create the tag on the new commit
  await git.tag({
    fs,
    dir: ".",
    ref: tagName,
    object: commitSha,
  })

  console.log(`✓ Created git tag: ${tagName}`)
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

  // Commit updated files and create tag
  await commitAndTag(tagName)

  console.log("\n🎉 Build completed successfully!")
}

if (import.meta.main) {
  main()
}

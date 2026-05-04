const path = require("path");
const fs = require("fs/promises");

/**
 * Inspect project root and return human-readable stack hints + build preset ids
 * (preset ids resolved in buildPresets.js).
 */
async function analyzeProjectRoot(projectRoot) {
  const names = await fs.readdir(projectRoot);
  const stacks = new Set();
  /** @type {{ id: string; label: string; group: string }[]} */
  const presets = [];

  const has = (n) => names.includes(n);
  const csproj = names.find((n) => n.endsWith(".csproj"));
  const fsproj = names.find((n) => n.endsWith(".fsproj"));
  const sln = names.find((n) => n.endsWith(".sln"));

  if (csproj || fsproj || sln) {
    stacks.add("dotnet");
    presets.push(
      { id: "dotnet-restore", label: ".NET · restore packages", group: "dotnet" },
      { id: "dotnet-build", label: ".NET · build (Release)", group: "dotnet" },
      { id: "dotnet-run", label: ".NET · run (Release)", group: "dotnet" },
      { id: "dotnet-test", label: ".NET · test", group: "dotnet" }
    );
    if (sln && process.platform === "win32") {
      presets.push({
        id: "msbuild-sln",
        label: "MSBuild · solution (Release)",
        group: "dotnet",
      });
    }
  }

  if (has("CMakeLists.txt")) {
    stacks.add("cmake");
    stacks.add("cpp");
    presets.push(
      { id: "cmake-configure", label: "CMake · configure (./build)", group: "cmake" },
      { id: "cmake-build", label: "CMake · build (Release)", group: "cmake" }
    );
  }

  if (has("Makefile") && !has("CMakeLists.txt")) {
    stacks.add("make");
    presets.push({
      id: "make-build",
      label: "Make · make (default target)",
      group: "make",
    });
  }

  if (has("Cargo.toml")) {
    stacks.add("rust");
    presets.push(
      { id: "cargo-build", label: "Rust · cargo build --release", group: "rust" },
      { id: "cargo-run", label: "Rust · cargo run --release", group: "rust" }
    );
  }

  if (has("go.mod")) {
    stacks.add("go");
    presets.push(
      { id: "go-build", label: "Go · build ./...", group: "go" },
      { id: "go-test", label: "Go · test ./...", group: "go" }
    );
  }

  if (has("package.json")) {
    stacks.add("node");
    try {
      const raw = await fs.readFile(
        path.join(projectRoot, "package.json"),
        "utf8"
      );
      const pj = JSON.parse(raw);
      const scripts = pj.scripts || {};
      presets.push({
        id: "npm-install",
        label: "npm · install",
        group: "node",
      });
      if (typeof scripts.build === "string") {
        presets.push({
          id: "npm-build",
          label: "npm · run build",
          group: "node",
        });
      }
      if (typeof scripts.dev === "string") {
        presets.push({
          id: "npm-dev",
          label: "npm · run dev",
          group: "node",
        });
      }
      const deps = { ...pj.dependencies, ...pj.devDependencies };
      if (deps.typescript) {
        presets.push({
          id: "tsc",
          label: "TypeScript · tsc (local)",
          group: "node",
        });
      }
    } catch {
      presets.push({ id: "npm-install", label: "npm · install", group: "node" });
    }
  }

  if (has("main.py")) {
    stacks.add("python");
    presets.push({
      id: "python-main",
      label: "Python · main.py",
      group: "python",
    });
  }

  const stackArr = Array.from(stacks);
  let summary = "Generic / mixed";
  if (stackArr.includes("dotnet") && stackArr.includes("cmake")) {
    summary = ".NET + CMake (mixed)";
  } else if (stackArr.includes("dotnet")) {
    summary = ".NET / C#";
  } else if (stackArr.includes("cmake")) {
    summary = "C++ / CMake";
  } else if (stackArr.includes("rust")) {
    summary = "Rust";
  } else if (stackArr.includes("node")) {
    summary = "Node / JavaScript";
  } else if (stackArr.includes("go")) {
    summary = "Go";
  } else if (stackArr.includes("python")) {
    summary = "Python";
  } else if (stackArr.includes("make")) {
    summary = "Makefile";
  }

  return {
    stacks: stackArr,
    summary,
    presets,
  };
}

module.exports = { analyzeProjectRoot };

const path = require("path");
const fs = require("fs/promises");
const { discoverDotnet } = require("./dotnetDiscover");

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

  const d = await discoverDotnet(projectRoot);
  const enc = (rel) => encodeURIComponent(rel);
  const MAX_SLN = 6;
  const MAX_PROJ = 10;

  if (d.slns.length > 0 || d.csprojs.length > 0 || d.fsprojs.length > 0) {
    stacks.add("dotnet");
    if (d.slns.length > 0) {
      for (const sln of d.slns.slice(0, MAX_SLN)) {
        const base = path.basename(sln);
        const q = enc(sln);
        presets.push(
          {
            id: `dotnet-restore@${q}`,
            label: `.NET · restore (${base})`,
            group: "dotnet",
          },
          {
            id: `dotnet-build@${q}`,
            label: `.NET · build (${base}) — all frameworks`,
            group: "dotnet",
          },
          {
            id: `dotnet-test@${q}`,
            label: `.NET · test (${base})`,
            group: "dotnet",
          },
          {
            id: `dotnet-run@${q}`,
            label: `.NET · run startup (${base})`,
            group: "dotnet",
          }
        );
        if (process.platform === "win32") {
          presets.push({
            id: `msbuild-sln@${q}`,
            label: `MSBuild · ${base} (Release)`,
            group: "dotnet",
          });
        }
      }
    } else {
      const projs = [...d.csprojs, ...d.fsprojs].slice(0, MAX_PROJ);
      for (const proj of projs) {
        const base = path.basename(proj);
        const q = enc(proj);
        presets.push(
          {
            id: `dotnet-restore@${q}`,
            label: `.NET · restore (${base})`,
            group: "dotnet",
          },
          {
            id: `dotnet-build@${q}`,
            label: `.NET · build (${base}) — all frameworks`,
            group: "dotnet",
          },
          {
            id: `dotnet-test@${q}`,
            label: `.NET · test (${base})`,
            group: "dotnet",
          }
        );
        if (projs.length === 1) {
          presets.push({
            id: `dotnet-run@${q}`,
            label: `.NET · run (${base})`,
            group: "dotnet",
          });
        }
      }
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
    const nSln = d.slns.length;
    const nProj = d.csprojs.length + d.fsprojs.length;
    if (nSln > 1) {
      summary = `.NET / C# (${nSln} solutions)`;
    } else if (nSln === 1 && nProj > 1) {
      summary = ".NET / C# (solution workspace)";
    } else {
      summary = ".NET / C#";
    }
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

/** @type {{ id: string; label: string; desc: string; badge: string; stack: string }[]} */
const TEMPLATE_CATALOG = [
  {
    id: "cpp-cmake",
    label: "C++ · CMake",
    desc: "CMake + C++17 console app",
    badge: "C++",
    stack: "cpp",
  },
  {
    id: "cpp-console",
    label: "C++ · Single file",
    desc: "One main.cpp, no build system",
    badge: "C++",
    stack: "cpp",
  },
  {
    id: "csharp-console",
    label: "C# · Console",
    desc: ".NET 8 executable",
    badge: ".NET",
    stack: "dotnet",
  },
  {
    id: "csharp-library",
    label: "C# · Class library",
    desc: ".NET 8 DLL project",
    badge: ".NET",
    stack: "dotnet",
  },
  {
    id: "bepinex-mod",
    label: "C# · BepInEx plugin",
    desc: "Starter BepInEx 5 plugin (Harmony via NuGet)",
    badge: "Unity",
    stack: "dotnet",
  },
  {
    id: "dotnet-webapi",
    label: ".NET · Web API",
    desc: "Minimal ASP.NET Core 8 API",
    badge: ".NET",
    stack: "dotnet",
  },
  {
    id: "typescript-node",
    label: "TypeScript · Node",
    desc: "ESM + tsc layout",
    badge: "Web",
    stack: "web",
  },
  {
    id: "python-app",
    label: "Python",
    desc: "Simple script entrypoint",
    badge: "Python",
    stack: "python",
  },
  {
    id: "rust-console",
    label: "Rust · Binary",
    desc: "cargo new–style layout",
    badge: "Rust",
    stack: "rust",
  },
];

/**
 * Scaffold files for "New project" — paths use forward slashes; main joins for OS.
 * @param {string} projectName — used in namespaces / package name where safe
 */
function getTemplateFiles(templateId, projectName) {
  const safe = projectName.replace(/[^a-zA-Z0-9_-]/g, "") || "App";
  const rootNs = safe.replace(/-/g, "_");

  const templates = {
    "cpp-cmake": {
      "CMakeLists.txt": `cmake_minimum_required(VERSION 3.16)
project(${safe} LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
add_executable(\${PROJECT_NAME} src/main.cpp)
`,
      "src/main.cpp": `#include <iostream>

int main() {
    std::cout << "Hello from ${safe}!\\n";
    return 0;
}
`,
      "README.md": `# ${safe}

C++ project (CMake).

## Build

\`\`\`bash
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
\`\`\`

Windows (Visual Studio generator):

\`\`\`powershell
cmake -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release
\`\`\`
`,
    },

    "cpp-console": {
      "main.cpp": `#include <iostream>

int main() {
    std::cout << "Hello from ${safe}!\\n";
    return 0;
}
`,
      "README.md": `# ${safe}

Single-file C++. Compile with your compiler, e.g.:

\`\`\`bash
g++ -std=c++17 -O2 -o app main.cpp && ./app
\`\`\`
`,
    },

    "csharp-console": {
      [`${safe}.csproj`]: `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <RootNamespace>${rootNs}</RootNamespace>
  </PropertyGroup>
</Project>
`,
      "Program.cs": `Console.WriteLine("Hello from ${safe}!");
`,
      "README.md": `# ${safe}

.NET 8 console app.

\`\`\`bash
dotnet run
\`\`\`
`,
    },

    "csharp-library": {
      [`${safe}.csproj`]: `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <RootNamespace>${rootNs}</RootNamespace>
  </PropertyGroup>
</Project>
`,
      "Class1.cs": `namespace ${rootNs};

public class Class1
{
    public string Greet() => "Hello from ${safe}";
}
`,
      "README.md": `# ${safe}

.NET 8 class library.

\`\`\`bash
dotnet build
\`\`\`
`,
    },

    "bepinex-mod": {
      [`${safe}.csproj`]: `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netstandard2.1</TargetFramework>
    <LangVersion>latest</LangVersion>
    <Nullable>enable</Nullable>
    <RootNamespace>${rootNs}</RootNamespace>
    <Description>BepInEx plugin — add Unity / game assembly references for your target game.</Description>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="BepInEx.Analyzers" Version="1.0.8" PrivateAssets="all" />
    <PackageReference Include="BepInEx.Core" Version="5.4.22" />
    <PackageReference Include="HarmonyX" Version="2.10.2" />
  </ItemGroup>
</Project>
`,
      "Plugin.cs": `using BepInEx;

namespace ${rootNs};

[BepInPlugin("com.${rootNs.toLowerCase()}.plugin", "${safe}", "1.0.0")]
public class Plugin : BaseUnityPlugin
{
    private void Awake()
    {
        Logger.LogInfo("Plugin ${safe} is loaded!");
        // Use HarmonyX from NuGet (already referenced) or add more packages in Encryptic → NuGet tab.
    }
}
`,
      "README.md": `# ${safe} (BepInEx plugin)

Starter layout for a **BepInEx 5** style plugin using packages from NuGet.

## Build

\`\`\`bash
dotnet restore
dotnet build
\`\`\`

## Dependencies in Encryptic

1. **NuGet tab** (workspace dock): search and install packages (e.g. more Harmony helpers, analyzers).
2. **Game / Unity assemblies**: copy managed DLLs from your game (or Unity) into a folder such as \`libs/\`, then add \`<Reference Include="...">\` items in the \`.csproj\` pointing at those paths — BepInEx cannot ship the game engine for you.

Output DLL goes to \`bin/Debug/netstandard2.1/\` (or Release). Copy that into your game's \`BepInEx/plugins/\` folder when testing.
`,
    },

    "dotnet-webapi": {
      [`${safe}.csproj`]: `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <RootNamespace>${rootNs}</RootNamespace>
  </PropertyGroup>
</Project>
`,
      "Program.cs": `var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/", () => Results.Json(new { message = "Hello from ${safe}", ok = true }));
app.MapGet("/health", () => Results.Ok("healthy"));

app.Run();
`,
      "appsettings.json": `{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*"
}
`,
      "README.md": `# ${safe}

Minimal ASP.NET Core 8 API.

\`\`\`bash
dotnet run
\`\`\`

Then open http://localhost:5000 or the URL printed in the terminal.
`,
    },

    "typescript-node": {
      "package.json": JSON.stringify(
        {
          name: safe.toLowerCase().replace(/_/g, "-"),
          version: "1.0.0",
          private: true,
          type: "module",
          scripts: {
            dev: "node --watch src/index.ts",
            build: "tsc",
            start: "node dist/index.js",
          },
          devDependencies: {
            typescript: "^5.6.0",
            "@types/node": "^22.0.0",
          },
        },
        null,
        2
      ),
      "tsconfig.json": JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            outDir: "dist",
            rootDir: "src",
            strict: true,
            skipLibCheck: true,
          },
          include: ["src/**/*"],
        },
        null,
        2
      ),
      "src/index.ts": `console.log("Hello from ${safe}!");

export {};
`,
      "README.md": `# ${safe}

TypeScript on Node.

\`\`\`bash
npm install
npm run build && npm start
\`\`\`
`,
    },

    "python-app": {
      "main.py": `def main() -> None:
    print("Hello from ${safe}!")


if __name__ == "__main__":
    main()
`,
      "requirements.txt": "# Add dependencies here\n",
      "README.md": `# ${safe}

\`\`\`bash
python -m venv .venv
.venv\\Scripts\\activate   # Windows
pip install -r requirements.txt
python main.py
\`\`\`
`,
    },

    "rust-console": {
      "Cargo.toml": `[package]
name = "${safe.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}"
version = "0.1.0"
edition = "2021"

[dependencies]
`,
      "src/main.rs": `fn main() {
    println!("Hello from ${safe}!");
}
`,
      "README.md": `# ${safe}

\`\`\`bash
cargo run
\`\`\`
`,
    },
  };

  const files = templates[templateId];
  if (!files) return null;
  return files;
}

module.exports = { getTemplateFiles, TEMPLATE_CATALOG };

/**
 * CI: rewrite repository / homepage / bugs in package.json from GITHUB_REPOSITORY (owner/name).
 * Usage: node scripts/patch-github-repo.cjs owner/repo
 */
const fs = require("fs");
const path = require("path");

const repo = process.argv[2];
if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
  console.error("patch-github-repo: pass owner/repo");
  process.exit(1);
}
const pkgPath = path.join(__dirname, "..", "package.json");
const j = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
j.repository = { type: "git", url: `https://github.com/${repo}.git` };
j.homepage = `https://github.com/${repo}#readme`;
j.bugs = { url: `https://github.com/${repo}/issues` };
fs.writeFileSync(pkgPath, JSON.stringify(j, null, 2) + "\n", "utf8");
console.log("patch-github-repo:", repo);

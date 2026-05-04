import React, { useState } from "react";
import type { TreeNode } from "./types";

type Props = {
  nodes: TreeNode[];
  depth?: number;
  activePath: string | null;
  onOpenFile: (path: string) => void;
};

export function FileTree({
  nodes,
  depth = 0,
  activePath,
  onOpenFile,
}: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <>
      {nodes.map((n) => (
        <div key={n.path}>
          {n.kind === "dir" ? (
            <>
              <div
                className="tree-row"
                style={{ "--depth": depth } as React.CSSProperties}
                onClick={() =>
                  setOpen((s) => ({ ...s, [n.path]: !s[n.path] }))
                }
              >
                <span className="tree-chev">{open[n.path] ? "▼" : "▶"}</span>
                <span>{n.name}</span>
              </div>
              {open[n.path] && n.children && (
                <FileTree
                  nodes={n.children}
                  depth={depth + 1}
                  activePath={activePath}
                  onOpenFile={onOpenFile}
                />
              )}
            </>
          ) : (
            <div
              className={`tree-row file ${activePath === n.path ? "active" : ""}`}
              style={{ "--depth": depth } as React.CSSProperties}
              onClick={() => onOpenFile(n.path)}
            >
              <span className="tree-chev" />
              <span>{n.name}</span>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

import React from "react";
import { HUB_KNOWN_ISSUES, HUB_PLANNED } from "./hubRoadmapData";

export function HubRoadmapTab() {
  return (
    <div className="hub-roadmap">
      <p className="hub-roadmap-lead">
        Your running list of what is coming next and what people might run into. Edit{" "}
        <code>src/renderer/hubRoadmapData.ts</code> in the repo to change this tab.
      </p>

      <section className="hub-roadmap-section" aria-labelledby="hub-planned-heading">
        <h2 id="hub-planned-heading" className="hub-roadmap-heading">
          To-do
        </h2>
        <p className="hub-roadmap-sub">Things you intend to add or improve next.</p>
        <ul className="hub-roadmap-list">
          {HUB_PLANNED.map((row) => (
            <li key={row.id}>{row.text}</li>
          ))}
        </ul>
      </section>

      <section className="hub-roadmap-section" aria-labelledby="hub-issues-heading">
        <h2 id="hub-issues-heading" className="hub-roadmap-heading hub-roadmap-heading-warn">
          Known bugs and caveats
        </h2>
        <p className="hub-roadmap-sub">Limitations users may hit — keep this list accurate as things change.</p>
        <ul className="hub-roadmap-list hub-roadmap-list-warn">
          {HUB_KNOWN_ISSUES.map((row) => (
            <li key={row.id}>{row.text}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

"use client";
import { Fragment } from "react";
import { useHeading } from "@/lib/heading";
import { GROUPS, REFRAMES, SWAPS } from "./principles";

// System Design › Principles: the hard-guarantee swaps first, then seventeen heuristics in four groups, then the
// habit of reshaping a problem before choosing a tool. Static reading page; numbers link within the page.

const ref = (n: number) => <a key={n} className="sdp-ref" href={`#p-${n}`} aria-label={`Principle ${n}`}>{n}</a>;

export function PrinciplesPage() {
  useHeading("Principles", "System Design");
  return (
    <div className="sdp">
      <div className="sd-page-intro">
        <span className="sd-eyebrow">PRINCIPLES</span>
        <h2 id="sd-heading" tabIndex={-1}>Seventeen heuristics for designing systems</h2>
        <p>Rules of thumb that hold across most designs, from a payment flow to a social feed. Each one comes with an example
          and a question to ask of your own design.</p>
      </div>

      <section className="sdp-big" aria-labelledby="sdp-big-h">
        <span className="sd-eyebrow">THE BIGGER PICTURE</span>
        <h3 id="sdp-big-h">Swap hard guarantees for simpler ones that still meet the requirements</h3>
        <p>Much of system design is noticing that a guarantee is expensive to provide and finding a weaker one the business
          can live with. The system doesn't get stronger. It stops paying for guarantees nobody needed.</p>
        <div className="sdp-table-wrap">
          <table className="sdp-table">
            <thead><tr><th scope="col">Hard to guarantee</th><th aria-hidden="true" /><th scope="col">Usually enough</th><th scope="col">See</th></tr></thead>
            <tbody>
              {SWAPS.map((s) => (
                <tr key={s.hard}>
                  <td className="sdp-hard">{s.hard}</td>
                  <td className="sdp-arrow" aria-hidden="true">→</td>
                  <td className="sdp-easy">{s.easier}</td>
                  <td className="sdp-refs">{s.refs.map(ref)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <nav className="sdp-jump" aria-label="Principle groups">
        {GROUPS.map((g) => (
          <a key={g.id} href={`#g-${g.id}`}><b>{g.name}</b><span>{g.items[0].n}–{g.items[g.items.length - 1].n}</span></a>
        ))}
      </nav>

      {GROUPS.map((g, gi) => (
        <section key={g.id} id={`g-${g.id}`} className="sdp-group" aria-labelledby={`g-${g.id}-h`}>
          <header className="sdp-group-head">
            <span className="sdp-group-n">0{gi + 1}</span>
            <div><h3 id={`g-${g.id}-h`}>{g.name}</h3><p>{g.blurb}</p></div>
          </header>
          <div className="sdp-grid">
            {g.items.map((p) => (
              <article key={p.n} id={`p-${p.n}`} className="sdp-card">
                <div className="sdp-card-top"><span className="sdp-num">{String(p.n).padStart(2, "0")}</span><h4>{p.title}</h4></div>
                <p className="sdp-body">{p.body}</p>
                <div className="sdp-example"><span>Example</span><p>{p.example}</p></div>
                <p className="sdp-ask"><span>Ask</span>{p.ask}</p>
              </article>
            ))}
          </div>
        </section>
      ))}

      <section className="sdp-reframe" aria-labelledby="sdp-reframe-h">
        <span className="sd-eyebrow">BEFORE CHOOSING A TOOL</span>
        <h3 id="sdp-reframe-h">Change the problem so the hard part isn't needed</h3>
        <p>When a requirement looks hard to meet, check whether the problem can be reshaped first. It tends to give a simpler
          and more robust design than starting from a technology, and in an interview it shows the reasoning behind the design.</p>
        <dl className="sdp-reframe-list">
          {REFRAMES.map(([before, ask]) => (
            <Fragment key={before}><dt>Instead of {before.charAt(0).toLowerCase() + before.slice(1)}</dt><dd>{ask}</dd></Fragment>
          ))}
        </dl>
        <p className="sdp-close">Ask which parts of the problem need solving before asking which tool solves them.</p>
      </section>
    </div>
  );
}

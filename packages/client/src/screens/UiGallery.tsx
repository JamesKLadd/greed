/**
 * Dev-only visual reference: every surface, control and cosmetic on one page.
 *
 * Client tests run in a node environment (no DOM), so nothing here can be
 * asserted automatically — this page exists so a single screenshot per viewport
 * covers the whole design system during the UI overhaul. Reach it with
 * `?ui` on the dev server; it is never bundled into a production route.
 */

import { useState, type CSSProperties, type ReactNode } from "react";
import type { DieValue } from "@greed/core";
import { Die } from "../components/Die.js";
import { Icon, type IconName } from "../ui/index.js";
import { DICE_SKINS, TABLE_THEMES } from "../game/cosmetics.js";
import { seatColor, initials } from "../game/theme.js";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 34 }}>
      <h2
        style={{
          fontSize: 13,
          textTransform: "uppercase",
          letterSpacing: 2,
          opacity: 0.75,
          borderBottom: "1px solid var(--panel-line)",
          paddingBottom: 6,
          marginBottom: 14,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" };

export function UiGallery() {
  const [pressed, setPressed] = useState(true);

  return (
    <div className="setup" style={{ display: "block", maxWidth: 1100, margin: "0 auto" }}>
      <div className="setup__hero">
        <h1 className="setup__logo" style={{ fontSize: 42 }}>
          GREED
        </h1>
        <p className="setup__tagline">UI gallery — every primitive, surface and cosmetic</p>
      </div>

      <div className="setup__panel">
        <Section title="Buttons">
          <div style={row}>
            <button className="btn">Default</button>
            <button className="btn btn--ghost">Ghost</button>
            <button className="btn btn--roll">Roll</button>
            <button className="btn btn--bank">Bank</button>
            <button
              className={`btn ${pressed ? "btn--on" : ""}`}
              onClick={() => setPressed(!pressed)}
            >
              Toggle ({pressed ? "on" : "off"})
            </button>
            <button className="btn" disabled>
              Disabled
            </button>
          </div>
          <div style={{ ...row, marginTop: 10 }}>
            <button className="btn btn--roll btn--big">Big roll</button>
            <button className="btn btn--bank btn--big">Big bank</button>
            <button className="btn btn--icon">🔊</button>
          </div>
          <p style={{ fontSize: 12, opacity: 0.7, margin: "14px 0 4px" }}>
            Game bar — the icon-only collapse is scoped to <code>.game__bar</code>, so it must be
            rendered inside one to reproduce the &lt;760px behaviour. Note this copy sits inside a
            padded panel, so it runs out of width sooner than the real full-bleed bar; judge bar
            overflow in the actual game screen, not here.
          </p>
          <div className="game__bar">
            <button className="btn btn--ghost bar-btn bar-btn--menu">Menu</button>
            <h1 className="game__logo">GREED</h1>
            <div className="game__bar-right">
              {["hints", "history", "rules", "restart"].map((k) => (
                <button key={k} className={`btn btn--ghost bar-btn bar-btn--${k}`}>
                  {k}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Icons">
          <div style={{ ...row, gap: 18 }}>
            {(
              [
                "back",
                "close",
                "bulb",
                "scroll",
                "book",
                "refresh",
                "download",
                "chart",
                "palette",
                "gear",
                "graduate",
                "dice",
                "globe",
                "lock",
                "volume",
                "volume-off",
                "eye",
                "user",
                "check",
                "plus",
                "minus",
              ] as IconName[]
            ).map((n) => (
              <div key={n} style={{ textAlign: "center", width: 62 }}>
                <Icon name={n} size={26} />
                <div style={{ fontSize: 10, opacity: 0.7 }}>{n}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Form controls">
          <label className="field">
            <span className="field__label">Text field</span>
            <input className="seats-config__name" defaultValue="Player One" />
          </label>
          <label className="field">
            <span className="field__label">Select</span>
            <select className="seats-config__diff" defaultValue="hard">
              <option value="easy">easy</option>
              <option value="hard">hard</option>
            </select>
          </label>
          <div style={row}>
            <input
              className="seats-config__name join-row__code"
              defaultValue="TLZT"
              maxLength={4}
            />
            <input className="setup__goal-input" type="number" defaultValue={3000} />
            <input className="slider" type="range" defaultValue={60} />
          </div>
          <div style={{ ...row, marginTop: 10 }}>
            <button className="segmented__btn segmented__btn--on">On</button>
            <button className="segmented__btn">Off</button>
          </div>
        </Section>

        <Section title="Banners, toasts & meters">
          <div className="banner banner--final">Final round</div>
          <div className="banner banner--sd">Sudden death</div>
          <div className="banner banner--spectate">Spectating</div>
          <div style={{ ...row, marginTop: 12 }}>
            <span className="toast toast--good">Banked 450</span>
            <span className="toast toast--bad">Bust!</span>
            <span className="toast toast--info">Hot dice</span>
          </div>
          <div className="controls__meters" style={{ marginTop: 12 }}>
            <div className="meter">
              <span className="meter__label">Turn points</span>
              <span className="meter__value">450</span>
            </div>
            <div className="meter">
              <span className="meter__label">Dice to roll</span>
              <span className="meter__value">3</span>
            </div>
          </div>
        </Section>

        <Section title="Dice — states">
          <div style={row}>
            {([1, 2, 3, 4, 5, 6] as DieValue[]).map((v) => (
              <Die key={v} value={v} size={44} />
            ))}
          </div>
          <div style={{ ...row, marginTop: 12 }}>
            <Die value={1} size={44} locked />
            <Die value={5} size={44} dim />
            <span style={{ fontSize: 12, opacity: 0.7 }}>locked · dim</span>
          </div>
          <div style={{ ...row, marginTop: 12 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>inline sizes 18 / 30 / 44:</span>
            <Die value={4} size={18} />
            <Die value={4} size={30} />
            <Die value={4} size={44} />
          </div>
          <div style={{ marginTop: 14 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>tray · hot · busted:</span>
            <div style={{ ...row, alignItems: "flex-start", marginTop: 6 }}>
              {["dice-tray", "dice-tray dice-tray--hot", "dice-tray dice-tray--busted"].map(
                (cls) => (
                  <div key={cls} className={cls}>
                    {([1, 5, 3, 3, 6] as DieValue[]).map((v, i) => (
                      <Die key={i} value={v} size={34} locked={i < 2} />
                    ))}
                  </div>
                ),
              )}
            </div>
          </div>
        </Section>

        <Section title={`Dice skins (${DICE_SKINS.length})`}>
          <div style={row}>
            {DICE_SKINS.map((c) => (
              <div key={c.id} style={{ textAlign: "center" }}>
                <div style={{ ...row, gap: 5, ...(c.vars as CSSProperties) }}>
                  <Die value={5} size={34} />
                  <Die value={2} size={34} />
                </div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{c.id}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title={`Table themes (${TABLE_THEMES.length})`}>
          <div style={row}>
            {TABLE_THEMES.map((c) => (
              <div key={c.id} style={{ textAlign: "center" }}>
                <div
                  className="locker-preview locker-preview--table"
                  style={{ ...(c.vars as CSSProperties), width: 96, height: 58 }}
                />
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{c.id}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Seat colors (8 hues — the colorblind toggle swaps these)">
          <div style={row}>
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="pseat"
                // .pseat is normally absolutely placed on the table ellipse and
                // centred with a translate; neutralise both to lay them out inline.
                style={{
                  ["--seat" as string]: seatColor(i),
                  width: 132,
                  position: "static",
                  transform: "none",
                }}
              >
                <div className="pseat__head">
                  <span className="pseat__avatar">{initials(`Player ${i + 1}`)}</span>
                  <span className="pseat__name">Player {i + 1}</span>
                </div>
                <div className="pseat__meta">
                  <span className="pseat__total">{(i + 1) * 350}</span>
                </div>
                <div className="pseat__bar">
                  <div className="pseat__fill" style={{ width: `${(i + 1) * 11}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Panels & overlay card">
          <div className="overlay__card" style={{ position: "static", margin: 0 }}>
            <h2 className="overlay__title">Overlay card</h2>
            <p>Dialog surface, as used by Rules / History / Game over / Roll-off.</p>
            <div className="overlay__actions">
              <button className="btn btn--roll">Confirm</button>
              <button className="btn btn--ghost">Close</button>
            </div>
          </div>
          <div className="stats-grid" style={{ marginTop: 14 }}>
            {["Games", "Wins", "Best turn", "Streak"].map((s, i) => (
              <div className="stat-tile" key={s}>
                <span className="stat-tile__value">{[42, 17, 1250, 3][i]}</span>
                <span className="stat-tile__label">{s}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

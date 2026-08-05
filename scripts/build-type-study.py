#!/usr/bin/env python3
"""
Build the type study page with real typefaces embedded as data URIs.

The Artifact CSP blocks font CDNs, so every face has to be inlined. The fonts
come from npm (Fontsource and the JetBrains Mono distribution), all under the
SIL Open Font License.

    python3 scripts/build-type-study.py <fonts-node_modules> <charset.json> <out.html>
"""

import base64
import json
import pathlib
import sys

FONTS, CHARSET, OUT = (pathlib.Path(a) for a in sys.argv[1:4])

# name -> path, relative to the node_modules directory passed in.
FACES = {
    "Inter": "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
    "InterGreek": "@fontsource-variable/inter/files/inter-greek-wght-normal.woff2",
    "Literata": "@fontsource-variable/literata/files/literata-latin-wght-normal.woff2",
    "Newsreader": "@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2",
    "SourceSerif": "@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2",
    "PublicSans": "@fontsource-variable/public-sans/files/public-sans-latin-wght-normal.woff2",
    "JetBrains": "jetbrains-mono/fonts/webfonts/JetBrainsMono-Regular.woff2",
    "NotoMath": "@fontsource/noto-sans-math/files/noto-sans-math-latin-400-normal.woff2",
}

VARIABLE = {"Inter", "InterGreek", "Literata", "Newsreader", "SourceSerif", "PublicSans"}


def data_uri(path: pathlib.Path) -> str:
    return "data:font/woff2;base64," + base64.b64encode(path.read_bytes()).decode()


def font_face(name: str, rel: str) -> str:
    path = FONTS / rel
    if not path.exists():
        raise SystemExit(f"missing font file: {path}")
    weight = "100 900" if name in VARIABLE else "400"
    return (
        f"@font-face{{font-family:'{name}';"
        f"src:url({data_uri(path)}) format('woff2');"
        f"font-weight:{weight};font-style:normal;font-display:block;}}"
    )


faces_css = "\n".join(font_face(n, p) for n, p in FACES.items())
total_kb = sum((FONTS / p).stat().st_size for p in FACES.values()) // 1024

charset = json.loads(CHARSET.read_text())
# Measured in a real browser; see scripts/check-font-coverage note in the page.
UNCOVERED = ["ᴿ", "ⁱ", "ⁿ", "₍", "₎", "＋"]

# The machine drawn in every mockup: level 3, contains 01.
AUTOMATON = """
<svg viewBox="0 0 272 120" width="298" height="131" aria-label="Three state machine"
     style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#000">
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-opacity=".8">
    <path d="M6 66 L20 66"/>
    <circle cx="44" cy="66" r="19" stroke-opacity="1"/>
    <circle cx="136" cy="66" r="19" stroke-opacity="1"/>
    <circle cx="228" cy="66" r="19" stroke-opacity="1"/>
    <circle cx="228" cy="66" r="14.6" stroke-opacity="1"/>
    <path d="M63 66 L104 66"/><path d="M155 66 L196 66"/>
    <path d="M30.6 53.6 A13 13 0 1 1 55.6 49.4"/>
    <path d="M122.6 53.6 A13 13 0 1 1 147.6 49.4"/>
    <path d="M214.6 53.6 A13 13 0 1 1 239.6 49.4"/>
  </g>
  <g fill="currentColor" fill-opacity=".84">
    <path d="M27 66 L18 62 L18 70 Z"/><path d="M113 66 L104 62 L104 70 Z"/>
    <path d="M205 66 L196 62 L196 70 Z"/>
    <path d="M56.4 51 L48.4 45.6 L57.6 42.2 Z"/>
    <path d="M148.4 51 L140.4 45.6 L149.6 42.2 Z"/>
    <path d="M240.4 51 L232.4 45.6 L241.6 42.2 Z"/>
  </g>
  <g font-family="JetBrains, monospace" font-size="12" fill="currentColor"
     text-anchor="middle" font-weight="600">
    <text x="44" y="70">q0</text><text x="136" y="70">q1</text><text x="228" y="70">q2</text>
  </g>
  <g font-family="JetBrains, monospace" font-size="11.5" fill="currentColor"
     fill-opacity=".84" text-anchor="middle">
    <text x="44" y="26">1</text><text x="136" y="26">0</text><text x="228" y="26">0,1</text>
    <text x="84" y="60">0</text><text x="176" y="60">1</text>
  </g>
</svg>
"""

PAIRINGS = [
    {
        "no": "01",
        "name": "Source Serif 4 + Inter",
        "title_font": "SourceSerif",
        "title_size": "26px",
        "title_weight": "400",
        "title_track": "-0.008em",
        "ui": "Inter",
        "label_font": "Inter",
        "label_weight": "700",
        "label_track": ".1em",
        "lede": "A screen serif drawn for long reading, next to the most neutral sans there is. "
        "The serif carries the level name and nothing else.",
        "traits": [
            ("Source Serif 4 has Greek", "so the title face could take notation if it ever needed to. It does not, but it means nothing breaks."),
            ("Inter is deliberately plain", "which is the point: it never competes with the diagram or the ledger."),
            ("The safest pairing here", "and the least distinctive. Choose it if you want the machine to be the only thing anyone remembers."),
        ],
    },
    {
        "no": "02",
        "name": "Literata + Inter",
        "title_font": "Literata",
        "title_size": "25px",
        "title_weight": "400",
        "title_track": "-0.004em",
        "ui": "Inter",
        "label_font": "Inter",
        "label_weight": "700",
        "label_track": ".1em",
        "lede": "Literata was cut for screen reading and has real weight in its serifs. "
        "Warmer than Source Serif without being nostalgic.",
        "traits": [
            ("Sturdier at small sizes", "the level titles hold up at 17px in the level list, where Newsreader starts to thin out."),
            ("Also has Greek", "measured, not assumed."),
            ("The one that reads as a book", "which suits a game whose whole subject is a textbook chapter."),
        ],
    },
    {
        "no": "03",
        "name": "Newsreader + Public Sans",
        "title_font": "Newsreader",
        "title_size": "28px",
        "title_weight": "400",
        "title_track": "-0.012em",
        "ui": "PublicSans",
        "label_font": "PublicSans",
        "label_weight": "700",
        "label_track": ".11em",
        "lede": "The most characterful of the serifs, set larger and lighter. "
        "Public Sans underneath is drier than Inter, which keeps the contrast sharp.",
        "traits": [
            ("Newsreader has no Greek", "measured. That is fine here and only here, because this face never renders notation: it sets level names, which are plain English."),
            ("Needs the size", "at 28px the modulation reads as intent. At 17px it would just look thin, so the level list would need its own size."),
            ("The strongest opinion", "and the one most likely to divide people."),
        ],
    },
    {
        "no": "04",
        "name": "Inter alone",
        "title_font": "Inter",
        "title_size": "22px",
        "title_weight": "600",
        "title_track": "-0.022em",
        "ui": "Inter",
        "label_font": "Inter",
        "label_weight": "700",
        "label_track": ".1em",
        "lede": "No serif at all. One sans, one mono, tight semibold titles. "
        "The purest reading of minimal, and the fewest files to ship.",
        "traits": [
            ("Two faces total", "which on iOS means two bundled files and no serif fallback to worry about."),
            ("Hierarchy by weight and size only", "no change of voice between the title and the interface."),
            ("Quietest of the four", "and the one that puts the most pressure on the layout to carry the design."),
        ],
    },
]


def screen(p: dict) -> str:
    rules = [
        ("δ(q0, 0) = q1", "EDIT", ""),
        ("δ(q0, 1) = q0", "DONE", "on"),
        ("δ(q1, 0) = q1", "EDIT", ""),
        ("δ(q1, 1) = q2", "EDIT", ""),
        ("δ(q2, 1) = undefined", "DEAD", "gap"),
    ]
    rows = "".join(
        f'<div class="mk-rule {cls}"><span>{text}</span><span class="edit">{tag}</span></div>'
        for text, tag, cls in rules
    )
    pills = "".join(
        f'<span class="mk-p {c}">{t}</span>'
        for t, c in [("ε", "ok"), ("0", "ok"), ("1", "ok"), ("01", "ok"), ("10", "ok"),
                     ("0101", "no"), ("1111", "ok"), ("100", "ok")]
    )
    tools = "".join(
        f'<span class="mk-t {c}">{t}</span>'
        for t, c in [("+ State", ""), ("Connect", "on"), ("Tidy", ""),
                     ("Undo", ""), ("Redo", "off"), ("Notes", "")]
    )
    return f"""
<div class="frame"><div class="screen" style="
  --ui:'{p['ui']}';--title:'{p['title_font']}';--tsize:{p['title_size']};
  --tweight:{p['title_weight']};--ttrack:{p['title_track']};
  --lfont:'{p['label_font']}';--lweight:{p['label_weight']};--ltrack:{p['label_track']};">
  <div class="mk-status"><span>9:41</span><span>3 / 12</span></div>
  <div class="mk-head">
    <div class="mk-crumb"><span>‹ Levels</span><span>3/3 · DFA</span></div>
    <div class="mk-title">Substring</div>
    <div class="mk-goal">Accept the strings that contain 01 somewhere inside them.</div>
  </div>
  <div class="mk-diagram">{AUTOMATON}<div class="mk-fit">FIT</div></div>
  <div class="mk-grip"><i></i></div>
  <div class="mk-delta-head"><span class="sig">δ : Q × Σ → Q</span><span class="cnt">5 OF 6 DEFINED</span></div>
  {rows}
  <div class="mk-add">+ new rule</div>
  <div class="mk-suite">
    <div class="mk-suite-head"><span>Suite · live</span><span class="fail">1 failing</span></div>
    <div class="mk-pills">{pills}</div>
  </div>
  <div class="mk-bar">{tools}</div>
</div></div>
"""


def specimen(p: dict) -> str:
    traits = "".join(
        f'<div class="trait"><span><b>{a}</b>, {b}</span></div>' for a, b in p["traits"]
    )
    return f"""
<div class="spec">
  <div class="spec-block">
    <span class="spec-label">Specimen</span>
    <div class="type-demo" style="
      --ui:'{p['ui']}';--title:'{p['title_font']}';--tsize:{p['title_size']};
      --tweight:{p['title_weight']};--ttrack:{p['title_track']};
      --lfont:'{p['label_font']}';--lweight:{p['label_weight']};--ltrack:{p['label_track']};">
      <div class="t-label">Level 3 · deterministic finite automaton</div>
      <div class="t-title">Beyond context free</div>
      <div class="t-body">No pushdown automaton recognises this language: one stack can match
        a against b or b against c, never both.</div>
      <div class="t-rule"></div>
      <div class="t-mono">δ(q0, a, ε) ∋ (q1, A)</div>
      <div class="t-mono">M = (Q, Σ, Γ, δ, q₀, Z₀, F)</div>
      <div class="t-mono">L = {{ w wᴿ : w ∈ {{a,b}}* }}</div>
    </div>
  </div>
  <div class="spec-block">
    <span class="spec-label">Files to ship</span>
    <div class="files">
      <span>{p['title_font']}</span><span>{p['ui']}</span><span>JetBrains Mono</span>
    </div>
  </div>
  <div class="traits">{traits}</div>
</div>
"""


sections = "".join(
    f"""
<section class="pair">
  <div class="wrap">
    <div class="pair-head"><span class="pair-no">{p['no']}</span><h2>{p['name']}</h2></div>
    <p class="lede">{p['lede']}</p>
    <div class="pair-grid"><div class="frame-wrap">{screen(p)}</div>{specimen(p)}</div>
  </div>
</section>
"""
    for p in PAIRINGS
)

coverage_rows = "".join(
    f"<tr><th>{name}</th><td class='num'>{cov}</td><td>{note}</td></tr>"
    for name, cov, note in [
        ("JetBrains Mono, complete", "23 / 33", "Greek, all the set theory, the arrows, the combining circumflex. The best single face measured."),
        ("JetBrains Mono, Fontsource", "11 / 33", "Same typeface, half the coverage. The subset files ship Latin only, so the notation would fall back."),
        ("Inter", "13 / 33", "Greek yes, set theory no."),
        ("Source Serif 4", "13 / 33", "Greek yes, set theory no."),
        ("Literata", "11 / 33", "Greek yes."),
        ("IBM Plex Sans", "11 / 33", "Greek yes. Plex Mono and Plex Serif ship no Greek subset at all."),
        ("Newsreader, Public Sans", "4 / 33", "No Greek. Usable only for text that never carries notation."),
        ("Noto Sans Math", "22 / 33", "Rescues ⇀ and ␣, which no text face here has."),
    ]
)

html = f"""<title>automata-k — type, measured</title>
<style>
{faces_css}

:root {{
  --paper:#FFFFFF; --ink:#000000; --dim:rgba(0,0,0,.55); --line:rgba(0,0,0,.14);
  --line-strong:rgba(0,0,0,.28); --tint:#F0F0F0;
  --pass:#00623A; --pass-bg:#F2F7F4; --pass-line:rgba(0,98,58,.24);
  --fail:#B00020; --fail-bg:#FCF1F2;
  --sans:'Inter',system-ui,sans-serif; --mono:'JetBrains','NotoMath',ui-monospace,monospace;
}}
@media (prefers-color-scheme: dark) {{
  :root {{
    --paper:#0B0B0C; --ink:#F2F2F3; --dim:rgba(242,242,243,.6); --line:rgba(242,242,243,.16);
    --line-strong:rgba(242,242,243,.32); --tint:#1A1A1C;
    --pass:#5BC08D; --pass-bg:#122019; --pass-line:rgba(91,192,141,.3);
    --fail:#E8796B; --fail-bg:#221413;
  }}
}}
:root[data-theme="dark"] {{
  --paper:#0B0B0C; --ink:#F2F2F3; --dim:rgba(242,242,243,.6); --line:rgba(242,242,243,.16);
  --line-strong:rgba(242,242,243,.32); --tint:#1A1A1C;
  --pass:#5BC08D; --pass-bg:#122019; --pass-line:rgba(91,192,141,.3);
  --fail:#E8796B; --fail-bg:#221413;
}}
:root[data-theme="light"] {{
  --paper:#FFFFFF; --ink:#000000; --dim:rgba(0,0,0,.55); --line:rgba(0,0,0,.14);
  --line-strong:rgba(0,0,0,.28); --tint:#F0F0F0;
  --pass:#00623A; --pass-bg:#F2F7F4; --pass-line:rgba(0,98,58,.24);
  --fail:#B00020; --fail-bg:#FCF1F2;
}}

body {{ background:var(--paper); color:var(--ink); font-family:var(--sans);
  font-size:16px; line-height:1.55; -webkit-font-smoothing:antialiased; overflow-x:hidden; }}
.wrap {{ max-width:1160px; margin:0 auto; padding:0 clamp(18px,4vw,40px); }}
h1 {{ font-family:'SourceSerif',serif; font-size:clamp(32px,5.4vw,54px); font-weight:400;
  line-height:1.06; letter-spacing:-0.014em; text-wrap:balance; }}
h2 {{ font-family:'SourceSerif',serif; font-size:clamp(24px,3.2vw,32px); font-weight:400;
  letter-spacing:-0.01em; line-height:1.14; }}
h3 {{ font-size:17px; font-weight:600; letter-spacing:-0.008em; }}
p {{ max-width:64ch; }}
.lede {{ color:var(--dim); font-size:clamp(16px,1.9vw,18px); margin-top:10px; }}
.eyebrow {{ font-family:var(--mono); font-size:11px; letter-spacing:.15em;
  text-transform:uppercase; color:var(--dim); }}
:focus-visible {{ outline:2px solid var(--ink); outline-offset:3px; }}
header.top {{ padding:clamp(46px,8vw,92px) 0 clamp(28px,4vw,48px); }}

section {{ padding:clamp(38px,6vw,72px) 0; border-top:1px solid var(--line); }}
.pair-head {{ display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; }}
.pair-no {{ font-family:var(--mono); font-size:12px; letter-spacing:.12em; color:var(--dim); }}
.pair-grid {{ display:grid; gap:clamp(26px,4vw,48px); grid-template-columns:1fr;
  margin-top:28px; align-items:start; }}
@media (min-width:940px) {{ .pair-grid {{ grid-template-columns:368px 1fr; }} }}

.frame-wrap {{ display:flex; justify-content:center; }}
.frame {{ width:368px; max-width:100%; border:1px solid var(--line-strong); padding:8px;
  background:var(--paper); }}
.screen {{ height:690px; display:flex; flex-direction:column; overflow:hidden;
  background:#FFF; color:#000; font-family:var(--ui),system-ui,sans-serif; font-size:14px; }}
.mk-status {{ height:24px; display:flex; align-items:center; justify-content:space-between;
  padding:0 16px; font-family:var(--mono); font-size:10px; color:rgba(0,0,0,.5); }}
.mk-head {{ padding:4px 16px 12px; border-bottom:1px solid rgba(0,0,0,.14); }}
.mk-crumb {{ display:flex; justify-content:space-between; font-family:var(--lfont),sans-serif;
  font-size:10px; font-weight:var(--lweight); letter-spacing:var(--ltrack);
  text-transform:uppercase; color:rgba(0,0,0,.55); margin-bottom:6px; }}
.mk-title {{ font-family:var(--title),serif; font-size:var(--tsize); font-weight:var(--tweight);
  letter-spacing:var(--ttrack); line-height:1.14; }}
.mk-goal {{ color:rgba(0,0,0,.55); font-size:13px; margin-top:3px; }}
.mk-diagram {{ height:208px; position:relative; border-bottom:1px solid rgba(0,0,0,.14); }}
.mk-fit {{ position:absolute; right:10px; top:10px; font-family:var(--mono); font-size:9.5px;
  letter-spacing:.12em; color:rgba(0,0,0,.55); border:1px solid rgba(0,0,0,.14); padding:3px 7px; }}
.mk-grip {{ height:15px; display:grid; place-items:center; border-bottom:1px solid rgba(0,0,0,.14); }}
.mk-grip i {{ width:30px; height:2px; background:rgba(0,0,0,.14); }}
.mk-delta-head {{ display:flex; justify-content:space-between; padding:9px 16px 7px; }}
.mk-delta-head .sig {{ font-family:var(--mono); font-size:11px; color:rgba(0,0,0,.55); }}
.mk-delta-head .cnt {{ font-family:var(--lfont),sans-serif; font-size:10px;
  font-weight:var(--lweight); letter-spacing:var(--ltrack); color:rgba(0,0,0,.55); }}
.mk-rule {{ display:flex; justify-content:space-between; padding:9px 16px;
  border-top:1px solid rgba(0,0,0,.14); font-family:var(--mono); font-size:12.5px; }}
.mk-rule.on {{ background:#F0F0F0; }}
.mk-rule.gap {{ color:#B00020; }}
.mk-rule .edit {{ font-family:var(--lfont),sans-serif; font-size:9.5px;
  font-weight:var(--lweight); letter-spacing:var(--ltrack); color:rgba(0,0,0,.5); }}
.mk-add {{ margin:10px 16px 0; padding:8px; text-align:center; border:1px dashed rgba(0,0,0,.14);
  font-family:var(--mono); font-size:11px; color:rgba(0,0,0,.5); }}
.mk-suite {{ border-top:1px solid rgba(0,0,0,.14); padding:9px 0 10px; margin-top:auto; }}
.mk-suite-head {{ display:flex; justify-content:space-between; padding:0 16px 7px;
  font-family:var(--lfont),sans-serif; font-size:9.5px; font-weight:var(--lweight);
  letter-spacing:var(--ltrack); text-transform:uppercase; color:rgba(0,0,0,.55); }}
.mk-suite-head .fail {{ color:#B00020; }}
.mk-pills {{ display:flex; gap:4px; padding:0 16px; }}
.mk-p {{ font-family:var(--mono); font-size:11px; padding:3px 7px; border:1px solid rgba(0,0,0,.14);
  color:rgba(0,0,0,.5); }}
.mk-p.ok {{ color:#00623A; border-color:rgba(0,98,58,.24); background:#F2F7F4; }}
.mk-p.no {{ color:#B00020; border-color:#B00020; background:#FCF1F2; }}
.mk-bar {{ display:flex; gap:2px; padding:7px 8px 12px; border-top:1px solid rgba(0,0,0,.14); }}
.mk-t {{ flex:1; text-align:center; padding:9px 1px; font-size:12px; white-space:nowrap; }}
.mk-t.on {{ background:#F0F0F0; font-weight:700; }}
.mk-t.off {{ color:rgba(0,0,0,.35); }}

.spec {{ display:flex; flex-direction:column; gap:24px; }}
.spec-block {{ display:flex; flex-direction:column; gap:9px; }}
.spec-label {{ font-family:var(--mono); font-size:10px; letter-spacing:.15em;
  text-transform:uppercase; color:var(--dim); }}
.type-demo {{ border:1px solid var(--line); padding:22px 24px; display:flex;
  flex-direction:column; gap:11px; }}
.type-demo .t-label {{ font-family:var(--lfont),sans-serif; font-size:10px;
  font-weight:var(--lweight); letter-spacing:var(--ltrack); text-transform:uppercase; color:var(--dim); }}
.type-demo .t-title {{ font-family:var(--title),serif; font-size:var(--tsize);
  font-weight:var(--tweight); letter-spacing:var(--ttrack); line-height:1.12; }}
.type-demo .t-body {{ font-family:var(--ui),sans-serif; font-size:15px; color:var(--dim); }}
.type-demo .t-mono {{ font-family:var(--mono); font-size:13.5px; }}
.type-demo .t-rule {{ height:1px; background:var(--line); }}
.files {{ display:flex; flex-wrap:wrap; gap:6px; }}
.files span {{ font-family:var(--mono); font-size:11px; border:1px solid var(--line);
  padding:3px 9px; color:var(--dim); }}
.traits {{ display:flex; flex-direction:column; gap:8px; }}
.trait {{ display:flex; gap:10px; font-size:14.5px; color:var(--dim); line-height:1.45; }}
.trait b {{ color:var(--ink); font-weight:600; }}
.trait::before {{ content:""; flex:0 0 auto; width:5px; height:5px; margin-top:8px;
  background:var(--line-strong); }}

.glyphs {{ display:flex; flex-wrap:wrap; gap:1px; background:var(--line);
  border:1px solid var(--line); margin-top:24px; }}
.glyph {{ background:var(--paper); width:64px; padding:12px 4px 8px; text-align:center;
  display:flex; flex-direction:column; gap:4px; }}
.glyph .g {{ font-family:var(--mono); font-size:22px; line-height:1.2; }}
.glyph .cp {{ font-family:var(--mono); font-size:8.5px; color:var(--dim); letter-spacing:.02em; }}
.glyph.bad {{ background:var(--fail-bg); }}
.glyph.bad .g, .glyph.bad .cp {{ color:var(--fail); }}

.matrix {{ overflow-x:auto; margin-top:24px; border:1px solid var(--line); }}
table {{ border-collapse:collapse; width:100%; min-width:640px; }}
th, td {{ text-align:left; padding:12px 16px; border-bottom:1px solid var(--line);
  vertical-align:top; font-size:14.5px; }}
thead th {{ font-family:var(--mono); font-size:10px; letter-spacing:.12em;
  text-transform:uppercase; color:var(--dim); font-weight:400; }}
tbody th {{ font-weight:600; width:220px; }}
td {{ color:var(--dim); }}
.num {{ font-family:var(--mono); color:var(--ink); font-variant-numeric:tabular-nums;
  width:104px; white-space:nowrap; }}
tbody tr:last-child th, tbody tr:last-child td {{ border-bottom:0; }}

.rec {{ border:1px solid var(--ink); padding:clamp(22px,3.4vw,32px); margin-top:26px; }}
.rec h3 {{ font-family:'SourceSerif',serif; font-size:22px; font-weight:400; margin-bottom:10px; }}
.cards {{ display:grid; gap:18px; margin-top:24px; grid-template-columns:1fr; }}
@media (min-width:760px) {{ .cards {{ grid-template-columns:1fr 1fr; }} }}
.card {{ border-top:2px solid var(--ink); padding-top:12px; display:flex;
  flex-direction:column; gap:6px; }}
.card p {{ font-size:14.5px; color:var(--dim); margin:0; }}
footer {{ padding:34px 0 60px; color:var(--dim); font-size:14px; }}
@media (prefers-reduced-motion: reduce) {{ * {{ animation:none!important; transition:none!important; }} }}
</style>

<header class="top">
  <div class="wrap">
    <span class="eyebrow">automata-k · type, measured</span>
    <h1>Real typefaces this time, chosen on whether they can draw the notation.</h1>
    <p class="lede">
      The last set used system faces, which is why none of them landed: all four were the
      same three fonts at different sizes. These are real, embedded, open licensed, and
      picked against a test rather than a preference. Ink colours throughout, since that
      part is settled.
    </p>
  </div>
</header>

<section>
  <div class="wrap">
    <span class="eyebrow">The constraint nobody looks at first</span>
    <h2 style="margin-top:10px">The interface draws {len(charset)} characters that are not ASCII.</h2>
    <p class="lede">
      Pulled straight out of the source. A face that cannot draw these does not fail
      loudly, it silently falls back to a system font mid-sentence, which is exactly the
      mismatch that made the last set feel wrong.
    </p>
    <div class="glyphs">
      {"".join(f'<div class="glyph{" bad" if c in UNCOVERED else ""}"><span class="g">{c}</span><span class="cp">U+{ord(c):04X}</span></div>' for c in charset)}
    </div>
    <p style="margin-top:18px;color:var(--dim);font-size:14.5px">
      The six in red are drawn by none of the nine families tested, and none of the
      symbol fallbacks either. That is a copy problem, not a font problem. See the end.
    </p>

    <h3 style="margin-top:40px">Coverage, measured in a browser</h3>
    <p style="color:var(--dim);font-size:14.5px;margin-top:6px">
      Each glyph rendered to a canvas with the face and without it. Identical pixels mean
      the browser fell back, so the face does not have it.
    </p>
    <div class="matrix">
      <table>
        <thead><tr><th>Family</th><th>Covers</th><th>Notes</th></tr></thead>
        <tbody>{coverage_rows}</tbody>
      </table>
    </div>
    <div class="rec" style="margin-top:28px">
      <h3>So the monospace is decided, and it is not a preference</h3>
      <p style="color:var(--dim);font-size:15px">
        <b style="color:var(--ink)">JetBrains Mono, from its own distribution rather than the Fontsource
        subset.</b> It is the only face measured that draws δ, Σ, ε, ∅, ∈, ∋, ∪, ∩, ≠, ≥, ⊢ and the
        arrows, which is most of what the ledger and the formal layer are made of. 69KB.
        The four pairings below differ only in what sits beside it.
      </p>
    </div>
  </div>
</section>

{sections}

<section>
  <div class="wrap">
    <span class="eyebrow">Where I would land</span>
    <h2 style="margin-top:10px">02 Literata with Inter, and JetBrains Mono doing the notation.</h2>
    <p class="lede">
      Literata holds at 17px in the level list where Newsreader would need its own size,
      and it has the warmth that Source Serif 4 trades away for neutrality. Inter stays
      out of the way. If you want no serif at all, 04 is the honest minimal answer and
      ships one fewer file.
    </p>

    <div class="cards">
      <div class="card">
        <h3>Six characters to stop using</h3>
        <p>ᴿ ⁱ ⁿ ₍ ₎ are Unicode superscripts and subscripts that almost no text face carries,
        and they are all over the level titles and set-builders. Compose them properly instead,
        as a smaller glyph on a raised baseline, which works in any face and is better
        typography anyway. ＋ in the toolbar is a fullwidth plus and should just be +.</p>
      </div>
      <div class="card">
        <h3>What this costs to ship</h3>
        <p>{total_kb}KB of fonts on the web, less once subset to the characters actually used.
        On iOS the same files go in the bundle and are registered in the app's Info.plist.
        Both platforms then draw the notation identically, which they do not today.</p>
      </div>
      <div class="card">
        <h3>A bug this found</h3>
        <p>The build in your hands right now falls back to a system font on δ, Σ, ε and every
        set-theory symbol, because it uses the platform monospace. That is why the ledger and
        the diagram labels never quite matched the interface.</p>
      </div>
      <div class="card">
        <h3>Licensing</h3>
        <p>Every face here is SIL Open Font License: Inter, Literata, Newsreader, Source Serif 4,
        Public Sans, JetBrains Mono. Bundling and shipping them in an App Store binary is
        permitted, with the licence included.</p>
      </div>
    </div>
  </div>
</section>

<footer>
  <div class="wrap">Say a number and it becomes the app, on both platforms.</div>
</footer>
"""

OUT.write_text(html)
print(f"wrote {OUT} ({len(html) // 1024}KB, {total_kb}KB of fonts inlined)")

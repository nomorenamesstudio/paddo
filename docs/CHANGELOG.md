# Changelog

Reverse chronological. Tagged Feature / Fix / Break.

## 2026-10-29 — A hand edit stops looking foreign once it is in the room

**Fix** — the watcher turns an outside edit of a `.md` into suggestions, but the store's disk hash
kept pointing at the text from before that edit. Every later store then compared against a file that
had moved on, refused to write, and the writing stayed in the sidecar. `ingestFile` now records the
hash of the text it absorbed, so the next store is allowed to write again.

Honest note: the e2e covering the whole path (hand edit → suggestions → accept → file) passes with
and without the fix on today's code, so it guards the contract but does not pin this change.

## 2026-10-29 — The list says how many edits are waiting

**Feature** — a small pill after a document's title carries the number of suggested edits waiting on
it, and only when there is at least one. The count is read from each document's CRDT sidecar
(`src/server/pending.ts`) rather than by opening rooms, so the list still answers in one request —
measured 78 ms for thirteen documents — and a sidecar's size plus mtime keys a short cache.

The pill is inline rather than a flex item: a long title wraps around it instead of pushing it out.
Accent ink on a 14% accent tint, tabular numerals, and it reads in both themes.

## 2026-10-29 — No transform left above the editor

**Fix** — iOS Safari's grammar underlines drifted away from their words while the page scrolled. The
cause was ours: the document's entrance animation ends with `transform: translateY(0)` and
`animation-fill-mode: both` kept it on `.editor__body` for the rest of the session, so the editable
area sat in a composited layer and WebKit's annotation overlay stopped following it.

The animation is scoped to `.is-ready:not(.has-entered)` and a timer adds `has-entered` once it has
played, so the computed transform returns to `none`. The e2e test walks the chain above `.prose` and
requires no transform, filter or `will-change` on any ancestor — measured before the fix:
`matrix(1, 0, 0, 1, 0, 0)` on `editor__body`.

## 2026-10-29 — A hunk is only dead when its text is gone

**Fix** — accepting one change marked *every* other pending hunk conflicted, so the writer met
"Overlaps a change you already accepted" on hunks whose text was still sitting in the document,
unapprovable. The check compared each hunk's anchored range against its quote, and anchors drift
after any edit for reasons that leave the quoted text perfectly intact.

An accept now only judges the hunks whose text it may have taken: a hunk is marked conflicted when
its quote is gone from the document (`The text under this change is gone`), or when the quote is found
only inside the range the accept just wrote. Anything else keeps waiting, and the applier relocates it
onto its text when it is accepted.

**Fix** — `pruneDeadSuggestions` also clears a conflict flag whose text is still present, so hunks
already marked wrongly become approvable again instead of needing a fresh proposal.

## 2026-10-29 — The store's two hashes, and the hunks that went stale with them

**Fix** — restoring raw HTML made the file and the room disagree, and the "someone else edited the
file" guard compared both against one hash: every store after that was refused, so accepting a hunk
changed the document but never the file. `lastWritten` (did the room change) and `lastDisk` (did the
file change) are tracked separately now, seeded from the file at load and updated on write.

**Fix** — the three imported documents carried delete hunks the writer could not approve: the agent
had quoted `&lt;!-- … --&gt;` from the escaped serialization, and the document's own text has
`<!-- … -->`, so no anchor could ever match ("the text moved under every hunk"). The stale hunks were
rejected and re-proposed against the live text, then accepted: the files now hold no comment block
and no HTML entities, and the bracket placeholders keep their `\[` escapes for the bake step.

## 2026-10-29 — A document keeps the raw HTML it was written with

**Fix** — three documents imported from a page pipeline opened with `&lt;!-- page: … --&gt;` where
the source had `<!-- page: … -->`, and the file on disk was rewritten that way too. The editor's
markdown serializer cannot hold raw HTML as markup, so it escapes it in the prose — and the store
wrote the escaped form back over the imported file.

`markdownFromYDoc` now restores `&lt;`/`&gt;` outside fenced code (`src/server/fidelity.ts`), which
covers comments and any other block-level HTML, and leaves code samples alone because the serializer
never touched them. A doubled `&amp;lt;` and a literal `&amp;` are left as written.

Bracket escapes stay, deliberately: `[image: …]` is written as `\[image: …\]` because markdown
would read it as a link, and the pipeline's bake step unescapes it on the way back. Undoing that
here would make a real escaped bracket indistinguishable from prose.

## 2026-10-29 — The writing guide is read-only until you edit it

**Feature** — the guide renders as prose in the card, with its word count and a single **Edit guide**
button; the textarea only exists while editing, next to **Save guide** and **Cancel**. A stray tap on
the way past settings can no longer rewrite the brief the agent works from. Saving closes the editor
again; a cancelled edit leaves the stored guide untouched.

## 2026-10-29 — Settings reads as sheets, not a column of text

**Feature** — the settings page is a stack of cards now, using the same material as the bars
(`--header-bg`, 18px radius, the soft shadow), with an intro line, a segmented theme track instead of
loose buttons, and the guide in a well-inset textarea. "Agent tokens" split into **Connect an agent**
and **Connected agents** — pairing is the thing you came to do, the list is what you check later.

## 2026-10-29 — One test article's sidecar rebuilt from scratch

**Fix** — after compaction the sidecar for `the-quiet-interface` was still 1.4 MB, all of it CRDT
history from the replay era rather than migration records. With no client holding the room, the
sidecar was deleted and the document reseeded from its markdown: **15.8 MB → 2.2 KB**, prose intact
(272 words), markdown on disk byte-identical. The three pending hunks on that document went with it,
which is the cost of a rebuild — their anchors only exist in the CRDT.

**Tooling** — the repair script is `tools/compact-sidecar.mjs` now, documented in SETUP along with
what a rebuild costs.

## 2026-10-29 — The sidecar stops growing without bound

**Fix** — `.paddo/the-quiet-interface.y` had reached 15.8 MB for a 282-word document: 74 copies of
`@tiptap/y-tiptap`'s position-migration record, appended every time a client moved content, each
carrying a `seen` state vector of thousands of `[clientId, clock]` pairs. The map is append-only by
design, so nothing ever removed them.

Compaction now runs on every store (`src/server/compaction.ts`), using the library's own rule for
what is dead: a record is superseded when another record's `seen` covers its `(client, clock)`, so
that later record already carries the final mapping. The newest four records are never touched, the
map is left alone below eight records, and `seen` vectors are capped at 256 entries — a truncated
vector can only fail to prove supersession, which costs a stale hunk a relocation, never a position
moved to the wrong place. Dropping a *newer* record while an older one survives is the dangerous
direction; the tests pin it.

The 15.8 MB file was repaired in place: 74 records → 4, 15,848,961 → 1,428,958 bytes, with the prose
and the pending suggestions byte-identical. The original is at `.cache/the-quiet-interface.y.before`.

## 2026-10-29 — A renamed document keeps its address, and a ghost address creates nothing

**Fix** — a phone tab that slept through a rename came back to a name that no longer existed: the
API answered `404`, the editor ignored it and opened an empty room, and storing that room minted a
second file with the same title. Three drafts of "Linkedin post ideas" came out of one session that
way (5 / 129 / 198 words; the long one was a strict superset of the others).

Three changes, all root cause:

- **Aliases** — `renameDocument` records `old → new` in `.paddo/aliases.json`, chains re-point when a
  document is renamed again, and `GET /api/documents/<old>` answers with the current slug and
  `moved: true`. The editor takes that address instead of opening a room under a dead name.
- **No phantom rooms** — a room whose markdown *and* sidecar are both missing now refuses to load
  (`no such document`), so a stale address cannot write a new file.
- **An honest screen** — a 404 shows "This document is gone" with a way back to the library, rather
  than an empty editor that looks like lost work.

**Fix** — `.paddo/the-quiet-interface.y` had grown to 15.8 MB for a 282-word document. It is not the
prose: 28 copies of TipTap's collaboration position-migration record, each with a `seen` vector of
thousands of `[clientId, clock]` pairs, accumulated over repeated CRDT replays. Harmless on disk,
expensive on every open. Repair pending.

## 2026-10-27 — The writing guide is reachable with a token

**Feature** — `GET /api/settings/guide` returns `{ writingGuide }` to a session or a token with
`read`, and MCP gained `get_writing_guide`. An agent no longer needs the disk (`.paddo/settings.json`)
to follow the writer's voice, and the rest of the settings stay the owner's: `/api/settings` with a
token is still `401`.

## 2026-10-27 — Accepting a batch no longer splices stale offsets

**Fix** — *Accept all* built one transaction from ranges captured before the batch, so two hunks
whose ranges overlapped were applied against offsets that no longer existed and swallowed the
characters between them (`devices and apps.nd the agent`, `nonsense.nse?`). The batch now walks the
hunks one at a time through the same verified path a single accept uses, and after every apply it
re-checks each waiting hunk's quote against the document as it is: a hunk whose text no longer
matches is marked **conflicted** — shown with the reason, Accept and Edit disabled — instead of
being applied. Rejecting it is the only way out, and asking the agent for a fresh hunk is the fix.

The regression test proves it: two hunks, the second nested inside the first, *Accept all* → only
the outer change lands, the inner one shows `Overlaps a change you already accepted`, and the file
never contains the inner replacement. Measured failing on the pre-fix code.

## 2026-10-27 — Copying without HTTPS, and a pairing that survives a lost token

**Fix** — the copy buttons did nothing on a phone over plain LAN HTTP: `navigator.clipboard`
only exists in a secure context, so the promise never settled. There is a `document.execCommand`
fallback now, and if the browser refuses even that, the block is selected and the panel says so.
Measured on `http://10.10.10.20:4319` (`isSecureContext: false`): the button reads *Copied*.

**Fix** — approval minted the token and the first collection deleted the pairing, so an agent that
wrote it to a scratch directory its sandbox wipes lost it forever and needed a fresh pairing. The
token is minted on first collection instead — no orphan if nobody collects — and the same code
returns the same token for the rest of its ten minutes, up to five hand-overs. The brief now tells
the agent to save it somewhere that survives and that re-collecting works.

## 2026-10-27 — Pairing: the token never enters the transcript

**Feature** — Settings → *Agent tokens* → **Pair an agent** prints a code and a prompt. The agent
claims the code (`POST /api/pair/claim`), gets `202` and **no token** until the writer approves in
Paddō, then collects its token on the next claim, which deletes the pairing. Codes are ten minutes,
in memory, and drawn without `I`, `O`, `0`, `1`.

**Fix** — the panel listed every pairing in the server's map, including ones still waiting, so a
stale pairing read as "it already happened". It shows only its own pairing, and only once claimed:
zero rows on start, zero for an unrelated code, one for its own.

**Fix** — the code printed three times (display, prompt, claim row). The claim row names the agent,
and the display is one muted line, kept for an agent that asks for the code mid-conversation.

## 2026-10-27 — The server is the MCP server

**Feature** — Paddō serves the agent's tools at `POST /mcp` (MCP streamable HTTP, stateless, one
server per request bound to the caller's token). Connecting a client is a URL and a bearer token:
nothing installed next to the agent, no version to keep in step. Minting prints the `mcpServers`
block with the URL taken from the request origin, and a second block — a prompt for the agent — for
clients that cannot register a remote server, naming the HTTP routes to use instead. `pnpm mcp`
wraps the same factory over stdio; both transports share `src/server/mcp.ts`, so they cannot drift.

## 2026-10-27 — Scoped agent tokens, create and export

**Feature** — a token carries verbs (`read`, `propose`, `create`) and either every document or a
checked list; only its SHA-256 is stored, the secret is shown once, revoking is deleting, and the
server enforces verbs and scope on every route. `PADDO_TOKEN` stays the machine's own key. A token
that creates a document gets it added to its scope, so an agent can read back what it dropped in.
MCP gained `create_document` and `export_document`; the API gained
`GET /api/documents/:slug/raw` (live markdown as an attachment, pending hunks excluded).

**Fix** — a request carrying both a session cookie and a token is the owner's session and is allowed
everything, so the scoping test judges a token from a cookie-free client.

## 2026-10-27 — The writing bar is a menu, and the header says what it is doing

**Feature** — the robot button became a document menu: *Invite the agent* and *Download markdown*.
The title is centred on the sheet, and the header holds one line at a time — *syncing document* while
the room connects, *synced* for 1.4s when it does, then the title — sliding up and out, clipped by
the sheet. A drop returns it to *syncing document* and the title only comes back when the room does.
The status setting (draft / editing / published) moved from the writing bar to the list's kebab.

**Fix** — `--muted` darkened to `#5b564d`: the meta line was 4.4:1 under a row's hover tint. The
accessibility test audits the list after its fade-in, because axe composites text against an
ancestor's opacity and read a half-transparent list as 4.05:1.

## 2026-10-27 — The skeleton is measured like prose

**Feature** — the skeleton loader returns to the article body and pulses: 12% ink, opacity 0.45 → 1
over 1.5s, each line a beat behind the one above, none of it under reduced motion.

**Fix** — its heading was 1.6rem at weight 600 against a 1.9rem weight-400 h1, and its bars were
13.6px on a 27.2px pitch. It now borrows the prose's own rhythm — `1.05rem` at `line-height: 1.75`,
two paragraphs with the same `1.1em` gap, each bar a flex child centred in a real line box — and
takes `padding: inherit`, because the hard-coded `2rem 1.5rem` was 12px out on every side below
40rem. Measured against the live text at 390px: title x 18.1 / y 95.7, first line x 18.1 / y 150.7,
identical in both states.

## 2026-10-27 — The list and the sheet

**Feature** — search in the header, real file rename so `.md` names follow titles, the floating
new-document button on phones.

**Fix** — the archive row sat five rems under the last article (stacked margins plus the list's own
clearance for the floating button), its rule was 21.5px narrower than the row rules, and a closing
border on the last row read as a double line. One line now, matched widths, and the clearance moved
to the page bottom. The floating button had inherited the header's `--radius-inner` and its icon
sizing, so it was a 9px square with muted ink; it is a 56px circle with the paper plus again.

## 2026-10-27 — The header measured in ink, not boxes

**Fix** — measured to the pixels that are actually painted (glyph bounds and the well's edge,
not padded element rects):

| | outer left | logo → well | well → gear | gear → plus | outer right |
|---|---|---|---|---|---|
| desktop | 17.8 | 14.1 | 14.1 | 20.6 | 18.4 |
| phone | 14.0 | 14.0 | 16.4 | — (FAB) | 14.0 |

Row gap 0.25rem, wordmark margin 0.58rem (0.75 on a phone), and the phone's icon buttons are
2.6rem rather than 2.75 — the two gaps either side of the well land at 14.1 / 14.1 on desktop
and 14.0 / 16.4 on a phone, with the outer edges at 17.8 / 18.4 and 14 / 14. On the phone the sheet
keeps 11.9px of air above and below the well.

**Fix** — a tap left the settings button wearing its hover fill: that fill is now behind
`@media (hover: hover)`, so a touch device never keeps it.

## 2026-10-27 — The wordmark a notch smaller

**Fix** — the wordmark drops from 1.32rem to 1.16rem of ink (20px tall, 17.5px on a phone), so
it sits with the field and the buttons instead of over them.

## 2026-10-27 — Concentric corners in the header

**Fix** — the field and the buttons used a 999px pill inside a 16px sheet, so the bar mixed two
shape languages. They take `--radius-inner` now (10px desktop, 9px on a phone), concentric with
the sheet's corners. On a phone the sheet also gained vertical air (0.42rem, 59px tall around a
44px field) and lost its right padding, since the gear's own 44px box provides it — measured:
14px left, 12px to the field, 19px to the gear, 11px right.

## 2026-10-27 — The header's paddings, rebalanced

**Fix** — three things were off: the wordmark sat 12px from the sheet's edge with the field
right behind it, the search field's own padding made the gap to the settings button read
twice its CSS value, and the bar was 53px tall around a 41px field. The sheet pads 18px on
the left (14 on a phone) and 6.5px top and bottom, the buttons are sized to their icons
instead of the touch target, and the field is 2.15rem — 44px again under `pointer: coarse`.
Measured on desktop: 18px left, 14px to the field, 19px to the gear, 14px right.

## 2026-10-27 — Flat chrome in the header

**Feature** — direction A, wired in: the sheet drops its hairline (a soft shadow does the
lifting), the search becomes a well rather than a framed pill — `--well`, a 4% ink tint in
light and a 22% black recess in dark, no border at all — and the two buttons in the bar go
borderless and muted until hover. The sheet is the only outlined object in the bar, so the
wordmark is the one strong mark in it.

## 2026-10-27 — The header is a floating sheet

**Feature** — the sticky header is a sheet of paper now: near-white
(`color-mix(#fff 62%, var(--bg))`, 8% in dark), 16px corners (14 on a phone), a hairline,
a soft two-layer shadow, and margin on all four sides. The page's top padding equals the
sticky offset (0.6rem, 0.45 on a phone), so the sheet does not jump when it starts
sticking, and the search field reads as a well in it because it keeps the page's paper
colour.

## 2026-10-27 — The stray line under the header

**Fix** — `.documents` opened with its own `border-top`, which read as a rule between the
sticky header and the first row, owned by neither. Rows already carry their separators, so
the list starts with space instead.

## 2026-10-27 — A sticky header, less padding, and a shadow that survives

**Feature** — the documents header sticks to the top, so the search field is reachable while
the list scrolls. Page padding drops from 3rem/5rem to 1.25rem/3rem and the bar itself runs
0.7rem top and bottom (0.55rem on a phone), with the safe-area inset respected.

**Fix** — `overflow-x: clip` on the root also clipped fixed overlays, which cut the floating
button's shadow in a hard line at the viewport edge. The guard is now `overflow-x: hidden` on
`html` plus `clip` on `body`: the drag is still stopped (a 2000px element cannot pan the
page) and the shadow paints in full.

**Fix** — the sticky bar had a `backdrop-filter`, which makes it the containing block for
fixed descendants: the floating button pinned itself to the bar (12px from the top) instead
of the viewport. The bar is opaque now, and the button is back at 17px from the bottom right.

## 2026-10-27 — The small type is sans

**Feature** — `--font-mono` is gone. Meta lines, labels, buttons, the search field, the hunk
rationale and the actions are all `--font-sans` now: a system stack
(`system-ui, -apple-system, Segoe UI, Roboto, …`), so nothing is downloaded for it. The app
has no code surface to justify a monospace, and the width it bought was the only thing it
gave in return.

## 2026-10-27 — One centre line in the masthead

**Fix** — the wordmark sat 4px above the row's centre: the SVG file's newlines became text
nodes inside the heading and built a line box around the drawing. The import collapses
them, and the heading keeps `font-size: 0` / `line-height: 0` so its height *is* the
drawing's. The search icon and clear button are pinned to the field's middle with
`top: 50%`, so the mark, the field, its icon, its text, the ✕ and the buttons all measure
the same centre line (74.4px desktop, 72.2px phone).

**Fix** — the wordmark is a touch smaller again (22px of ink at 1.32rem, 20px on a phone).

## 2026-10-27 — The wordmark is cropped to its ink

**Fix** — the SVG viewBox carried the font's full ascender and descender, so most of the
1.55rem box was empty space and the letters read small. `make-wordmark.py` now measures the
glyph bounds and crops the box to them, which makes the CSS height *the height of the
letters*: 24px of ink at 1.5rem, 21px on a phone.

## 2026-10-27 — The logo is outlines, and the fonts finally cover ō

**Fix** — the ō was never a `unicode-range` problem. `tools/fetch-fonts.py` now reads the
full fonts from the google/fonts repo instead of the CSS API: Google's subsets carry 227
glyphs (basic Latin, no macron, no double acute), the full font carries 567. Subset to the
Latin ranges prose needs and shipped as one woff2 per face, `ō`, `ő` and `ű` render in
Young Serif and Source Serif 4 alike — verified by glyph coverage and by eye.

**Feature** — the Paddō wordmark is an SVG (`src/web/assets/wordmark.svg`, generated from
the font outlines by `tools/make-wordmark.py`), filled with `currentColor`, so the logo
cannot fall back to a system serif whatever the browser does with fonts.

**Feature** — the search field moved into the masthead, between the wordmark and the
settings button, with a "search…" placeholder; the list keeps its full width.

## 2026-10-26 — Ghost hunks, and why they appeared

**Fix** — a rename made the file watcher diff the markdown against the CRDT and report a
suggestion that deleted two newlines: an open editor keeps an empty paragraph the file does
not have. Three changes close that class:

- `diffToHunks` drops any hunk whose sides differ only in whitespace, with a unit test.
- The watcher ignores an `add` event for a name that already has CRDT state — that is a
  rename, and the load path owns it. Hand edits (`change`) still become suggestions, which
  was verified by editing a file behind the editor.
- `renameDocument` moves the sidecar and the status file before the markdown, so the
  watcher can never see the file under its new name while the CRDT state is elsewhere.

Three blank hunks from the earlier renames were rejected out of the library.

## 2026-10-26 — The file name is the title

**Feature** — documents rename themselves on disk. When the last client leaves a room,
`afterUnloadDocument` compares the title with the slug and moves the markdown, the CRDT
sidecar and the status file to `slugify(title)`, picking `title-2` if that name is taken.
Temporary names stop leaking into the folder, so the files are readable from a shell.

The existing library was tidied through the same path: `new-draft-6` → `the-ghosted-story`,
`new-draft-5` → `another-test-article`, `new-draft-2` → `what-am-i-doing`, `new-draft` →
`wut-bruh`. The two documents still headed "New draft" keep their temporary names, which
is correct.

**Break** — an old `/d/<temp-slug>` bookmark 404s after the rename; the list links to the
current name.

## 2026-10-26 — Search looks at the title, not the slug

**Fix** — search also matched the slug, so "The Ghosted Story" turned up under `new`
because its file is still `new-draft-6.md`. The slug is a name the writer never chose and
never sees; search is title-only now. An e2e case pins it with a document titled
"Flux Capacitor…" whose slug is `flux-capacitor…`: the dashed form finds nothing.

## 2026-10-26 — Square rows, and fields iOS will not zoom

**Fix** — the row hover band lost its 8px radius: a rounded fill inside a ruled list read as
a stray shadowed card. The inset stays, so the text still sits off the container edge. Every
field now has 16px of text minimum — `max(16px, 1em)` on the inputs, 16px flat on the search
box — because iOS Safari zooms the viewport when a focused field is smaller.

## 2026-10-26 — Search over the list, and rows that breathe

**Feature** — a search field above the list filters by title (and slug, for documents
whose title has not caught up), with a clear button and a "nothing matches" line. It
filters the archive too, and the count in its summary follows.

**Fix** — the row hover tint used to start at the panel edge with the text almost on top
of it. Rows now carry 0.65rem of inset with an 8px radius, so the tint frames the row and
the title sits 14px inside it. Hover is scoped to `@media (hover: hover)`, because a
sticky tint on a phone reads as a selection.

## 2026-10-26 — The new-document button floats on a phone

**Feature** — below 40rem the plus leaves the header and becomes a 56 px ink circle in
the bottom-right corner, where a thumb actually is, with safe-area insets, a fade-in and
6.5rem of clearance under the list so the last row never hides behind it. Desktop keeps
it in the header beside the settings gear.

## 2026-10-26 — The disclaimer became an info box you can put away

**Feature** — the "Paddō does not run the model" paragraph is now the house notice:
accent tint, left rule, info icon, and a dismiss button. Dismissing hides it for good
(`localStorage`), and a small info button in the sheet header brings it back, so putting
it away is not a one-way door.

## 2026-10-26 — An axe pass, and the contrast it found

**Fix** — axe (WCAG 2.1 AA) over the list, the editor and the invite sheet in both themes:

- `.button--primary` was white on amber at **1.97:1** in dark mode. It is now an ink
  button — `--fg` fill, `--bg` text — which clears 4.5:1 in both palettes and stops
  "Copy prompt" from reading as a red/danger action.
- `.documents__meta` sat at 4.35:1 on a tinted row: `--muted` is a shade darker.
- The hunk buttons announced a name that did not contain their visible word; the
  explanation is a tooltip only now.
- The sheet's `<header>` made a second banner landmark, so the dialog scrambled the
  landmark tree; it is a plain `div`.
- The scrollable prompt could not be reached with the keyboard; it is focusable.

**Feature** — an e2e test runs axe on the list, a settled editor and the invite sheet in
both themes and fails on any serious or critical violation.

## 2026-10-26 — The guide is optional per invitation

**Feature** — the invite sheet carries a checkbox: include the writing guide or not, with
its word count alongside. Off, the prompt shrinks from 8 475 to 859 characters. The
choice is remembered in `localStorage`, so a writer who skips it once keeps skipping it;
the toggle only appears when a guide exists.

## 2026-10-26 — The invite sheet came back too

**Fix** — the same CSS surgery that cut `.bottombar` also took the whole `.sheet` block,
so the invite modal stopped being an overlay and rendered in the flow of the article,
several thousand pixels down the page. Restored from history, and both layouts now have
an e2e guard: the bar must be `position: fixed` and inside the viewport, the sheet must
be fixed and cover it. Both rules were silently missing, so nothing caught them before.

## 2026-10-26 — The bottom bar came back, and accept is green everywhere

**Fix** — when the two suggestion styles were folded into one, the CSS surgery cut the
`.bottombar` block along with the old chip rules, so the bar fell out of `position:
fixed` and sat at the end of the document: on a phone the Accept all / Reject all
buttons were off-screen behind the page, which is why they looked broken. The bar is
back — fixed, blurred, wrapping on narrow screens, the count truncating instead of
pushing — and it was verified fixed at 778–844 px with a passing hit test.

**Feature** — Accept is green wherever it appears. "Accept all" uses the new
`.button--accept` instead of the accent fill, so one colour means one thing: green
accepts, red rejects, accent edits.

## 2026-10-26 — What the Ghosted run taught the agent interface

**Fix** — three things came out of a real MCP session on a story with bold and a heading:

- `titleOf` kept inline markup, so the library showed `**The Ghosted Story**`. Titles are
  now stripped to the words a reader sees.
- `read_document` returns markdown, but `propose_edits` matches against the text, so an
  agent copying `**bold**` or a `#` got "not in the document verbatim" with no clue why.
  The read now ends with the rule, and the invitation says the same.
- A formatting-only change (dropping the bold on a heading) cannot be a suggestion at all,
  because the text is identical. The invitation now says to mention those in the reply.

## 2026-10-26 — Theme setting, and a page that stops wandering

**Feature** — Appearance in settings: system, light or dark. The choice is stored with
the guide in `.paddo/settings.json`, applied on click (no Save button), cached in
`localStorage` so a reload paints the right theme before React runs, and re-applied
from the server on the next device. Dark tokens are no longer a
`prefers-color-scheme` media query but `:root[data-theme='dark']`, with `color-scheme`
following the choice.

**Fix** — the page could be dragged and panned on a phone, and a long drag selected the
interface. `html` clips horizontal overflow, `body` turns off selection and the touch
callout, and the writing surfaces (`.prose`, inputs, the prompt) turn selection back on.

## 2026-10-26 — Settings, and a writing guide the agent has to follow

**Feature** — `/settings`, reached from the gear beside the new-document plus, holds
one field: the writing guide. It is stored in `.paddo/settings.json`, saved on demand,
and travels with every invitation — the copied prompt grows a
"Writing guide (from Paddō settings) — follow it:" block, so the agent edits in the
writer's voice instead of its own. Empty guide, no block. `buildInvitePrompt` moved to
`src/shared/invite.ts` so the prompt itself can be tested without React.

## 2026-10-26 — The hunk actions carry their meaning in colour

**Feature** — accept is green, reject red, edit accent, each as a soft tinted pill
that deepens on hover. The bottom bar follows: "Reject all" is the red action,
"Accept all" stays the filled primary. Dark mode gets its own red (`--danger`), since
the light one sat at about 3:1 against near-black.

## 2026-10-26 — One shape for every hunk

**Fix** — a suggestion rendered in one of two styles: a pill-inline chip for short
changes, a card for long ones. The chip had no rationale and no Edit, so a spelling
fix and a rewritten paragraph looked like two different features, and on a phone the
chip wrapped into a tall box with a dead gap. Every hunk now uses one anatomy — the
reason, the struck original, the replacement, then Accept / Reject / Edit — and only
its height changes with the length of the text. `isLargeSuggestion` is gone with the
branch that needed it.

## 2026-10-26 — Archived documents live in their own section

**Feature** — the list shows only what is being worked on. Anything set to archived
drops into a collapsed "Archived" section below it, with a count, and keeps its own
row actions. Opening an archived document and changing its status is the way back.

## 2026-10-26 — Archive and delete from the list

**Feature** — every row carries a kebab menu with the two actions that were missing:
archive (a status change, so reversible) and delete. Deleting asks once, in place,
then removes the markdown, the CRDT sidecar and the status file, and drops the live
room first so a connected editor cannot write the file back.

## 2026-10-26 — The macron in Paddō

**Fix** — the ō was drawn by a system serif. Google's webfont CSS splits each family
into `unicode-range` slices and declares the "latin" slice as stopping at U+00FF, but
the file it serves actually carries all of Latin. Honouring the declared range made
the browser refuse the glyph that was sitting right there in the font. Fonts are now
one file per face with no `unicode-range`, generated by `tools/fetch-fonts.mjs`, which
also drops three requests down to three.

## 2026-10-26 — Headlines in Young Serif

**Feature** — Fraunces is out and Young Serif is in, for the document headings, the
wordmark and the document list. Fraunces had become the house face of every AI side
project; Young Serif is a single weight, so the display rules ask for 400 and the H1
steps down a touch (1.9rem) to keep the extra chunk from shouting.

## 2026-10-25 — Library chrome: new draft, status flags, one sync icon

**Feature** — the document list loses its subtitle, the wordmark is smaller, and the
new-document button moves to the top right: one press makes an untitled draft and
opens it. Its name is its first heading — type one and the list and the top bar
follow — until then it is "New draft".

**Feature** — every document carries a status: draft, editing, published or archived,
picked from a small dropdown next to the agent button and shown as a label in the
list. Stored beside the document (`.paddo/<slug>.meta.json`), so the prose file stays
plain markdown.

**Feature** — the sync pill is now an icon: green check when synced, orange turning
sync while connecting, red cross when the socket is gone.

## 2026-10-25 — Faster open, and a placeholder while it happens

**Feature** — brotli/gzip on the wire (the editor bundle drops from 923 kB to about
270 kB) and a one-year immutable cache on content-hashed assets, with the shell kept
on `no-cache`.

**Feature** — the editor is a lazy chunk, so the document list paints without waiting
for ProseMirror, and opening a document shows a skeleton — top bar, title, pulsing
text lines — instead of an empty page while the bundle and the document arrive.

**Feature** — peer cursors are labelled by device ("Desktop", "Phone") rather than a
name that means nothing in a single-reader app.

**Fix** — other devices' selections were painted at 44% alpha from an inline style
and read as a mysterious highlighted block; they now use the house tint.

## 2026-10-25 — Working prototype

**Feature** — editor shell on the studio's paper: Source Serif 4 prose, Fraunces
headings, one measure, no toolbar. Italic, bold, headings, blockquote and links with
`⌘K`; no code blocks, no tables, no control panel.

**Feature** — documents are a library, not a single file: `content/*.md` listed at
`/`, each opened at `/d/<slug>` in its own Yjs room.

**Feature** — real-time sync through Hocuspocus sharing the app's single HTTP port.
Edits from one device land in the other's document without a save step.

**Feature** — persistence: the `.md` file stays the canonical prose, a `.paddo/*.y`
sidecar keeps the CRDT history that anchors need. Writes are atomic, normalized to one
trailing newline, and skipped when nothing changed.

**Feature** — auth before exposure: shared password, signed `HttpOnly` cookie,
constant-time comparison, login throttle, bearer token for machine clients, and the
server refuses to boot without its secrets. An unauthenticated WebSocket upgrade is
refused at the socket.

**Feature** — the agent's interface is an MCP server (`pnpm mcp`) with five tools.
Proposals are quote-anchored: the agent copies text, the server resolves it to a Yjs
relative position. Ambiguous quotes are refused.

**Feature** — inline review UI: struck original, thumb-sized chips for small edits,
cards with the full text and rationale for rewrites, and a bottom bar with
`N pending · Reject all · Accept all` on every screen size.

**Feature** — block moving by pick-and-place (⠿ grip, then tap the destination), one
transaction, one undo step, on desktop and touch alike.

**Feature** — file-watch ingest: an agent that edits the `.md` directly still produces
suggestions, and a store never overwrites an external edit it has not seen.

**Fix** — `ySyncPluginKey.getState()` returned undefined because the plugin key
object inside the editor is not the one the app bundle imports; suggestion
decorations never rendered. The plugin is now found by its stable string key.

**Fix** — suggestion buttons are handled by one delegated `pointerdown` listener;
per-button closures died when ProseMirror re-rendered the widget mid-click.

**Fix** — the diff no longer swallows untouched prose into a hunk, and an append at
the end of the document anchors instead of silently producing nothing.

**Fix** — the service worker registers only on a real HTTPS origin. On `localhost` it
served a precached app shell and hid every rebuild.

**Break** — the brief's desktop drag-with-ghost is replaced by pick-and-place for
every input: same single transaction, no HTML5 drag fighting ProseMirror, works with
a finger. Recorded in [ARCHITECTURE.md](ARCHITECTURE.md).

## 2026-10-25 — Phase 0: probes and ground truth

**Feature** — project scaffold: TypeScript, Vite, Fastify, Yjs/Hocuspocus, Tiptap,
pinned on Node 22.

**Feature** — markdown fidelity settled by measurement: `@tiptap/markdown` runs
headless with no DOM; overriding `Italic.renderMarkdown` to emit `_` makes the
round-trip byte-identical; files are written with exactly one trailing newline.

**Feature** — anchoring model settled: suggestions in a `suggestions` Y.Map, anchors
as Yjs relative positions against the `Y.XmlText` holding the quoted characters.
Verified across an edit elsewhere in the document and across an encode/decode cycle.

**Feature** — one-port architecture settled: Fastify owns the socket and invokes
Hocuspocus' upgrade listener.

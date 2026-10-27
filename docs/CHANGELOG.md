# Changelog

Reverse chronological. Tagged Feature / Fix / Break.

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

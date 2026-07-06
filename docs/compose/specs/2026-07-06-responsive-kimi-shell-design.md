# Responsive Kimi-style Shell Design

## [S1] Problem

The current WebUI has working protocol features, but the shell and chat surface still feel like a generic desktop chat layout squeezed onto phones. Mobile issues include crowded header controls, tall composer, toolbar wrapping, hover-only actions, dialogs without viewport-safe scrolling, and file-change panels appearing as desktop sidebars too early.

## [S2] Scope

This slice updates the presentation layer only. It must not change MiMo protocol routing, session ownership, workspace instance management, message send behavior, attachment encoding, permission/question API shapes, or store semantics.

In-scope files are frontend UI components such as `App`, `Header`, `Sidebar`, `Dialog`, `ChatArea`, `InputBar`, `MessageList`, `MessageBubble`, `PromptToolbar`, and `FileChangesPanel`.

## [S3] Visual Direction

Borrow Kimi Code's workbench feeling rather than clone its exact visuals:

- Calm shell background with subtle depth.
- Compact operational header.
- Workspace/session sidebar as a soft navigation panel.
- Chat canvas as the primary focus.
- Composer as an agent command center with clear modes.
- Runtime status, todos, diffs, and tools as compact chips/cards.

## [S4] Mobile Requirements

At mobile widths around 375px:

- Header controls must not overflow horizontally.
- Sidebar remains a drawer and closes after session selection.
- Dialogs fit within `100dvh` and scroll internally.
- Input composer must not consume excessive vertical space.
- Mode controls remain understandable and touchable.
- Message copy/session delete actions must not be hover-only.
- File changes panel should behave as an overlay/full-height sheet instead of a cramped fixed side column.

## [S5] Desktop Requirements

At desktop widths:

- Keep the efficient three-zone workbench: sidebar, chat, optional file panel.
- Do not let the file panel appear too early on medium widths.
- Keep chat readable with constrained max width and comfortable message spacing.
- Maintain existing status/todo/diff affordances.

## [S6] Verification

Required checks:

- `npm run typecheck -w web`
- `npm run build -w web`
- Browser smoke at `http://192.168.10.236:8090/` for desktop, tablet, and mobile viewports.
- Verify mobile can open sidebar, create/attach session dialogs, read chat, use composer, and open file changes without horizontal overflow.

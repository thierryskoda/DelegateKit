# Connect UI Primitives

Feature and route code should import Connect primitives from this folder, not
raw form controls directly. Keep the app's visual language behind this small
local layer instead of growing a broad design-system surface.

## Buttons

Use `Button` and `TextLink` from `button.tsx`. Do not style raw `<button>` in
feature code.

| Size      | Use                                                  |
| --------- | ---------------------------------------------------- |
| `md`      | Primary page actions (sign in, approve/reject)       |
| `sm`      | Toolbar icon actions (sign out, dismiss notice)      |
| `compact` | Dense toolbars and integration row actions           |
| `icon`    | Icon-only controls (disconnect, password visibility) |

| Variant     | Use                                                                          |
| ----------- | ---------------------------------------------------------------------------- |
| `primary`   | Main forward action                                                          |
| `secondary` | Alternate or destructive-adjacent outline action                             |
| `ghost`     | Low-emphasis cancel or close                                                 |
| `text`      | Text-only section actions (e.g. Connect new); no padding or hover background |
| `danger`    | Irreversible destructive actions when added                                  |

Use `TextLink` for underlined inline preview links, not `Button`.

## Modals

Use `ModalShell` from `modal-shell.tsx` for portal-backed dialogs and mobile
bottom sheets. Feature code should provide the title, description, content, and
actions, not duplicate backdrop, dialog, close-button, or portal markup.

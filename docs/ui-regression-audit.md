# UI restoration audit

Checked on 2026-10-07 against thread `23044de1-7e5f-497e-8f19-ec9ecc6aa6c9` and its final UI commit, `cf6da2a`.

The optimized preview had been built from a checkout that did not include that thread's later UI fixes. Browser checks reproduced cover line overlays, manager cards with zero radius and padding, accent-colored off switches, and a Gantt stage extending beyond the viewport. The auto-publish control was also absent.

## Restored behavior

- Covers on home, feed cards, and article pages have no decorative line overlays.
- Manager cards and fields have their rounded borders and insets, including fields in link dialogs and newsletter editors.
- Gantt fills the viewport. Its two scroll panes keep headings frozen and synchronize vertical rows. Custom scrollbars support pointer dragging and keyboard movement. The divider stays reachable on phones, and resizing a Hebrew pane retains the starting columns.
- Gantt task names have usable width, dates use compact text, and calendar, task, and roles popups escape clipping and appear above the full-screen timeline.
- Auto-publish appears below the recurring-update switch. Both switches have neutral off tracks and accent-colored on tracks. The explanation appears on hover and keyboard focus and describes successful files in a partial import accurately.

The initial restoration required removing responsive newsletter gutters from the full-viewport shell and adjusting the manager CSS specificity. The final branch now incorporates the UI thread's merged commit `212a71b`, including its Tailwind v4 upgrade. Against that base, `GanttEditorPage.tsx` and `scheduled-import.js` are unchanged, and `src/index.css` differs only by removing the external Google Fonts import in favor of the same self-hosted fonts. The full-viewport shell and explicit scrollbar opacity remain compatible with the merged styles.

## Validation

The T3 collaborative browser passed **124 checks** across English/light and Hebrew/dark desktop layouts at 1440 × 1000, Hebrew/dark at 390 × 844, and English/light at 320 × 800. Checks included real scrollbar dragging, keyboard scrolling, Hebrew wheel direction, pane resizing, full-screen popup placement, tooltip focus and Escape, label clicks, fields in link dialogs, and dark article/editor text. The saved import settings were not changed during these checks.

Build and changed-file lint passed, along with **61 regression tests, 45 loading tests, and 17 scheduled-import tests**. The isolated auto-publish backend test also passed; it uses synthetic documents and a disposable database and sends no mail. A new route regression checks that Gantt receives its full-viewport shell without responsive newsletter padding.

At this restoration checkpoint the initial JavaScript entry was **601,538 bytes**, only 174 bytes above the performance build. These measurements and the 124 browser checks are retained as observations of that checkpoint, rather than a rerun of every check after the final notification changes.

The final build is served on **port 4184** and its backend responds successfully. Final responsive action alignment, the shared profile header, grouped notification previews, reference avatar styling, and editor navigation guards are verified in [the notification preview audit](notification-preview-audit.md). The loading caches, summary API, and deferred editors and file libraries remain in place.

[Raw browser observations and the repeatable page probe](ui-regression-audit.json) retain all checks. One initial pane-resize probe incorrectly expected the leftmost scroll position in RTL; it is marked invalid and retained with its correction. The corrected probe checks the rightmost starting position and passes.

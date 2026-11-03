# TAUT Alpha design direction

- **Identity:** Charcoal surfaces, warm amber accent, purposeful hierarchy. No inherited Teams DOM.
- **Layout:** Narrow permanent navigation rail, resizable/collapsible conversations panel, flexible message canvas, optional contact detail panel.
- **Interaction:** Power-user command palette; keyboard-accessible sidebar resizing; functional search and mock composer.
- **Data boundary:** `src/lib/mock.ts` supplies demo conversations; `src/lib/graph.ts` is typed integration scaffolding only.
- **Accessibility:** Meaningful labels for controls; keyboard commands; visible focus outlines; accent is supplementary, not the only state indicator.
- **Security:** No browser-injected Teams DOM manipulation; no credentials; future OAuth in native secure layer.
- **Non-goals for Alpha:** Live Microsoft sign-in, real Teams send, meetings, file uploads, Graph HTML rendering, presence synchronization.

# Level Up HQ: design notes

Research, Nov 16 2026: 2026 dashboard trend round-ups (UX Pilot, Line25, DEV "SaaS dashboard design trends 2026"), KPI card patterns (SaaS UI "metric/KPI card UX patterns", Setproduct "Dashboard UI design"), and the Stripe / Linear / Vercel dashboard conventions those pieces cite. Plus Gavin's own brief (Instagram saves: code.xr Dashboard V15, ops + admin pattern).

The 8 patterns used, and why:

1. **Dark-first "command center", light V15 as the second mode.** Dark is the 2026 default for data tools because charts read cleaner on it. Gavin's saved V15 (white + orange) is the light mode. Toggle with T; the switch uses a view transition.
2. **Bento grid.** One modular grid: KPI tiles, a wide chart tile, a narrow "What's next" tile, then boards. It folds to one column on a phone without a separate layout.
3. **KPI card = value, delta, sparkline** (the Stripe card). Big number, small label, change vs last month, and an axis-less sparkline so a "+3%" that swung wildly doesn't look like a steady one.
4. **Density with quiet chrome** (Linear, Vercel). 13 to 14px body, thin 1px borders, no shadows-on-shadows, one accent. The data is the decoration.
5. **Command palette** (Linear / Vercel ⌘K). Press / or ⌘K to find any player by name or email and see plan, coach, paid-through, portal status. Number keys 1 to 6 jump to sections.
6. **Motion that explains, never decorates.** Count-up numbers, lines that draw in, bars that grow, cards that rise in once as they enter. Ease-out curves only. All of it switches off under prefers-reduced-motion.
7. **One live signal.** The "Synced 2 min ago" dot is the only thing that pulses, because it is the only thing that is live.
8. **Read-only boards for things in flight** (Gavin's admin pattern). Member setups (0 / 1 to 4 / 5 of 5 steps) and Renewals (due / ended / renewed) as columns of small cards, with a hover card for detail.

Brand rules kept: black #0A0A0A, orange #E87722 as the single accent (#C85A00 for pressed/hover), gold #F5A623 not used as a second accent, Bebas Neue + Montserrat only, no icon tiles, no generic glows, no arrows on every button, no em dashes in copy.

Security: the site is public, so it holds no data. A viewer signs in with Google; the page reads the Level Up HQ sheet with that viewer's own read-only access. Anyone without access to the sheet sees nothing. The token lives in memory only.

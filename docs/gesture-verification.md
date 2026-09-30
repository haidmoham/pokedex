# Gesture verification

The horizontal threshold/momentum lock was replaced by a native CSS scroll-snap gallery. Native wheel/touch displacement, inertia and snapping stay with the browser. Selection follows `scrollend`, not a wheel threshold or navigation timeout. Mouse dragging follows displacement and delegates release snapping to the browser; cancellation restores the selected artwork. Older engines without `scrollend` retain pointer-release selection and direct buttons/keyboard; horizontal wheel scrolling is disabled there rather than leaving selection stale. Vertical native snap settings are unchanged; the ancestor now permits both native pan axes and pinch zoom.

Only the selected model mounts. During movement it pauses, neighbors use posters, and intermediate frames carry their own credits while the selected caption is hidden. Index changes prepare at most the visual center and its two neighbors, plus the selected frame. No wheel-phase heuristic claims to identify hardware momentum. Model Inspect locks both axes of feed navigation while preserving model controls.

Prior art: [W3C Scroll Snap](https://www.w3.org/TR/css-scroll-snap-1/#snap-concepts) leaves snap physics to the browser. [Chrome scrollend](https://developer.chrome.com/blog/scrollend-a-new-javascript-event) describes actual completed scrolling, including touch release and snapping, unlike a pause inferred from a timeout. [Pointer Events touch-action](https://www.w3.org/TR/pointerevents4/#the-touch-action-css-property) governs native pan ownership. Browser automation and synthetic input are separate from physical trackpad evidence.

## Repeatable checks

`npm test` replays gallery selection guards, offsets at 320/390/1470 widths, fractional boundaries and overscroll, programmatic restore/resize/panel interruptions, immediate repeated/reverse selection, progressive pointer displacement, dominant/ambiguous diagonals, wrong-pointer input and cancellation. It also checks species URL replacement, stable visits/trails, source failure/retry and model budgets. These pure tests do not exercise browser scroll physics.

Use supported Chrome CUA in a dedicated tab. Record exact preview SHA, viewport in CSS pixels, before/intermediate/settled artwork ID and credit, species ID, URL, focus and any console error. Do not disable animation for motion evidence. Current CUA may expose coarse scrolls/mouse drags rather than precise hardware wheel traces or touch injection; mark those cases unverified.

| Browser sweep | Acceptance |
| --- | --- |
| Slow horizontal drag, partial release, reverse before settle | Intermediate movement visible, adjacent frame credit correct, clean native snap; no cooldown |
| Horizontal wheel, decreasing tail, immediate reverse/repeated scroll | Continuous native displacement; no app threshold jumps; selection matches settled frame |
| Vertical scroll with X noise; 15/45/75-degree input; alternating axes | Vertical order intact; nested scroll ownership reviewed rather than inferred from pure tests |
| Pixel/line/page/fractional wheel and pinch/modifiers | Native normalization and zoom; no app-generated navigation from pinch |
| First/last artwork and source exhaustion | No wrap, invented art or automatic discovery; explicit continuation/retry remains available |
| Pointer cancel/lost capture, second finger, mid-drag departure | No stale navigation/click; exact committed identity restored where cancellation belongs to custom drag |
| Search/filter sheet edges, Escape, close/reopen and browser Back | Sheet scroll/focus independent; exact committed feed artwork preserved |
| Inspect rotation, wheel, search overlay, exit and species departure | Model owns input; no gallery/species changes from rotation; exact focus/history restored |
| Keyboard arrows/Home/End, focused search/select/textarea | Direct navigation works; editable controls retain their input |
| Resize/reduced motion, failed art and recovery | Identity stable; reduced-motion release is immediate; unavailable art is retryable |
| 320×740 Inspect side view; desktop tall card | Tail and controls fit; Share does not overlap art |
| #150→#151, reload and Back | Address follows visible species using replacement, without per-scroll history entries |

## Evidence status

Independent Chrome QA of `d5fe9a0` confirmed a natural animated default idle, search/filter fit and basic synthetic reversal/Inspect behavior. Its reports found clipped side-view tail, desktop Share overlap and stale URL; this revision addresses them but needs fresh deployed browser checks. That earlier evidence does not validate this new native gallery. Physical trackpad inertia, real touch and sustained phone performance remain separate acceptance gates. No recording or GPU disposal measurement is claimed.

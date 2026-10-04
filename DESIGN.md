# Design token plan

The brief asks for two passes before any code: first a compact token plan, then a review of that plan against the brief, revising anything that reads as a default. Both passes are kept here so the reasoning is visible.

## Pass 1 (draft)

- **Palette:** night background `#0A1020`, a single amber accent `#FFB547` for CTAs and highlights, cool blue `#4FA3FF` for scene light, and a cream page `#F4F1EA` for the reading sections.
- **Type:** a high-contrast serif for headlines and Inter for body text.
- **Spacing:** 8px scale.
- **Radii:** 12px on everything, with cards for the steps, risks and FAQ.
- **Motion:** 3D scrub for the intro, plus a fade-up on each section as it enters.

## Pass 1 review against the brief

| Draft choice | Problem |
|---|---|
| Cream page + serif headline | This is the first AI tell on the brief's list. |
| Near-black + one amber accent on every CTA | This is the "near-black with a single accent" tell, with amber in place of acid green. Using the accent as general decoration also wastes its meaning. |
| 12px radius on everything, plus cards | Identical rounded cards and one radius everywhere are both on the tell list. |
| Fade-up on each section | Explicitly banned. The 3D zoom must be the only orchestrated motion. |
| Inter | Not wrong, but it is the default, and it says nothing about infrastructure. |

## Pass 2 (final)

### Color: two grounds, and an accent that means something

Amber is **reserved for "your share"**. It is the glowing module in beat 5 and in the static silhouette, and `share-700` marks the "you're on the list" confirmation. It never decorates. CTAs use ink and paper instead.

| Token | Value | Use |
|---|---|---|
| `night-950` | `#07142B` | Intro ground. Deep blue-ink, lit by the scene, not flat black. |
| `night-800` | `#12264A` | Fog and haze in the scene, and the footer |
| `rack-400` | `#5AA8FF` | Scene light: aisles, LEDs, circuit traces (WebGL only) |
| `share-400` | `#FFB547` | "Your share". Used on dark grounds only. |
| `share-700` | `#8A5300` | The share marker on light grounds (≥ 4.5:1 on paper) |
| `paper` | `#F3F5F7` | Reading ground: cool, slightly blue-grey, not cream |
| `surface` | `#FFFFFF` | Form panel and disclaimer block |
| `ink` | `#0D1626` | Body text and primary buttons (~16:1 on paper) |
| `ink-muted` | `#46526A` | Secondary text (~7:1 on paper) |
| `rule` | `#C9D1DC` | Hairlines that separate content instead of cards |
| `focus` | `#1F4FE0` on light / `#FFFFFF` on dark | 3px outline with a 2px offset. Treated as accessibility, not decoration. |
| `danger` | `#B42318` | Inline validation |

### Type: an editorial grotesk with a width axis, and an engineering body face

- **Display:** **Archivo** variable (weights 100–900, width axis 62–125). Intro headlines use condensed weight 800 at large sizes; section heads use the normal width at weight 750. This gives Awwwards-style bulk without a serif.
- **Body:** **IBM Plex Sans** at 400 and 600, an engineering voice that suits infrastructure.
- **Data and labels:** **IBM Plex Mono** at 500, for step numerals and the form's range values. Sentence case, no letter-spacing tricks.

All fonts are self-hosted via Fontsource. No third-party font requests means no extra IP sharing to disclose in the privacy policy.

| Step | Size | Line-height / tracking |
|---|---|---|
| `display` | `clamp(3rem, 1rem + 8.5vw, 9.5rem)` | 0.9 / -0.025em |
| `h2` | `clamp(2.25rem, 1.2rem + 4vw, 4.75rem)` | 0.98 / -0.02em |
| `h3` | `1.375rem` | 1.25 |
| `body-lg` | `1.25rem` | 1.55 |
| `body` | `1.0625rem` | 1.6 |
| `small` | `0.9375rem` | 1.55 |
| `mono` | `0.875rem` | 1.4 |

Reading measure is capped at 64ch.

### Spacing

- 4px base. Used steps: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
- Section padding: `clamp(5rem, 3rem + 8vw, 10rem)` top and bottom.
- Side gutter: `clamp(1rem, 4vw, 3rem)`.
- 12-column grid; content sits asymmetrically (heads in columns 1–4, body in 5–11) so every section has a focal edge rather than centered blocks.

### Radii: chosen per job, not one value everywhere

| Element | Radius | Why |
|---|---|---|
| Sections, rules, disclaimer block | 0 | Structural and editorial |
| Inputs and buttons | 3px | Crisp, technical |
| Header "Join the list" button | 999px | The one pill; it floats over the 3D scene and has to read as a distinct control |
| Shadows | none | Separation comes from rules and ground changes |

### Motion: one orchestrated moment

- **Intro:** the 3D camera is scrubbed to scroll. Beat headlines swap with a 500ms clip-reveal, tied to the beat rather than to sections.
- **Everything else:** no entrance animation. Hover and focus transitions are 140ms `cubic-bezier(.2,.7,.2,1)`. FAQ uses native `<details>` with an instant toggle.
- **Reduced motion:** WebGL is never loaded. The intro becomes a static SVG silhouette (with the amber "your share" segment) and the five headlines stacked in order. Lenis is disabled.

### Copy guard (hard rules)

The UI uses "join the list", "register interest" and "get notified". It never uses "invest today", "buy in", "guaranteed", "risk-free" or "passive income". There are no percentages and no charts. Buttons carry no appended arrows.

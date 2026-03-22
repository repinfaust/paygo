# Design System Specification: Editorial Energy

## 1. Overview & Creative North Star
This design system is built on the Creative North Star of **"The Responsive Monolith."** 

Unlike generic utility apps that feel like a collection of floating widgets, this system treats the interface as a singular, cohesive architectural object. We move away from the "template" look by using **intentional asymmetry**, high-contrast typographic scales, and tonal depth. The goal is to provide a premium, editorial experience where the data doesn't just sit on the screen—it inhabits it. 

The modular architecture allows for four distinct regional identities to emerge from a shared structural foundation, ensuring that whether a user is in London, Dublin, or Chicago, the experience feels locally rooted yet globally sophisticated.

---

## 2. Colors & Surface Philosophy
Color is not just an accent; it is a structural tool. We utilize the Material Design Tiers to create a sense of physical layering.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders to section content. Boundaries must be defined solely through:
1.  **Background Color Shifts:** Placing a `surface-container-low` element against a `surface` background.
2.  **Vertical Whitespace:** Using the spacing scale to create rhythmic separation.

### Surface Hierarchy & Nesting
Treat the UI as a series of stacked sheets of fine paper.
*   **Base:** `surface` (#fff8f3)
*   **Low Importance:** `surface-container-low` (#fcf2e8)
*   **High Importance/Nesting:** `surface-container-high` (#f0e7dd)
*   **Floating Elements:** `surface-container-lowest` (#ffffff)

### The "Glass & Gradient" Rule
To elevate the "Ember," "Solas," and "Pulse" themes beyond flat UI:
*   **Glassmorphism:** Use `surface` colors at 80% opacity with a `20px` backdrop-blur for floating headers or navigation bars.
*   **Signature Gradients:** For primary CTAs, use a subtle linear gradient (135°) transitioning from `primary` (#855000) to `primary-container` (#a76500) to provide a tactile, "lit-from-within" quality.

---

## 3. Typography
Our typography scale is designed to feel like a high-end magazine, utilizing extreme contrast between Display and Body tiers.

| Role | Token | Font Family | Size | Character |
| :--- | :--- | :--- | :--- | :--- |
| **Display** | `display-lg` | Newsreader | 3.5rem | Elegant, serif, authoritative. |
| **Headline** | `headline-md` | Newsreader | 1.75rem | Used for section storytelling. |
| **Title** | `title-lg` | Work Sans | 1.375rem | Clean, functional, modern. |
| **Body** | `body-md` | Work Sans | 0.875rem | Highly legible, neutral. |
| **Label** | `label-sm` | Work Sans | 0.6875rem | All-caps, wide tracking (0.05em). |

**Theme Overrides:**
*   **Ember (UK):** Forces `headline` and `display` tiers to Georgia (or Newsreader) for a "Trust-First" legacy feel.
*   **Solas (IE):** Switches all tiers to a clean Sans-Serif for a "Community-Rooted" simplicity.
*   **Pulse (US):** Forces `display-lg` to Arial Black with -0.04em letter spacing for a "Tech-Forward" impact.

---

## 4. Elevation & Depth
Depth is achieved through **Tonal Layering** rather than traditional drop shadows.

*   **The Layering Principle:** Place a `surface-container-lowest` card on a `surface-container-low` section. This creates a soft, natural lift that mimics heavy-stock paper.
*   **Ambient Shadows:** For high-elevation elements (like a top-up modal), use an extra-diffused shadow: `0px 12px 32px rgba(on-surface, 0.06)`. Never use pure black (#000) for shadows; always use a tinted version of `on-surface`.
*   **The "Ghost Border" Fallback:** If accessibility requires a border, use the `outline-variant` token at **15% opacity**. Total opacity borders are strictly forbidden.

---

## 5. Components

### Buttons
*   **Primary:** Uses the "Signature Gradient." Roundedness: `lg` (0.5rem). 
*   **Secondary:** No background. Uses a "Ghost Border" and `primary` text.
*   **Tertiary:** No border, no background. Heavy `label-md` styling for high-action clarity.

### Cards (The Energy Tile)
*   Forbid divider lines. 
*   Separate the "Current Balance" from "Usage History" by shifting the inner container from `surface-container-low` to `surface-container-highest`.
*   Apply `xl` (0.75rem) roundedness for a friendly, modern hand-feel.

### Chips (Region & Status)
*   Used for "UK Market," "Ireland Market," etc.
*   Background: `secondary-container`. Text: `on-secondary-container`.
*   Shape: `full` (pill-shaped).

### Input Fields
*   Floating label design using `label-md`. 
*   Focus state: Use `primary` for the bottom stroke (2px) but no full-box border.
*   Error state: `error` (#ba1a1a) text with an `error-container` soft background fill.

### Data Visualization (Pulse Theme Specific)
*   Utilize "EKG" waveform lines for energy usage. 
*   Use `tertiary` (#006387) for "Off-Peak" and `primary` for "Peak" usage to create an immediate visual hierarchy of cost.

---

## 6. Do's and Don'ts

### Do:
*   **Do** use asymmetrical layouts (e.g., a display headline aligned left with body text indented to the center).
*   **Do** embrace negative space. If a screen feels "full," use the Spacing Scale (Token 12 or 16) to force breathing room.
*   **Do** use high-quality transitions. Tonal shifts should fade in (200ms ease-out).

### Don't:
*   **Don't** use 1px solid black or grey borders.
*   **Don't** use standard Material shadows. They are too aggressive for this editorial aesthetic.
*   **Don't** mix serif and bold sans-serif in the same hierarchy level. Stick to the theme overrides.
*   **Don't** use dividers. If you need to separate content, use a background color change from `surface` to `surface-variant`.
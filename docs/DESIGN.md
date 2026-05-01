# Design System Specification: The Grounded Precision

## 0. Stack

nextjs + tailwind 4 + shadcn 

## 1. Overview & Creative North Star

### Creative North Star: "The Cultivated Horizon"
This design system rejects the clinical coldness of traditional SaaS in favor of "The Cultivated Horizon"—a philosophy that blends the raw, tactile nature of agriculture with the sharp, uncompromising precision of modern data science. 

We are moving beyond "standard" UI. This system avoids the generic "boxed-in" look by utilizing intentional asymmetry, expansive breathing room, and a sophisticated editorial layout. We treat data not just as numbers, but as a harvest—organized, valuable, and clear. By using high-contrast typography scales and tonal depth, we ensure that whether a worker is looking at a high-glare clocking station at dawn or a manager is reviewing yield reports in an office, the experience feels authoritative and premium.

---

## 2. Colors

The palette is rooted in the earth but refined through a digital lens. It balances deep, fertile greens (`primary`) and loamy browns (`secondary`) with a high-contrast neutral foundation.

### The "No-Line" Rule
To achieve a high-end, custom feel, **1px solid borders for sectioning are strictly prohibited.** Boundaries must be defined through background color shifts. For example, a dashboard sidebar using `surface-container-low` should sit directly against a `background` workspace without a dividing line. The eye should perceive the change in "altitude" via color alone.

### Surface Hierarchy & Nesting
Treat the UI as physical layers of fine paper. 
- **Base Level:** `surface` (#fafaf5) is your canvas.
- **Sectioning:** Use `surface-container-low` (#f4f4ef) to group large layout areas.
- **Interactive Layers:** Use `surface-container-lowest` (#ffffff) for the highest-focus items, such as data entry cards, to make them "float" naturally.

### Glass & Gradient Rules
- **The Glass Effect:** For floating notifications or mobile navigation overlays, use `surface-variant` with a 70% opacity and a `20px` backdrop-blur. This ensures the earthy background tones bleed through, keeping the UI feeling integrated with the environment.
- **Signature Textures:** Use a subtle linear gradient (Top-Left: `primary` to Bottom-Right: `primary_container`) for primary action buttons. This adds a "soul" to the UI that flat color cannot replicate, mimicking the way light hits a leaf or tilled soil.

---

## 3. Typography

We use **Public Sans** across the entire system. It is a workhorse typeface—neutral enough to be functional, but geometric enough to feel modern.

*   **Display (lg/md/sm):** Used for "Hero" stats (e.g., total harvest weight). These should be tracked tight (-2%) to feel like a premium editorial headline.
*   **Headline & Title:** Used for page headers and section titles. Use `headline-lg` to announce a new module. These are the "anchors" of your layout.
*   **Body (lg/md/sm):** Reserved for instructional text and descriptions. `body-md` is our standard for maximum legibility.
*   **Labels (md/sm):** Crucial for clocking stations. Use `label-md` in all-caps with increased letter spacing (+5%) for data headers to ensure they are readable in low-light or high-glare outdoor conditions.

---

## 4. Elevation & Depth

We convey hierarchy through **Tonal Layering** rather than traditional structural lines or heavy drop shadows.

*   **The Layering Principle:** Depth is achieved by "stacking." A `surface-container-lowest` card placed on a `surface-container-high` section creates a natural lift.
*   **Ambient Shadows:** When an element must float (like a modal), use an ultra-diffused shadow: `color: on_surface (8% opacity), blur: 40px, y: 8px`. Never use pure black shadows; they feel "dirty" on earthy tones.
*   **The Ghost Border Fallback:** If accessibility requires a container boundary in low-contrast scenarios, use a "Ghost Border": `outline_variant` at 20% opacity. This provides a hint of a container without breaking the editorial flow.

---

## 5. Components

### Buttons
- **Primary:** Gradient from `primary` to `primary_container`. Text: `on_primary`. Roundedness: `md` (0.375rem).
- **Secondary:** Solid `secondary_fixed`. Text: `on_secondary_fixed`.
- **Tertiary:** No background. Text: `primary`. Hover state uses `surface_container_low`.

### Chips
- Use `primary_fixed` for active filters and `surface_variant` for inactive. This creates a clear visual "on/off" state that is accessible for field workers.

### Input Fields
- **Background:** `surface_container_highest`.
- **Active State:** A 2px bottom-bar using `primary`. No full-frame border.
- **Error:** Use `error` text with an `error_container` background tint to ensure the warning is unmissable even on a dusty tablet screen.

### Cards & Lists
- **Strict Rule:** Forbid the use of divider lines. 
- Use the **Spacing Scale** (vertical white space) to separate list items. For complex data lists, alternate row backgrounds between `surface` and `surface_container_low`.
- **Agricultural Context:** For "Status" indicators (e.g., Irrigation On/Off), use `tertiary` for "active" and `outline` for "idle" to avoid the standard Red/Green "traffic light" cliché, creating a more sophisticated palette.

---

## 6. Do's and Don'ts

### Do:
- **Prioritize "The Breathe":** Use generous margins. High-end design is defined by the space you *don't* fill.
- **Use High Contrast:** Ensure `on_surface` text sits on `surface` backgrounds with at least a 7:1 ratio for field readability.
- **Intentional Asymmetry:** If a dashboard has three cards, consider making the primary metric 2/3 width and the others 1/3 to break the "standard grid" feel.

### Don't:
- **Don't use 1px Borders:** As stated, use color shifts to define containers.
- **Don't use Pure Black:** Always use `on_surface` (#1a1c19) for text to maintain the earthy, organic tone.
- **Don't Crowd the UI:** If a user is at a clocking station, their fingers might be dirty or gloved. Ensure all interactive targets are at least `48px` tall.

---

**Director's Note:** This system is about the balance between the dirt of the field and the precision of the cloud. Keep it grounded, keep it clean, and never settle for a "default" layout.
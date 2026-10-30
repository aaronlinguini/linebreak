# Trying the film response

This page compares a new Reduced overlap trial with the saved Current addition, Revised smooth, the saved smooth-exposure treatment, and the supplied film-inspired proposal. It does not replace the public renderer or change the Google archive connection.

The exact supplied [proposal](references/supplied-proposal.md) and [original film.js code](references/supplied-film.cjs) are preserved as reference material. The proposal's installation instructions describe the other prototype; use the local comparison instructions below for this website.

## Use the comparison page

Open `local-test.html` with VS Code's Live Server and choose two photographs. Both outputs use the same photographs, portrait rotation, full-frame fitting, dimensions, and JPEG export.

- The left reference is the saved Current addition at **0 EV for both photographs** and **contrast 12**, matching the version saved before this trial.
- The adjustable result starts with **Reduced overlap (trial)**, at **0 EV for each photograph**, **contrast 12**, and **Haze reduction 20%**, matching the approved screenshot preset. Black and white starts enabled by the artist configuration; all optional tone controls start at zero.
- Haze reduction appears only for Reduced overlap. Its range is 0–100% in steps of 5. Higher values reduce overlapping light in shadows, midtones, and highlights; black still reveals the other photograph. At 0%, matching exposure, contrast, and colour settings reproduce the saved Current treatment.
- Choose Reduced overlap, Current + contrast, Revised smooth, Saved smooth exposure, or the earlier Film curve, then move the base and participant exposure sliders separately. The range is −3 to +2 EV in half-stop steps. −1 EV halves that photograph's estimated exposure; +1 EV doubles it.
- The black-and-white control starts from the artist's configuration and can be changed temporarily for the comparison. It affects both outputs.
- The Contrast slider appears for Current + contrast and Reduced overlap, and ranges from 0 to 30. It changes only the right preview. The left stays at contrast 12; contrast zero on the right removes that tonal adjustment.
- Use the visible **Tone adjustments** sliders for optional Shadows, Highlights, Mids, Whites, and Blacks controls. Positive values brighten the selected range; negative values darken it. **Reset tones** clears only these five controls.
- Reset trial restores Reduced overlap, Haze reduction 20%, contrast 12, 0/0 EV, and all five tone controls to zero. It preserves your colour choice. Download either result and the settings record before changing photographs if you want to keep the comparison.

Nothing on this page is uploaded or automatically archived. Original files are unchanged.

## Compare one change at a time

Keep the same photo pair and colour choice while trying these combinations:

| Adjustable renderer | Base EV | Participant EV | What it helps assess |
| --- | ---: | ---: | --- |
| Reduced overlap, Haze reduction 20%, contrast 12 | 0 | 0 | Approved starting preset with all tone controls at zero |
| Reduced overlap, Haze reduction 100%, contrast 12 | 0 | 0 | Strongest overlap suppression; darker shared shadows and less mixing over bright areas |
| Reduced overlap, Haze reduction 50%, contrast 12 | 0 | 0 | A gentler reduction of overlapping light |
| Reduced overlap, Haze reduction 0%, contrast 12 | 0 | 0 | Exact agreement with the saved left result |
| Current + contrast, contrast 12 | 0 | 0 | The saved method and fixed reference |
| Current + contrast, contrast 0 | 0 | 0 | Original addition without the saved contrast adjustment |
| Current + contrast, contrast 0 | −1 | −1 | Exposure reduction alone |
| Film curve | 0 | 0 | Response change at the reference exposure |
| Film curve | −1 | −1 | Response change at the same reduced exposure |
| Revised smooth | 0 | 0 | Shadow/midtone detail and reduced contribution in bright overlaps |
| Saved smooth exposure | 0 | 0 | Direct comparison with the previous experiment |
| Revised smooth | −1 | −1 | The revised overlap rule with reduced source brightness |
| Saved smooth exposure | −1 | −1 | The saved response with a reduced total exposure |

Then try −0.5 EV or adjust the photographs independently. Reduced exposure also darkens areas where only one photograph contributes, so −1/−1 is a starting point rather than a universal correction. Automatic brightness normalization is not enabled: it could brighten intentionally dark silhouettes.

Use several pairs: a silhouette, two scenes with many midtones, almost-white and clipped-white highlights, colour photographs, and a digital photograph paired with a scan. Judge shadow depth, how much detail survives in bright areas, colour, and overall contrast. Numerical tests alone cannot establish a convincing analogue appearance. The supplied model has not been calibrated to the artist's film stock or scanning process.

## Current addition with adjustable contrast

This saved treatment reuses `ExposureMath.createMixer` and its existing contrast curve. Each matching pixel is combined by the Current additive method. The Contrast slider then changes the finished channel values through a continuous curve that fixes black, white, and middle gray. Positive values darken tones below middle gray and lighten tones above it. The default is 12, with a local-page range of 0–30. This gives the artist a separate contrast adjustment without choosing a smooth overlap rule that suppresses more of one source's detail.

At contrast 12 and matching exposure/colour settings, it reproduces the left saved Current reference. Contrast is saved as `settings.contrast` in the downloaded recipe, using the existing `linear-addition-c6a65ba` renderer version. Switching to a smooth or film treatment hides the contrast control and gives that treatment neutral contrast; its own algorithm is preserved.

Contrast can make existing differences more visible, but it also compresses subtle shadow/highlight tones and cannot reconstruct highlights already clipped by additive processing. This is a visual contrast adjustment, not a calibrated analogue-film model. It retains source-order symmetry. The public page has no new slider.

## Reduced overlap trial

The trial decodes sRGB and applies separate EV multipliers as Current does. For each matching linear RGB channel, let `M` be the brighter adjusted value and `m` the darker. Haze reduction selects `p = 1 + 3 × balanceStrength / 100`; the combination is `M × (1 + (m / M)^p)^(1 / p)`, or zero when both inputs are black. This is a stable form of `(A^p + B^p)^(1 / p)`. Colour encodes the three combined channels through the existing contrast curve. Black and white first combines all three RGB channels by that same rule, then calculates `Y = 0.2126R + 0.7152G + 0.0722B` from the combined linear values before contrast and encoding. This retains colour-channel distinctions during overlap instead of collapsing each source to gray first. It uses the unclipped combination, so it is not necessarily identical to converting an already clipped colour JPEG to gray.

At 0%, the code dispatches the original Current mixer directly, preserving exact pixels and rounding. At higher values, extra overlapping light decreases continuously in **every tonal region**, including midtones. At 100%, `p = 4`, giving stronger local brightness dominance. The effect does not favor the first or second photograph. A source against black keeps Current's EV and contrast treatment. Increasing the control cannot brighten a pixel relative to a lower setting with the same inputs, EV, contrast, and colour choice.

This removes the preceding trial's arbitrary dark-overlap boost. Dark plus dark can remain dark while a bright subject registers clearly in a dark area of the other photograph. It does not follow that two exposures should darken the positive image below the brighter source: adding light cannot do that under a monotonic response. The new result is darker **than addition**, with the separate contrast adjustment applied afterward.

The settings download retains the internal `balanceStrength` field, renderer version `overlap-suppression-v2`, and model constant `maximumPower: 4`. Current + contrast and all three earlier experimental treatments remain unchanged and selectable.

This is a visual approximation for finished photographs, not a measured emulsion response or a physical exposure sum. It can suppress similarly bright midtone detail as well as unwanted haze, so compare 0%, 50%, and 100% before choosing a strength. Colour is processed per channel; a bright area can still retain a colour tint. A JPEG cannot reveal the original scene exposure or film/development/scan response. Judge the light-table, skull, and colour pairs visually before replacing the public treatment.

## Optional finishing controls

The **Tone adjustments** sidebar beside the trial adds five −100 to +100 sliders: Blacks, Shadows, Mids, Highlights, and Whites. They adjust the finished trial after the selected exposure mixer and its contrast curve, without changing that mixer's calculation. All five at zero return the original mixer directly, so there is no added pixel pass or rounding difference. The left reference remains untouched.

Positive values brighten a range and negative values darken it. A smooth, monotonic curve shifts near-black, shadow, middle, highlight, and near-white brightness anchors at 0.05, 0.22, 0.5, 0.78, and 0.95. The curve joins these anchors and fixes pure black and pure white. These are broad, related tonal controls; they do not reproduce Lightroom's algorithms or recover clipped information.

The finishing stage measures weighted brightness from the encoded sRGB output, not linear scene luminance. Colour follows one shared movement toward black or white, keeping neutral grays neutral and channels within range; brightening can reduce saturation. This is separate from the Reduced overlap mixer's RGB-first monochrome conversion.

**Reset tones** returns only the five tone controls to zero and preserves treatment, Haze reduction, EV, contrast, and colour choices. **Reset trial** restores the approved starting treatment at Haze reduction 20%, contrast 12, 0/0 EV, and zero tones, while preserving the colour checkbox. The controls work with all local treatments. A tone slider repaints the trial and updates its readout while moving, without recomposing the photographs. Each edit starts from the cached neutral image rather than the previously adjusted result. The JPEG export is debounced briefly during dragging and committed immediately on release; download and rotation controls wait until the export matches the visible preview. The settings download records `settings.tones` and a separate `postProcessing` entry with version `tone-curve-v1` and the five values matching the completed export. Stale JPEG callbacks cannot replace a newer edit. The reference has no tone settings or postprocessing entry.

`tone-adjustments.js` is loaded only by the local comparison page. It is excluded from the seven public website files and does not alter archive rendering.

## Finished-image rotation

**Rotate 90°** beside the right result rotates the cached neutral result clockwise, reapplies the current tone controls, then commits the trial preview and export together without developing another pair. The preview and JPEG download use the selected orientation. The fixed left reference is untouched. Rotation survives tone, EV, colour, and treatment edits and Reset tones; selecting a new photo or Reset trial returns to zero. The recipe records `trial.rotationDegrees` (0, 90, 180, or 270), width, and height. Nothing is uploaded from the local page.

The public page also offers Rotate 90° for the preview and download. Its archive retains the originally created orientation; clicking Rotate does not create another archive copy.

## The revised smooth trial

The revision keeps each photograph's saved smooth single-source EV response. It then compares the two adjusted linear luminances at the same pixel: `M` is the brighter value and `m` the darker value. These names describe pixel brightness, not shooting or upload order. The retained contribution is `h = 1 / (1 + (M / 0.23)^3.5)`, and the finished luminance is `min(1, M + m × h)`.

Dark overlaps approach addition, so more of both photographs remains visible. The contribution decreases gradually as the brighter value rises, limiting extra detail in bright overlaps. There is no middle-tone cutoff. The retention power stays below four so brighter inputs cannot make the grayscale output turn darker. At zero EV:

| Grayscale inputs | Saved smooth | Revised smooth |
| --- | ---: | ---: |
| 40 + 40 | 48 | 58 |
| 80 + 128 | 130 | 140 |
| 128 + 128 | 144 | 157 |
| 185 + 185 | 199 | 191 |
| 200 + 200 | 212 | 203 |

Colour weights vary continuously from a more even mixture in dark overlaps toward stronger brightness dominance in highlights. Equal-brightness colours blend evenly. Colour differences are also attenuated locally when both sources carry light and little highlight headroom remains: with `room = 1 − M`, the colour-retention factor is `room² / (room² + m²)` when `m > 0`, otherwise one. The weighted RGB colour is moved toward the finished luminance by that factor. Thus a bright neutral base can hide a coloured second exposure as well as its brightness detail; dark overlaps retain more colour, and a single photograph against black is preserved. This is symmetric local highlight attenuation rather than a whole-image desaturation. Any remaining out-of-range RGB values are scaled together to fit the display, which can reduce saturated colours' brightness. The saved smooth treatment retains its original colour correction.

Both sources follow the same rule. Swapping the aligned photographs together with their EV settings gives the same blend. The base still defines the frame, so swapping differently shaped source files can change fitting. Ordinary film double exposures generally do not depend strongly on shooting order, as discussed in [ILFORD's guide](https://www.ilfordphoto.com/taking-a-double-exposure/).

This revision is a visual adjustment informed by the artist's comparisons. It is not a calibrated film response or a literal addition of latent exposure. In particular, two identical photographs at −1 EV each are not required to reproduce the original tones in this mode. Black plus one photograph at zero EV still preserves that photograph, and changing only one source's EV keeps the saved single-source luminance response. Colour fitting can differ when an adjusted source exceeds the display range. The original smooth model remains selectable and unchanged.

## The saved smooth-exposure trial

At every aligned pixel, the trial converts each photograph's sRGB colour to linear light and measures luminance `Y`. It estimates exposure using `E(Y) = (0.98Y / (1 − 0.98Y))²`, scales the two exposures by their EV settings, and adds them. The finished luminance is `min(1, √E / (0.98 × (1 + √E)))`. This continuous response uses the full tonal range. It has no cutoff at a middle-gray value and no jump from 185 to 255 as in the rejected threshold experiment.

A dark pixel contributes much less beside a brighter pixel. At zero EV, black plus a photograph preserves that photograph, gray 35 plus gray 128 stays about 128, and two gray-128 pixels become about 144 instead of unadjusted addition’s 176. The goal is to reduce the gray veil while retaining smooth transitions. The calculation treats both photographs symmetrically, and two identical sources at −1 EV each reproduce one source at 0 EV.

Colour uses one finished luminance for the whole pixel. Source colours are weighted by their estimated exposure, then any out-of-gamut colour is moved toward neutral with one shared factor. This avoids independently clipping red, green, and blue into abrupt colour patches. Black and white uses the source luminances directly.

The constants describe a visual trial for finished photographs. They are not measured properties of a film stock, and the treatment does not reconstruct a negative's development or scan. It should be judged on colour as well as black-and-white photographs, including the storefront/sunflower pair that exposed the previous failure. No automatic whole-image brightness normalization is applied.

## What from the whole proposal is included

| Proposal idea | How it is handled here |
| --- | --- |
| Light accumulates at matching positions | All five treatments operate at matching pixels and treat source order symmetrically; Reduced overlap and Revised smooth use visual overlap rules. |
| Dark areas leave room; bright areas can overwhelm detail | Reduced overlap suppresses extra overlapping light throughout the tonal range while preserving a photograph against black. Revised smooth offers another continuous overlap rule. Highlights do not physically shield the film from the next exposure. |
| Estimate exposure and apply a toe/midtone/shoulder response | Film curve preserves the supplied assumed model. Saved smooth retains its exposure response; Revised smooth adjusts overlap strength separately. |
| Separate photographic-stop controls | Each photograph has its own EV slider on the local page. |
| Keep the engine separate from the interface | Reduced overlap extends the additive maths in `scripts.js`; the other experimental maths live in `film-renderer.js`. Controls and layout remain in separate JavaScript and CSS files. |
| Fast processing | Reusable lookup tables and the shared chunked browser processing path support repeated previews. |
| Black and white and colour | All five treatments can be compared with scans or digital photographs; the experimental colour responses remain approximate. |
| Pairing, collection, and automatic archiving | The existing main-site Google workflow remains in place. Its live connection still requires the setup guide. There is no need to adopt the prototype's Node server or local `data/archive` storage. |
| Keep images and records | The local page offers result downloads and a JSON record of renderer versions, exposure settings, and source information. This is separate from the main archive. |
| Validate appearance | Processing tests check the calculations; browser checks and the artist's comparisons assess the visible result. |

Stock-specific calibration would require measured response data and controlled reference images. Exposure-duration and reciprocity effects cannot be reconstructed from the brightness of an arbitrary finished upload. They are not simulated by these generic curves. A gallery or a different hosting system would not by itself improve the exposure calculation.

## Return to the saved version

The exact version before live tone previews is named **`before-live-tone-preview`**, pointing to **`6991e63`**. It preserves the previous release-to-render interaction. The live-preview revision changes caching and export coordination, not the tone curve or exposure calculation.

The version before visible tone controls and finished-image rotation is saved as **`before-result-rotation`** at **`747fcaf`**. The new revision can be undone directly after preserving later edits.

The exact version before optional tone controls is named **`before-tone-controls`**, pointing to **`43740ff`**. The exposure engine is unchanged by the tone-controls revision. Neutral tone settings bypass the extra stage entirely; restoring the checkpoint also restores the earlier interface.

The Reduced overlap version before the black-and-white conversion fix is named **`colour-overlap-checkpoint`**, pointing to **`a7f543e`**. Its colour pixels remain unchanged by the fix. That checkpoint also preserves the old source-luminance-first monochrome result, and the fix is recorded separately.

The earlier Dark/light balance trial is named **`balance-v1-checkpoint`**, pointing to **`f9abbd7`**. It preserves its exact shadow-boost formula and control. Reduced overlap is a separate revision that can be undone directly after preserving later edits.

The exact approved Current + contrast version immediately before Dark/light balance is named **`current-contrast-checkpoint`**, pointing to **`c1cd211`**. The left preview retains that treatment at contrast 12. To compare within the new page, choose Reduced overlap at Haze reduction 0% or Current + contrast at contrast 12 with 0/0 EV and the same colour choice. To restore that complete code and interface, preserve later edits and restore or revert recorded changes; do not reconstruct it from memory.

The exact version before Current + contrast is named **`before-current-contrast-trial`**, pointing to **`67ec935`**. It preserves the revised-smooth/current comparison. This contrast-control change is a separate commit, so it can be undone directly after preserving any later uncommitted edits.

The exact version before Revised smooth is named **`before-shadow-highlight-revision`**, pointing to commit **`0d5a8ba`**. Its tree also matches **`smooth-exposure-checkpoint`** at **`5887061`**, and preserves the original smooth/current comparison page. Revised smooth is recorded in a separate commit so it can be undone directly. Preserve later uncommitted work before reverting or restoring files.

The exact version immediately before the smooth trial is named **`exposure-checkpoint-2026-10-29`**, pointing to **`f03ce10`**. It contains the restored film-curve/current-addition comparison at 0/0 EV. The smooth trial is a separate commit; asking to undo it lets Git revert that recorded change directly. Preserve any later uncommitted work before reverting or restoring files.

The older checkpoint before the original film comparison is **`54a56dd`**, saved on **`main`**. It includes portrait rotation and the artist's enabled black-and-white option. The experiment is on **`codex/film-comparison`**.

After the experiment is committed and `git status --short` shows no changes, return to the saved version with:

```sh
git switch main
```

To return to the experiment later:

```sh
git switch codex/film-comparison
```

If there are unsaved changes, save a Git checkpoint before switching; do not discard files or reconstruct an older script from memory. Both branches remain available. The older `baseline` tag is not this checkpoint: it predates portrait rotation and the colour option.

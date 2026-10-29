# Trying the film response

This page compares a new Dark/light balance trial with the saved Current addition, Revised smooth, the saved smooth-exposure treatment, and the supplied film-inspired proposal. It does not replace the public renderer or change the Google archive connection.

The exact supplied [proposal](references/supplied-proposal.md) and [original film.js code](references/supplied-film.cjs) are preserved as reference material. The proposal's installation instructions describe the other prototype; use the local comparison instructions below for this website.

## Use the comparison page

Open `local-test.html` with VS Code's Live Server and choose two photographs. Both outputs use the same photographs, portrait rotation, full-frame fitting, dimensions, and JPEG export.

- The left reference is the saved Current addition at **0 EV for both photographs** and **contrast 12**, matching the version saved before this trial.
- The adjustable result starts with **Dark/light balance (trial)**, at **0 EV for each photograph**, **contrast 12**, and **balance 100%**.
- Balance appears only for Dark/light balance. Its range is 0–100% in steps of 5. Higher values admit more overlap in shadows and less in highlights. At 0%, matching exposure, contrast, and colour settings reproduce the saved Current treatment.
- Choose Dark/light balance, Current + contrast, Revised smooth, Saved smooth exposure, or the earlier Film curve, then move the base and participant exposure sliders separately. The range is −3 to +2 EV in half-stop steps. −1 EV halves that photograph's estimated exposure; +1 EV doubles it.
- The black-and-white control starts from the artist's configuration and can be changed temporarily for the comparison. It affects both outputs.
- The Contrast slider appears for Current + contrast and Dark/light balance, and ranges from 0 to 30. It changes only the right preview. The left stays at contrast 12; contrast zero on the right removes that tonal adjustment.
- Reset restores Dark/light balance, balance 100%, contrast 12, and 0/0 EV. It preserves your colour choice. Download either result and the settings record before changing photographs if you want to keep the comparison.

Nothing on this page is uploaded or automatically archived. Original files are unchanged.

## Compare one change at a time

Keep the same photo pair and colour choice while trying these combinations:

| Adjustable renderer | Base EV | Participant EV | What it helps assess |
| --- | ---: | ---: | --- |
| Dark/light balance, balance 100%, contrast 12 | 0 | 0 | More shadow overlap and less highlight overlap than the saved left result |
| Dark/light balance, balance 50%, contrast 12 | 0 | 0 | A smaller change in those directions |
| Dark/light balance, balance 0%, contrast 12 | 0 | 0 | Exact agreement with the saved left result |
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

## Dark/light balance trial

The new trial starts from Current's sRGB decoding and separate EV multipliers. For each matching linear RGB channel, let `M` be the brighter adjusted value and `m` the darker. In black and white, it uses the two source luminances instead. At full balance, it combines `M + m × h`, where `h = 1 / (1 + (M / 0.45)^3.5) + 0.65 × exp(−M / 0.09)`. The existing contrast curve follows the combination.

The multiplier is greater than one in dark overlaps, close to one through the lower middle tones, and smaller in bright overlaps. This admits more of both photographs where the pair is dark, while reducing the additional contribution beside a bright value. It changes smoothly, without a hard tone cutoff. The brighter/darker labels apply locally and do not give either photograph priority. A source against black keeps the same Current EV and contrast treatment.

The Balance slider interpolates the multiplier between one at 0% and the full rule at 100%. Zero dispatches the original Current mixer directly so its pixels, including rounding, are preserved. The settings download records `balanceStrength`, renderer version `adaptive-addition-v1`, and the four model constants. Current + contrast and all three earlier experimental treatments remain unchanged and selectable.

This is a controlled visual adjustment informed by the requested shadow/highlight behaviour, not a measured film response or a physical sum of exposure estimates. A source channel already at white can still clip, and a bright neutral area may retain some colour tint from the other photograph. It cannot reconstruct scene exposure from a finished JPEG. Compare those limits with the light-table photograph and the artist's analogue references before judging the result.

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
| Light accumulates at matching positions | All five treatments operate at matching pixels and treat source order symmetrically; Dark/light balance and Revised smooth use visual overlap rules. |
| Dark areas leave room; bright areas can overwhelm detail | Dark/light balance increases shadow overlap and reduces highlight overlap relative to the saved Current treatment. Revised smooth offers another continuous overlap rule. Highlights do not physically shield the film from the next exposure. |
| Estimate exposure and apply a toe/midtone/shoulder response | Film curve preserves the supplied assumed model. Saved smooth retains its exposure response; Revised smooth adjusts overlap strength separately. |
| Separate photographic-stop controls | Each photograph has its own EV slider on the local page. |
| Keep the engine separate from the interface | Dark/light balance extends the additive maths in `scripts.js`; the other experimental maths live in `film-renderer.js`. Controls and layout remain in separate JavaScript and CSS files. |
| Fast processing | Reusable lookup tables and the shared chunked browser processing path support repeated previews. |
| Black and white and colour | All five treatments can be compared with scans or digital photographs; the experimental colour responses remain approximate. |
| Pairing, collection, and automatic archiving | The existing main-site Google workflow remains in place. Its live connection still requires the setup guide. There is no need to adopt the prototype's Node server or local `data/archive` storage. |
| Keep images and records | The local page offers result downloads and a JSON record of renderer versions, exposure settings, and source information. This is separate from the main archive. |
| Validate appearance | Processing tests check the calculations; browser checks and the artist's comparisons assess the visible result. |

Stock-specific calibration would require measured response data and controlled reference images. Exposure-duration and reciprocity effects cannot be reconstructed from the brightness of an arbitrary finished upload. They are not simulated by these generic curves. A gallery or a different hosting system would not by itself improve the exposure calculation.

## Return to the saved version

The exact approved Current + contrast version immediately before Dark/light balance is named **`current-contrast-checkpoint`**, pointing to **`c1cd211`**. The left preview retains that treatment at contrast 12. To compare within the new page, choose Dark/light balance at 0% or Current + contrast at contrast 12 with 0/0 EV and the same colour choice. To restore the complete old code and interface, revert the Dark/light balance commit after preserving later edits; do not reconstruct it from memory.

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

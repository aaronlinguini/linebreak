# Trying the film response

This page compares two experimental treatments with the current website treatment. It does not replace the public renderer or change the Google archive connection.

The exact supplied [proposal](references/supplied-proposal.md) and [original film.js code](references/supplied-film.cjs) are preserved as reference material. The proposal's installation instructions describe the other prototype; use the local comparison instructions below for this website.

## Use the comparison page

Open `local-test.html` with VS Code's Live Server and choose two photographs. Both outputs use the same photographs, portrait rotation, full-frame fitting, dimensions, and JPEG export.

- The reference is the current addition at **0 EV for both photographs**.
- The adjustable result starts with **Threshold exposure**, at **0 EV for each photograph**. This holds exposure fixed when comparing treatments and leaves dark areas available to the second photograph.
- Choose Threshold exposure, Film curve, or Current addition, then move the base and participant exposure sliders separately. The range is −3 to +2 EV in half-stop steps. −1 EV halves that photograph's estimated contribution; +1 EV doubles it.
- The black-and-white control starts from the artist's configuration and can be changed temporarily for the comparison. It affects both outputs.
- Reset restores Threshold exposure and 0/0 EV. Download either result and the settings record before changing photographs if you want to keep the comparison.

Nothing on this page is uploaded or automatically archived. Original files are unchanged.

## Compare one change at a time

Keep the same photo pair and colour choice while trying these combinations:

| Adjustable renderer | Base EV | Participant EV | What it helps assess |
| --- | ---: | ---: | --- |
| Current addition | 0 | 0 | Agreement with the fixed reference |
| Current addition | −1 | −1 | Exposure reduction alone |
| Film curve | 0 | 0 | Response change at the reference exposure |
| Film curve | −1 | −1 | Response change at the same reduced exposure |
| Threshold exposure | 0 | 0 | Whether a dark strip reveals the second image while a light table hides it |
| Threshold exposure | −1 | −1 | How reducing both contributions changes the strip and background |

Then try −0.5 EV or adjust the photographs independently. Reduced exposure also darkens areas where only one photograph contributes and can let detail return to a bright background. −1/−1 is a comparison, not a universal correction. Automatic brightness normalization is not enabled: it could brighten intentionally dark silhouettes.

Threshold exposure uses each aligned pixel's light value to estimate how much exposure that point contributes to one shared frame. In the current experiment, values at or below roughly 20/255 contribute none and values at or above roughly 185/255 reach the bright endpoint at 0 EV. Values between those points contribute continuously. The two contributions are added at each matching pixel and developed into one result; there is no whole-image opacity control or hard outline mask. These thresholds are visual choices made for the light-table example, not measured properties of film. Exposure adjustments can move a region away from the bright endpoint. The two photographs are treated symmetrically, so exchanging them has no effect on the pixel calculation when their framing and EV settings are also exchanged.

Use several pairs: a silhouette, two scenes with many midtones, almost-white and clipped-white highlights, colour photographs, and a digital photograph paired with a scan. Judge shadow depth, how much detail survives in bright areas, colour, and overall contrast. Numerical tests alone cannot establish a convincing analogue appearance. The supplied model has not been calibrated to the artist's film stock or scanning process.

## What from the whole proposal is included

| Proposal idea | How it is handled here |
| --- | --- |
| Light accumulates at matching positions | All three treatments combine local contributions; none gives priority to shooting order. |
| Dark areas leave room; bright areas can overwhelm detail | Threshold exposure makes this effect more pronounced around the selected dark and bright points. Highlights do not physically shield the film from the next exposure. |
| Estimate exposure and apply a toe/midtone/shoulder response | Film curve preserves the supplied assumed curve, including its endpoint assumptions. Threshold exposure is a separate, simpler response built for visual comparison. |
| Separate photographic-stop controls | Each photograph has its own EV slider on the local page. |
| Keep the engine separate from the interface | The experimental maths live in `film-renderer.js`; controls and layout remain in separate JavaScript and CSS files. |
| Fast processing | Reusable lookup tables and the shared chunked browser processing path support repeated previews. |
| Black and white and colour | All three treatments can be compared with scans or digital photographs; the experimental colour responses remain approximate. |
| Pairing, collection, and automatic archiving | The existing main-site Google workflow remains in place. Its live connection still requires the setup guide. There is no need to adopt the prototype's Node server or local `data/archive` storage. |
| Keep images and records | The local page offers result downloads and a JSON record of renderer versions, exposure settings, and source information. This is separate from the main archive. |
| Validate appearance | Processing tests check the calculations; browser checks and the artist's comparisons assess the visible result. |

Stock-specific calibration would require measured response data and controlled reference images. Exposure-duration and reciprocity effects cannot be reconstructed from the brightness of an arbitrary finished upload. They are not simulated by either experimental response. A gallery or a different hosting system would not by itself improve the exposure calculation.

## Return to the saved version

The exact pre-experiment checkpoint is **`54a56dd`**, saved on **`main`**. It includes portrait rotation and the artist's enabled black-and-white option. The experiment is on **`codex/film-comparison`**.

After the experiment is committed and `git status --short` shows no changes, return to the saved version with:

```sh
git switch main
```

To return to the experiment later:

```sh
git switch codex/film-comparison
```

If there are unsaved changes, save a Git checkpoint before switching; do not discard files or reconstruct an older script from memory. Both branches remain available. The older `baseline` tag is not this checkpoint: it predates portrait rotation and the colour option.

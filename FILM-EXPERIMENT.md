# Trying the film response

This page compares a negative-and-print trial with the saved smooth-exposure treatment, the supplied film-inspired proposal, and the current website treatment. It does not replace the public renderer or change the Google archive connection.

The exact supplied [proposal](references/supplied-proposal.md) and [original film.js code](references/supplied-film.cjs) are preserved as reference material. The proposal's installation instructions describe the other prototype; use the local comparison instructions below for this website.

## Use the comparison page

Open `local-test.html` with VS Code's Live Server and choose two photographs. Both outputs use the same photographs, portrait rotation, full-frame fitting, dimensions, and JPEG export.

- The left reference is the saved **Smooth exposure** treatment at **0 EV for both photographs**.
- The adjustable right result starts with **Negative + print**, at **0 EV for each photograph**. This holds exposure fixed while comparing the response change.
- Choose Negative + print, Smooth exposure, the earlier Film curve, or Current addition, then move the base and participant exposure sliders separately. The range is −3 to +2 EV in half-stop steps. −1 EV halves that photograph's estimated exposure; +1 EV doubles it.
- The black-and-white control starts from the artist's configuration and can be changed temporarily for the comparison. It affects both outputs.
- Reset restores Negative + print and 0/0 EV. Download either result and the settings record before changing photographs if you want to keep the comparison.

Nothing on this page is uploaded or automatically archived. Original files are unchanged.

## Compare one change at a time

Keep the same photo pair and colour choice while trying these combinations:

| Adjustable renderer | Base EV | Participant EV | What it helps assess |
| --- | ---: | ---: | --- |
| Smooth exposure | 0 | 0 | Agreement with the saved smooth reference |
| Negative + print | 0 | 0 | Loss of portrait detail over bone and clarity in dark cavities |
| Negative + print | −1 | −1 | The negative-and-print response with reduced total exposure |
| Current addition | 0 | 0 | Comparison with the public treatment |
| Current addition | −1 | −1 | Exposure reduction alone |
| Film curve | 0 | 0 | Response change at the reference exposure |
| Film curve | −1 | −1 | Response change at the same reduced exposure |
| Smooth exposure | −1 | −1 | The saved response with a reduced total exposure |

Then try −0.5 EV or adjust the photographs independently. Reduced exposure also darkens areas where only one photograph contributes, so −1/−1 is a starting point rather than a universal correction. Automatic brightness normalization is not enabled: it could brighten intentionally dark silhouettes.

Use several pairs: a silhouette, two scenes with many midtones, almost-white and clipped-white highlights, colour photographs, and a digital photograph paired with a scan. Judge shadow depth, how much detail survives in bright areas, colour, and overall contrast. Numerical tests alone cannot establish a convincing analogue appearance. The supplied model has not been calibrated to the artist's film stock or scanning process.

## The negative-and-print trial

The new trial follows these separate stages at every matching pixel:

1. Decode the source colours to linear light. Colour uses each RGB channel as an approximate exposure estimate; black and white first combines them into linear luminance.
2. Scale each estimate by its EV setting and add them on one shared frame.
3. Apply a negative density curve with a toe, middle slope, and shoulder.
4. Convert negative density to transmission with `T = 10^(-D)`.
5. Use that transmission to expose a simulated photographic paper curve, then convert paper density to reflected brightness with `R = 10^(-Dpaper)`.

The response at zero accumulated exposure is subtracted to set black. The paper white point is retained rather than stretched to pure white; its chosen minimum density of 0.08 gives a grayscale highlight ceiling near 235/255. The curve is continuous through that range. This lets overlapping details lose contrast while the result is still light gray, without a jump from a middle-gray input to white.

This changes the tonality of a source even when the other source is black. Unlike Smooth exposure, its input estimate and finished response are deliberately not inverses. Dark cavities can carry the second photograph through the same photographic response, while the paper's highlight response compresses distinctions over bright bone. It does not recognize faces, bones, or silhouettes.

Colour adds the linear-light contributions in each RGB channel, then develops each sum through the same continuous negative-and-print response. This is a three-channel approximation of separate colour-sensitive responses, not a calibration of colour-film layers or their spectral sensitivities. Colour relationships and hue can change smoothly as channels pass through different parts of the curve, but there is no separate cutoff at 185 or any other middle tone. The model record names this choice `colourResponse: "per-channel-negative-print"`. Black and white combines the source channels into linear luminance before applying the response. The saved Smooth exposure treatment retains its previous colour handling.

[Kodak's sensitometry workbook](https://www.kodak.com/content/products-brochures/Film/Basic-Photographic-Sensitometry-Workbook.pdf) describes density/transmission, characteristic curves, and the negative/paper system. Its generic slope ranges inform the starting negative gamma of 0.6 and paper gamma of 3.5. The toe and shoulder positions, print exposure, and paper white point are artistic settings rather than measured properties of the artist's material. The artist's originals may have been scanned rather than printed; this is a simulated printing trial, not a reconstruction of that workflow. It also does not assume that ordinary bright bone has filled the negative to its maximum density.

For the skull comparison, test the existing source placement and a separate approximate analogue placement. The uploaded skull is larger than the skulls in the analogue examples, so the portrait's mouth overlaps different bone and cavity regions. Keep that spatial change separate from the response comparison.

## The smooth-exposure trial

At every aligned pixel, the trial converts each photograph's sRGB colour to linear light and measures luminance `Y`. It estimates exposure using `E(Y) = (0.98Y / (1 − 0.98Y))²`, scales the two exposures by their EV settings, and adds them. The finished luminance is `min(1, √E / (0.98 × (1 + √E)))`. This continuous response uses the full tonal range. It has no cutoff at a middle-gray value and no jump from 185 to 255 as in the rejected threshold experiment.

A dark pixel contributes much less beside a brighter pixel. At zero EV, black plus a photograph preserves that photograph, gray 35 plus gray 128 stays about 128, and two gray-128 pixels become about 144 instead of Current addition's 176. The goal is to reduce the gray veil while retaining smooth transitions. The calculation treats both photographs symmetrically, and two identical sources at −1 EV each reproduce one source at 0 EV.

Colour uses one finished luminance for the whole pixel. Source colours are weighted by their estimated exposure, then any out-of-gamut colour is moved toward neutral with one shared factor. This avoids independently clipping red, green, and blue into abrupt colour patches. Black and white uses the source luminances directly.

The constants describe a visual trial for finished photographs. They are not measured properties of a film stock, and the treatment does not reconstruct a negative's development or scan. It should be judged on colour as well as black-and-white photographs, including the storefront/sunflower pair that exposed the previous failure. No automatic whole-image brightness normalization is applied.

## What from the whole proposal is included

| Proposal idea | How it is handled here |
| --- | --- |
| Light accumulates at matching positions | All four treatments combine local exposure contributions; none gives priority to shooting order. |
| Dark areas leave room; bright areas can overwhelm detail | Negative + print tests local contrast loss through a negative and paper response. Highlights do not physically shield the film from the next exposure. |
| Estimate exposure and apply a toe/midtone/shoulder response | Negative + print separates the photographic stages. Film curve preserves the supplied model, while Smooth exposure preserves the previous continuous trial. |
| Separate photographic-stop controls | Each photograph has its own EV slider on the local page. |
| Keep the engine separate from the interface | The experimental maths live in `film-renderer.js`; controls and layout remain in separate JavaScript and CSS files. |
| Fast processing | Reusable lookup tables and the shared chunked browser processing path support repeated previews. |
| Black and white and colour | All four treatments can be compared with scans or digital photographs; the experimental colour responses remain approximate. |
| Pairing, collection, and automatic archiving | The existing main-site Google workflow remains in place. Its live connection still requires the setup guide. There is no need to adopt the prototype's Node server or local `data/archive` storage. |
| Keep images and records | The local page offers result downloads and a JSON record of renderer versions, exposure settings, and source information. This is separate from the main archive. |
| Validate appearance | Processing tests check the calculations; browser checks and the artist's comparisons assess the visible result. |

Stock-specific calibration would require measured response data and controlled reference images. Exposure-duration and reciprocity effects cannot be reconstructed from the brightness of an arbitrary finished upload. They are not simulated by these generic curves. A gallery or a different hosting system would not by itself improve the exposure calculation.

## Return to the saved version

The exact version immediately before Negative + print is named **`smooth-exposure-checkpoint`**, pointing to **`5887061`**. It preserves the full smooth-exposure project and its original comparison page. The negative-and-print trial is a separate commit; asking to undo it lets Git revert that recorded change directly. Preserve later uncommitted work before reverting or restoring files.

The exact version immediately before the smooth trial is named **`exposure-checkpoint-2026-10-29`**, pointing to **`f03ce10`**. It contains the restored film-curve/current-addition comparison at 0/0 EV. The smooth trial is a separate commit; asking to undo it lets Git revert that recorded change directly. Preserve any later uncommitted work before reverting or restoring files.

The older checkpoint before the original film comparison is **`54a56dd`**, saved on **`main`**. It includes portrait rotation and the artist's enabled black-and-white option. The experiment is on **`codex/film-comparison`**.

After the experiment is committed and `git status --short` shows no changes, switch to the older pre-comparison branch with:

```sh
git switch main
```

To return to the experiment later:

```sh
git switch codex/film-comparison
```

If there are unsaved changes, save a Git checkpoint before switching; do not discard files or reconstruct an older script from memory. Both branches remain available. The older `baseline` tag is not this checkpoint: it predates portrait rotation and the colour option.

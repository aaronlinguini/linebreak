# Trying the film response

This experiment compares the supplied film-inspired proposal with the current website treatment. It does not replace the public renderer or change the Google archive connection.

The exact supplied [proposal](references/supplied-proposal.md) and [original film.js code](references/supplied-film.cjs) are preserved as reference material. The proposal's installation instructions describe the other prototype; use the local comparison instructions below for this website.

## Use the comparison page

Open `local-test.html` with VS Code's Live Server and choose two photographs. Both outputs use the same photographs, portrait rotation, full-frame fitting, dimensions, and JPEG export.

- The reference is the current addition at **0 EV for both photographs**.
- The adjustable result starts with **Film curve**, at **0 EV for each photograph**. This holds exposure fixed when comparing the two treatments and avoids dimming the second image by default.
- Choose the renderer and move the base and participant exposure sliders separately. The range is −3 to +2 EV in half-stop steps. −1 EV halves that photograph's estimated exposure; +1 EV doubles it.
- The black-and-white control starts from the artist's configuration and can be changed temporarily for the comparison. It affects both outputs.
- Reset restores the experimental renderer and 0/0 EV. Download either result and the settings record before changing photographs if you want to keep the comparison.

Nothing on this page is uploaded or automatically archived. Original files are unchanged.

## Compare one change at a time

Keep the same photo pair and colour choice while trying these four combinations:

| Adjustable renderer | Base EV | Participant EV | What it helps assess |
| --- | ---: | ---: | --- |
| Current addition | 0 | 0 | Agreement with the fixed reference |
| Current addition | −1 | −1 | Exposure reduction alone |
| Film curve | 0 | 0 | Response change at the reference exposure |
| Film curve | −1 | −1 | Response change at the same reduced exposure |

Then try −0.5 EV or adjust the photographs independently. Reduced exposure also darkens areas where only one photograph contributes, so −1/−1 is a starting point rather than a universal correction. Automatic brightness normalization is not enabled: it could brighten intentionally dark silhouettes.

Use several pairs: a silhouette, two scenes with many midtones, almost-white and clipped-white highlights, colour photographs, and a digital photograph paired with a scan. Judge shadow depth, how much detail survives in bright areas, colour, and overall contrast. Numerical tests alone cannot establish a convincing analogue appearance. The supplied model has not been calibrated to the artist's film stock or scanning process.

## What from the whole proposal is included

| Proposal idea | How it is handled here |
| --- | --- |
| Light accumulates at matching positions | Both renderers combine local exposure contributions; neither gives priority to shooting order. |
| Dark areas leave room; bright areas can overwhelm detail | The same image pairs can be checked using the existing addition and the alternative response. Highlights do not physically shield the film from the next exposure. |
| Estimate exposure and apply a toe/midtone/shoulder response | The experimental renderer preserves the supplied assumed curve, including its endpoint assumptions. |
| Separate photographic-stop controls | Each photograph has its own EV slider on the local page. |
| Keep the engine separate from the interface | The experimental maths live in `film-renderer.js`; controls and layout remain in separate JavaScript and CSS files. |
| Fast processing | Reusable lookup tables and the shared chunked browser processing path support repeated previews. |
| Black and white and colour | Both can be compared with scans or digital photographs; the experimental colour response remains approximate. |
| Pairing, collection, and automatic archiving | The existing main-site Google workflow remains in place. Its live connection still requires the setup guide. There is no need to adopt the prototype's Node server or local `data/archive` storage. |
| Keep images and records | The local page offers result downloads and a JSON record of renderer versions, exposure settings, and source information. This is separate from the main archive. |
| Validate appearance | Processing tests check the calculations; browser checks and the artist's comparisons assess the visible result. |

Stock-specific calibration would require measured response data and controlled reference images. Exposure-duration and reciprocity effects cannot be reconstructed from the brightness of an arbitrary finished upload. They are not simulated by this generic curve. A gallery or a different hosting system would not by itself improve the exposure calculation.

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

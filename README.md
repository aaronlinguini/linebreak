# Double exposure

Participants add a photograph to create a double exposure. The Google connection archives the original upload and each finished JPEG. A participant's original joins future pairings only when they choose that option before submitting.

## Try it

To test without Google, right-click `local-test.html` in VS Code and choose **Open with Live Server**. Choose your base photo and a second photo. The left preview keeps the saved **Current** treatment at zero EV and contrast 12. The right starts with **Reduced overlap (trial)** at the same settings, with **Haze reduction 20%**, matching the approved screenshot preset. All five optional tone controls start at zero. Increasing Haze reduction reduces overlapping light across shadows, midtones, and highlights. Dark areas leave the brighter photograph clearer; two dark areas stay closer to their original darkness. Move Haze reduction to 0% to reproduce the saved Current treatment. Current + contrast, Revised smooth, Saved smooth exposure, and the earlier film curve remain available. Adjust each photograph's exposure separately and compare black and white with colour. Use the visible **Tone adjustments** sliders for optional Shadows, Highlights, Mids, Whites, and Blacks finishing controls; **Reset tones** clears only those five controls. Both results use the same full-frame preparation and JPEG export. Download the results and settings to keep a record; nothing is uploaded or automatically archived there. See [FILM-EXPERIMENT.md](FILM-EXPERIMENT.md) for comparisons and how to return to the saved version.

There is no frontend installation or build. To test automatic archiving on the main `index.html` page, first deploy and connect the Google archive: follow [GOOGLE-SETUP.md](GOOGLE-SETUP.md).

## Phones and tablets

The same pages adapt to phones, tablets, and desktop screens. Participants can choose an existing photograph or use **Take a photo**, which asks a supported mobile browser to open the device's camera, preferring the rear camera. The local comparison page offers camera capture for either source. On desktop browsers, a camera control may open an ordinary file chooser instead. No camera stream starts when the page loads.

Camera inputs request JPEG. Library inputs request JPEG, PNG, WebP, or AVIF so the device can supply a supported image. Some Apple photo pickers convert HEIC to JPEG; raw HEIC/HEIF and RAW files are not supported by this project's processor or archive. The original archive keeps the exact file delivered by the picker, including any conversion performed by the device before selection.

To test on a real phone or tablet, use the published HTTPS URL or Live Server's reachable local-network address while both devices are on the same network. `127.0.0.1` or `localhost` on the phone refers to the phone itself, not the computer. The comparison page works without Google; the main page enables both upload choices only after its archive is connected and has a base photograph.

Before public use, check both library selection and native camera capture on an actual iPhone/iPad and Android device, including cancellation and a portrait photograph. Desktop viewport checks verify layout, not a physical device's camera chooser or HEIC conversion.

1. Upload artist photographs to the project's Drive folder and import them through the private Apps Script owner function.
2. On the website, choose **Upload a photo** or **Take a photo**. Review the selected photo, choose whether it may be used in future pairings, then press **Create double exposure**. The future-use checkbox starts unchecked.
3. Wait for **Double exposure saved.** Downloading a copy is optional. If another eligible base is available, **Try another pairing** saves a second result using the same original without uploading it again. **Start over** clears the page; it does not delete archived files.

The public page stays minimal and black, with no exposure sliders or collection-management panel. Source photographs are stored separately from finished exposures. A private Google Sheet records consent, source IDs, and each result. Exact duplicates share a source-pool entry; no image pairs with identical bytes. Pending and failed submissions can be retried without changing the selected base or duplicating the archived result.

The code is not yet connected to a live Google deployment: `project-config.js` deliberately contains an empty endpoint until setup is complete. It disables uploads when unconfigured and does not present local processing as a successful archive save.

For a local HTTP layout preview, run this in the project folder and open the printed address. A live archive additionally requires a deployed Google script, published bridge asset, and allowed preview origin as described in the setup guide:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

## Files

- `index.html`: structure and content; links the stylesheet and deferred script.
- `styles.css`: shared page styling and responsive layouts.
- `scripts.js`: photo loading, pairing, light processing, finished-image rotation, and downloads.
- `local-test.html`, `local-test.js`, and `local-test.css`: browser-only comparison controls and layout without Google.
- `tone-adjustments.js`: optional finishing curve for the local test only; excluded from the public website files.
- `film-renderer.js`: experimental revised/saved smooth-exposure and assumed film-response models, loaded only by the local comparison page.
- `project-config.js`: the public Google deployment URL, artist colour option, and connection timeouts.
- `archive-workflow.js`: original → develop → result archive workflow, consent, another pairing, and retries.
- `drive-storage.js`: website-side Google connection.
- `drive-bridge.js`: external script running inside Google's hidden bridge frame.
- `google-apps-script/`: private Drive/Sheets backend, bridge HTML, and manifest.
- `tests/`: numerical, archive workflow, backend persistence, and transport checks.

There are no inline styles, executable script bodies, or inline event handlers in the HTML. All authored scripts and styles are separate files. No third-party frontend packages, remote fonts, or tracking are used. The deployed archive uses Google's HTML-service runtime.

## Exposure treatment

The main website's blend remains the restored linear-addition treatment. It works pixel by pixel on the aligned photographs: decode sRGB, scale each channel by `2 ** exposureEV`, add the two photographs, and clip each channel independently at white. At neutral settings, white stays white and black reveals the other photograph. This treatment is symmetric. The local page compares it with Revised smooth, the saved smooth-exposure treatment, and the supplied film-inspired model without replacing the public renderer.

The default Reduced overlap trial combines matching linear-light values through a continuous power sum. Haze reduction 0% uses the exact saved Current addition; increasing it reduces the extra light added where both photographs contribute, without dimming a photograph against black. At 100%, dark overlaps are darker than addition and a bright value admits less detail from the other photograph. The control also affects midtones and can remove some similarly bright details. It treats both photographs symmetrically and does not lower either photograph's overall opacity. The black-and-white option combines the RGB channels first using the same rule as colour, then measures their combined linear luminance before contrast and encoding. It no longer removes source colour differences before the overlap calculation; colour output itself is unchanged.

The existing contrast curve follows this calculation, with contrast 12 on both previews initially. Current + contrast remains available unchanged. The artist-only Contrast slider ranges from 0 to 30 for it and Reduced overlap. Positive contrast darkens dark tones and lightens light tones; it can compress subtle separation and cannot recover a source channel already clipped to white. Haze reduction and contrast are recorded with downloads. The public exposure calculation remains unchanged.

Dark plus dark should generally remain dark, but adding an exposure does not make the finished positive image darker than either source under a monotonic response. This trial makes overlapping tones darker **relative to addition**, not below the brighter source before the separate contrast adjustment. It removes the earlier arbitrary shadow boost. It is a visual approximation for finished scans and digital photographs, not a calibrated film response; their original scene exposures cannot be recovered from JPEG values alone.

The selectable Revised smooth trial keeps the saved single-source EV adjustment and changes how two overlapping pixels combine. Dark overlaps admit more of both photographs; the added contribution tapers in brighter overlaps. It treats the two photographs symmetrically, so swapping the aligned inputs and their EV settings preserves the result. Colour weights change continuously. When both sources contribute to a bright overlap, colour differences also fade according to the remaining highlight headroom; a photograph against black keeps its colour. Any excess RGB values are then scaled together to fit the display. This is a targeted visual overlap rule, not a calibrated emulsion model or a physical sum of exposure estimates.

The saved smooth treatment estimates an exposure from each pixel's linear luminance, applies the two EV settings, adds those estimates, and develops one output luminance through a continuous response. Dark pixels have less influence beside a brighter photograph, reducing the gray veil. Colour uses that shared luminance response with exposure-weighted colour and a common gamut correction, rather than clipping RGB channels at separate thresholds. The treatment accepts digital photographs and scans, but it is an artistic approximation of finished images, not a calibrated film stock.

The later inverse-Reinhard response was removed after review of the artist's analogue examples and website outputs. Numerical boundary checks did not establish a convincing analogue match. This rollback restores the earlier behaviour; it does not claim to finish the film simulation.

`PROJECT_SETTINGS` in `scripts.js` defines the artist's treatment. Google selects a random eligible source; a second pairing avoids the immediately previous base. The participant interface has no exposure sliders, contrast controls, or colour options. The main treatment uses neutral contrast and zero exposure adjustment per photograph; the colour option comes from `project-config.js`.

A rendered JPEG does not retain its original scene exposure or a measured film/development/scan response. See [EXPOSURE-NOTES.md](EXPOSURE-NOTES.md) for the current model and limitations.

Portrait photographs are rotated 90 degrees clockwise into landscape orientation before processing, for both the base and participant image. Each full photograph is fitted into the base frame without cropping or stretching; different proportions leave black padding, which contributes no exposure. Results use up to 2,400 pixels on the longest edge, and are smaller if either source would otherwise be enlarged. Before any user rotation, the archive and optional download contain the same JPEG bytes. Rotation and resizing affect working images and results; the participant original is uploaded unchanged.

JPEG, PNG, WebP, and AVIF are accepted, up to 30 MB per file. HEIC and RAW need to be exported to a supported format first. Transparent image regions contribute black (no light).

## Optional local tone adjustments

The approved starting preset is Reduced overlap at Haze reduction 20%, contrast 12, 0/0 EV, and black and white enabled. The **Tone adjustments** sliders sit beside the trial image, above the other editing controls, with all five at zero. Previews stay in view while scrolling the controls. On phones, the trial preview stays above the controls and the saved reference appears below the editor. Zero bypasses the finishing stage completely; the exposure engine and its original pixel calculation are unchanged.

Each slider ranges from −100 to +100. Positive brightens its tonal region; negative darkens it. Blacks and Whites affect near-black and near-white values, Shadows and Highlights affect broader dark and bright values, and Mids affects the middle range. Their smooth curve affects nearby tones too. These are simple finishing controls, not replicas of Lightroom's processing. Pure black and white remain fixed, and clipped detail cannot be recovered.

The controls affect only the finished right preview, after exposure processing and any contrast adjustment. They work with every local treatment. **Reset tones** restores only the five sliders to zero. **Reset trial** also restores Reduced overlap, Haze reduction 20%, contrast 12, and 0/0 EV, while preserving the colour checkbox. Downloads record the finishing settings separately from the exposure renderer. The public page has no tone sliders.

## Rotate a finished exposure

**Rotate 90°** turns the finished image clockwise and updates the downloaded image. It is available beside the result on the public page and the right preview on the local test. Rotation does not change the source photographs or the exposure calculation. On the public page, the archive retains the image in the orientation in which it was created; rotation changes the preview and download without another archive write.

On the local test, the selected rotation persists when tone, exposure, colour, or treatment settings change. Reset tones keeps the rotation. Reset trial or selecting a new photograph returns it to zero. Settings downloads record `trial.rotationDegrees` and the rotated output dimensions; the left reference stays unchanged.

## Artist colour option

In `project-config.js`, change `forceBlackAndWhite`:

- `true`: make every finished double exposure black and white.
- `false`: preserve the photographs' existing colours, including photographs that are already black and white.

The saved artist setting is currently `true`. Reload after changing the configuration. It controls the main site and the initial colour choice on the local test page; the local comparison also has its own temporary colour toggle. The archived original uploads retain their original colours and orientation.

## Checks

With Node 18 or newer:

```sh
node --check scripts.js
node --test tests/*.test.cjs
```

The checks cover exposure maths, exact original bytes, consent, another pairing, duplicate and self-pairing rules, result eligibility timing, interrupted archive writes, stable retries, iframe-message validation, and the separation of HTML, CSS, and JavaScript. Google services are simulated in those tests; live account authorization and deployment require the setup guide's smoke test.

## Version history

Git history starts with the current restored project. The `baseline` tag names this first saved version. Later work should be saved in small commits so it can be undone directly.

The exact state before the film comparison experiment is commit `54a56dd` on `main`, including portrait rotation and the artist's enabled black-and-white setting. The experiment is on `codex/film-comparison`. [The experiment guide](FILM-EXPERIMENT.md#return-to-the-saved-version) explains switching between those saved versions. The older `baseline` tag predates the rotation and colour-option changes.

The version immediately before the smooth-exposure change is also named **`exposure-checkpoint-2026-10-29`** (commit `f03ce10`). It preserves the restored film-curve/current-addition comparison. The smooth trial is saved as a separate commit so it can be undone directly while retaining the checkpoint and history. The version before Revised smooth is commit **`0d5a8ba`**, whose tree matches **`smooth-exposure-checkpoint`** at **`5887061`**. Revised smooth is saved as a separate change; undoing that commit restores the recorded prior version.

The version before Current + contrast is named **`before-current-contrast-trial`**, pointing to **`67ec935`**. Its saved revision can be restored exactly; the contrast trial is recorded separately.

The approved Current + contrast version immediately before Dark/light balance is saved as **`current-contrast-checkpoint`** at **`c1cd211`**. It can be restored directly. The local page also keeps its contrast-12 result in the left preview, and Haze reduction 0% reproduces it with matching EV and colour settings.

The earlier Dark/light balance version, including its shadow boost and original control, is preserved as **`balance-v1-checkpoint`** at **`f9abbd7`**. The Reduced overlap revision is recorded separately so the exact prior code can be restored.

The Reduced overlap version before the black-and-white conversion fix is saved as **`colour-overlap-checkpoint`** at **`a7f543e`**. Its colour output is preserved by the fix; the old monochrome calculation can be restored from that checkpoint.

The layout before the editing sidebar is saved as **`before-editor-sidebar`** at **`a6c0ebe`**. The change moves controls without changing the image processing.

The version before visible tone controls and finished-image rotation is saved as **`before-result-rotation`** at **`747fcaf`**. The new revision can be undone directly after preserving later edits.

The exact project before optional tone controls is saved as **`before-tone-controls`** at **`43740ff`**. The tone controls are a separate change; setting all five to zero also bypasses their processing entirely.

In VS Code, open **Source Control** to see changed files and saved history. To save a version manually, stage the intended files, enter a short description, and commit. Saving a file alone does not create a Git version.

To undo a later committed change, ask to revert that change; Git can create an undo commit while preserving the history. The baseline can also be used to restore a particular file. Earlier versions from before Git was introduced are not automatically part of this history.

## Next stages

Publish the static files, authorize and deploy the Google script, and complete a real upload/archive check. Judge the exposure treatment with the artist's photographs. A public gallery, a project-wide finite sequence, and participant-created or edited prompts are not implemented; the current scope is the shared source pool and private archive.

# Double exposure

Participants add a photograph to create a double exposure. The Google connection archives original uploads and finished JPEGs. The revised folder workflow places an explicitly opted-in original in `My_photos` only after its result is saved, with a stable name such as `participant_photo_1.jpg`. It moves that original instead of saving a second copy. Pending and nonconsenting originals remain privately archived in `participant_uploads`, and finished exposures stay in `Completed_double_exposures`.

This tool is one part of a larger interactive artwork. The overall website name is undecided; the artist leads the wording, photo selections, page counts, and layouts, with ordinary HTML/CSS kept easy to edit.

The local home page in `index.html` has **Experiments** on the left, linking to three editable experiment pages, and **Interactive** on the right, linking to `double-exposure.html`. These columns stack in the same order on smaller screens. The experiment pages contain no selected photographs or written reflections yet. This layout and all page drafts remain local and unpublished.

## Try it

To test without Google, right-click `local-test.html` in VS Code and choose **Open with Live Server**. Choose your base photo and a second photo. The left preview keeps the saved **Current** treatment at zero EV and contrast 12. The right starts with **Reduced overlap (trial)** at the same settings, with **Haze reduction 20%**, matching the approved screenshot preset. All five optional tone controls start at zero. Increasing Haze reduction reduces overlapping light across shadows, midtones, and highlights. Dark areas leave the brighter photograph clearer; two dark areas stay closer to their original darkness. Move Haze reduction to 0% to reproduce the saved Current treatment. Current + contrast, Revised smooth, Saved smooth exposure, and the earlier film curve remain available. Adjust each photograph's exposure separately and compare black and white with colour. Use the visible **Tone adjustments** sliders for optional Shadows, Highlights, Mids, Whites, and Blacks finishing controls; **Reset tones** clears only those five controls. Both results use the same full-frame preparation and JPEG export. Download the results and settings to keep a record; nothing is uploaded or automatically archived there. See [FILM-EXPERIMENT.md](FILM-EXPERIMENT.md) for comparisons and how to return to the saved version.

There is no frontend dependency installation. The Google archive runs as **Version 7** in the dedicated project account, deployed at **11:43 PM on October 30** on the same endpoint with unchanged account, Anyone access, scopes, and archive IDs. The current local revision passes **375/375 checks**. The user approved activating the existing service, and `UPLOADS_PAUSED=false` is verified. Google serves the visitor bridge itself, so local testing does not need GitHub Pages. Independent archive-folder, consent, duplicate, colour-variant, and device checks remain pending.

The saved-result colour toggle and earlier rendered preview are implemented locally, and their backend changes are installed in **Google Version 6**. `Code.gs` and `Storage.gs` were verified byte-for-byte after reloading the Google editor. Browser checks use the real image processor with simulated storage; both colour directions, pending-preview locks, and the unlocked checkbox after a receipt were verified. These checks do not establish a live archived colour variant. A fresh Version 6 Chrome/Live Server connection completed bootstrap after **Retry**; its initial handshake timed out without an established cause. These changes preserve the exposure calculation, original files, consent, scopes, and archive IDs.

The selected **113 artist bases** have byte-exact local copies in `assets/base-photos/`. Google `Code.gs` and `AssetCatalog.gs` matched their local files after editor reload. The **11:39:43 PM** owner refresh verified all **113/113** catalog/index matches, with zero unmatched, skipped, deferred, or issue entries. Browser checks loaded the actual **4,702,374-byte** `30thbirthday.JPG` over direct same-site HTTP with a SHA query and no load errors, verified it through the loader, and used the real processor in both colour modes. The archive was simulated, so no new external photo upload or live saved-result claim follows. A fresh Version 7 Chrome/Live Server bootstrap completed after Retry, clearing status and errors; its first handshake timed out. No photo was resized, re-encoded, or renamed by the builder.

The website itself remains local and unpublished. The last published frontend was the visitor black-and-white release at `949dc1`; local checkpoint `76d40d3` preserves it before the home-page split. The GitHub repository is **private**, and the former GitHub Pages address returns **404: no GitHub Pages site**. No repository files or history were deleted, and no home or experiment draft was published. Activating the Google service does not publish the website. Publishing the finished site will be a separate manual step with guidance; no frontend push or publication is authorized. See [GOOGLE-SETUP.md](GOOGLE-SETUP.md) for the archive status and remaining checks.

## Phones and tablets

The same pages adapt to phones, tablets, and desktop screens. Participants can choose an existing photograph or use **Take a photo**, which asks a supported mobile browser to open the device's camera, preferring the rear camera. The local comparison page offers camera capture for either source. On desktop browsers, a camera control may open an ordinary file chooser instead. No camera stream starts when the page loads.

Camera inputs request JPEG. Library inputs request JPEG, PNG, WebP, or AVIF so the device can supply a supported image. Some Apple photo pickers convert HEIC to JPEG; raw HEIC/HEIF and RAW files are not supported by this project's processor or archive. The original archive keeps the exact file delivered by the picker, including any conversion performed by the device before selection.

To test the local layout on a real phone or tablet, use Live Server's reachable local-network address while both devices are on the same network. `127.0.0.1` or `localhost` on the phone refers to the phone itself, not the computer. An archive connection also needs that exact origin to be allowed by the Google project; the current allowed local origins use port 5500 on the computer. A future published HTTPS address can be tested after publication is explicitly requested.

The comparison page works without Google. On `double-exposure.html`, set the future-use consent and **Black and white** choices before **Upload a photo** or **Take a photo**. Selecting a photo freezes those choices and automatically starts development when the archive is ready. If the initial Google connection is still running, the same photo waits in the queue and starts when it connects. There is no separate Create button or original-photo preview. The centered developing message and spinner cover preparation and rendering; the message comes from the HTML so wording edits are preserved. The rendered image then appears while Google finishes saving, with a smaller **Finishing…** indicator. Download, rotate, colour changes, reset, and another pairing stay locked until a matching archive receipt arrives. If saving fails, the preview remains with **Retry saving**; seeing a preview does not confirm that its archive succeeded. Keep the tab open until saving finishes. A pending operation requests the browser's leave-page warning, but that warning cannot guarantee completion if the tab is closed.

If the archive is unavailable before submission, **Retry** reconnects and resumes the queued photo; **Upload another photo** clears the selection. Disabled upload/camera labels are gray. The tool keeps Home navigation and has no visible title heading.

Before public use, check both library selection and native camera capture on an actual iPhone/iPad and Android device, including cancellation and a portrait photograph. Desktop viewport checks verify layout, not a physical device's camera chooser or HEIC conversion.

1. Keep the selected artist files in `assets/base-photos/` and their existing matching originals in [My_photos](https://drive.google.com/drive/folders/1KTwgNyGgTgv8HwT1MrBaJeWk-JJIupKY). Version 7 supplies artist image paths for direct website loading; Google retains the source index and exact-original duplicate checks. See the artist-file steps below before changing the collection. Do not delete the retained Drive copies.
2. Set **Black and white** and decide whether the submitted original may join the base-photo library; future-use consent starts unchecked. Then choose **Upload a photo** or **Take a photo**. Development starts automatically, with both choices fixed for this exposure.
3. The rendered double exposure appears before its archive finishes. Wait for **Finishing…** to clear and the result controls to unlock before leaving the page; no separate success message is shown. Downloading a copy is optional. After saving, **Black and white** can create a new saved colour variant of the same two photographs without uploading the original again or changing consent. If another eligible base is available, **Create another double exposure using this photo** creates another result using the same original and current colour choice. Identical finished JPEGs reuse one archived result file. **Upload another photo** clears the page; it does not delete archived files.

The tool page stays minimal and black, with no exposure sliders or collection-management panel. A private Google Sheet records consent, source IDs, and each result. The future-use checkbox starts unchecked and controls entry into the shared base-photo pool; it does not turn off the private original archive. Server-computed SHA-256 checks reuse identical original files across artist and participant records and identical results across repeated tests or pairings. An existing artist photo is reused without renaming or moving it. No image pairs with identical bytes, and pending saves keep their assigned base. Renaming a file does not bypass this check. Edited, resized, or re-exported files can have different bytes and are not guaranteed to match. Copies manually dragged into Drive are detected and indexed once, but the program does not silently delete those externally created files.

The existing [GitHub repository](https://github.com/aaronlinguini/double-exposure-online-project) contains only an earlier selected publication, not a mirror of this working repository. Its private visibility and the old website’s 404 response have been verified. Editing a file on GitHub does not automatically update the local copy, and saving or committing locally does not publish it. When publication is requested later, remote and local edits must first be compared. The Google deployment is separate; a frontend publication does not replace its code or settings.

The [Photo archive Apps Script project](https://script.google.com/home/projects/1gj7CIChAW6rMFOmP_Pb16TWSAwUKzZQxnOUOvvEUvDFOwQxKo65lYols/edit) runs in **aaron.double.exposure.project@gmail.com**. Version 4 deployed the Google-hosted visitor bridge on October 30, 2026, at **6:10 PM**. Version 5 deployed faster source scanning at **6:44 PM**. Version 6 added same-base colour variants and one batched read for the three existing archive tabs at **10:00 PM**, keeping the same `/exec` URL, account, Anyone access, OAuth scopes, and archive folders. The user explicitly approved activating the existing photo service; **`UPLOADS_PAUSED=false`** was saved and verified. No personal-folder sharing or new authorization/setup is needed, and working archive IDs must be preserved.

The final collection refresh verified all **113 artist bases**, with no deferred files, skipped files, or issues. Chrome and a fresh in-app-browser page connected successfully from the local port-5500 site after service activation. The earlier zero-base result concerned an old two-file upload; consult [GOOGLE-SETUP.md](GOOGLE-SETUP.md) for the current details. User photographs have not been altered. Around **9:09 PM on October 30**, the user reported that manual double-exposure generation succeeded. Archive-folder contents, consent-based moves, duplicate reuse, another pairing, and real mobile-camera behaviour have not been independently verified. Earlier browser automation could not select a local file because the Chrome extension lacked local-file access.

The delivery path has one authoritative artist library: the assets listed in `assets/base-photos.json` and the matching private `AssetCatalog.gs`. Only artist source-index entries with matching SHA-256, MIME type, and byte length can be selected. The browser encodes each raw filename, downloads it from the same website, and verifies its size and SHA-256 before using the unchanged renderer. It caches the two most recently loaded assets. A missing or mismatched mapped artist asset fails; Google does not silently return another artist pool or base64 fallback. Opted-in participant bases stay dynamic in the existing Google pool.

Drive permissions and archive safeguards remain unchanged. Google still scans retained originals using metadata and bounded header checks, and fully verifies existing original bytes when a duplicate upload must be reused. Archive writes remain restricted to app-created, app-marked files through `drive.file`; `PROJECT_OWNER_EMAIL` must match the dedicated account. Retained Drive artist copies are still needed for the index and original verification. No account-wide write/delete scope, OAuth grant, or folder-ID change is required.

Open `double-exposure.html` through Live Server at `http://127.0.0.1:5500/`, or serve this folder on the same allowed port with the command below. Use one local server at a time. The live archive needs the deployed Google service and an allowed origin; **a published website or GitHub Pages bridge asset is no longer required**.

```sh
python3 -m http.server 5500 --bind 127.0.0.1
```

## Files

- `index.html`: home page with separate Experiments and Interactive link lists.
- `experiment-1.html`, `experiment-2.html`, and `experiment-3.html`: editable photo/reflection page templates with a commented-out entry example.
- `double-exposure.html`: the double-exposure tool’s HTML; loads its external stylesheet and scripts.
- `styles.css`: shared page styling and responsive layouts.
- `scripts.js`: photo loading, pairing, light processing, finished-image rotation, and downloads.
- `local-test.html`, `local-test.js`, and `local-test.css`: browser-only comparison controls and layout without Google.
- `tone-adjustments.js`: optional finishing curve for the local test only; excluded from the public website files.
- `film-renderer.js`: experimental revised/saved smooth-exposure and assumed film-response models, loaded only by the local comparison page.
- `project-config.js`: the public Google deployment URL, artist colour option, and connection timeouts.
- `archive-workflow.js`: original → develop → result archive workflow, consent, saved colour variants, another pairing, and retries.
- `drive-storage.js`: website-side Google connection.
- `drive-bridge.js`: canonical visitor bridge source, generated into Google's private `Client.gs` so the bridge can be served by Google.
- `base-assets.js`: same-site artist-file loading, exact size/SHA checks, and a two-asset cache.
- `assets/base-photos/` and `assets/base-photos.json`: selected artist image files and their generated public manifest.
- `artist-import.js` and `artist-import.css`: external assets for the owner-only import page; they contain no Google access credentials.
- `google-apps-script/`: private Code.gs workflow, Drive/Sheets adapters in Storage.gs, generated Client.gs and AssetCatalog.gs, Bridge.html, optional owner-only Artist.html, and the dedicated-account manifest.
- `scripts/build-google-client.cjs`: rebuilds `Client.gs` from `drive-bridge.js`; use `--check` to confirm they match without writing.
- `scripts/build-base-assets.cjs`: validates selected photo files and regenerates the public manifest and private Google catalog without changing the images.
- `tests/`: numerical, archive workflow, backend persistence, and transport checks.

There are no inline styles, executable script bodies, or inline event handlers in the HTML. All authored scripts and styles are separate files. No third-party frontend packages, remote fonts, or tracking are used. The deployed archive uses Google's HTML-service runtime.

## Artist base files

1. Copy selected JPEG, PNG, WebP, or AVIF files, up to 30 MiB each, directly into `assets/base-photos/`. Keep their raw filenames. The folder accepts no subfolders or unrelated files apart from `.DS_Store`.
2. Run `node scripts/build-base-assets.cjs`, then `node scripts/build-base-assets.cjs --check`. The builder hashes and validates every file, keeps one manifest entry per identical byte sequence, and does not delete, rename, resize, or re-encode photographs.
3. Keep the corresponding byte-identical Drive originals for the current source index and duplicate checks. New or changed local assets must match indexed artist originals; adding only an unmapped local file does not make it eligible.
4. Save the generated `google-apps-script/AssetCatalog.gs` in the existing Google project. Save `Code.gs` too only when its code changed, then deploy a new version of that existing endpoint. No new authorization or setup is needed. Refresh the owner collection check and confirm the catalog has no unmatched assets.

The public manifest, `base-assets.js`, and selected image files belong in a future approved website package. The Google catalog and backend stay private. Local builds do not publish anything.

## Exposure treatment

The main website uses the saved Current treatment: restored linear addition followed by contrast 12, at 0/0 EV. It now matches the local left-hand Saved Current preview. It works pixel by pixel on the aligned photographs: decode sRGB, scale each channel by `2 ** exposureEV`, add the two photographs, and clip each channel independently at white before the contrast curve. White stays white and black reveals the other photograph with the selected contrast applied. This treatment is symmetric. The experimental treatments and finishing sliders remain local only.

The default Reduced overlap trial combines matching linear-light values through a continuous power sum. Haze reduction 0% uses the exact saved Current addition; increasing it reduces the extra light added where both photographs contribute, without dimming a photograph against black. At 100%, dark overlaps are darker than addition and a bright value admits less detail from the other photograph. The control also affects midtones and can remove some similarly bright details. It treats both photographs symmetrically and does not lower either photograph's overall opacity. The black-and-white option combines the RGB channels first using the same rule as colour, then measures their combined linear luminance before contrast and encoding. It no longer removes source colour differences before the overlap calculation; colour output itself is unchanged.

The existing contrast curve follows this calculation, with contrast 12 on both previews initially. Current + contrast remains available unchanged. The artist-only Contrast slider ranges from 0 to 30 for it and Reduced overlap. Positive contrast darkens dark tones and lightens light tones; it can compress subtle separation and cannot recover a source channel already clipped to white. Haze reduction and contrast are recorded with downloads. The public exposure calculation remains unchanged.

Dark plus dark should generally remain dark, but adding an exposure does not make the finished positive image darker than either source under a monotonic response. This trial makes overlapping tones darker **relative to addition**, not below the brighter source before the separate contrast adjustment. It removes the earlier arbitrary shadow boost. It is a visual approximation for finished scans and digital photographs, not a calibrated film response; their original scene exposures cannot be recovered from JPEG values alone.

The selectable Revised smooth trial keeps the saved single-source EV adjustment and changes how two overlapping pixels combine. Dark overlaps admit more of both photographs; the added contribution tapers in brighter overlaps. It treats the two photographs symmetrically, so swapping the aligned inputs and their EV settings preserves the result. Colour weights change continuously. When both sources contribute to a bright overlap, colour differences also fade according to the remaining highlight headroom; a photograph against black keeps its colour. Any excess RGB values are then scaled together to fit the display. This is a targeted visual overlap rule, not a calibrated emulsion model or a physical sum of exposure estimates.

The saved smooth treatment estimates an exposure from each pixel's linear luminance, applies the two EV settings, adds those estimates, and develops one output luminance through a continuous response. Dark pixels have less influence beside a brighter photograph, reducing the gray veil. Colour uses that shared luminance response with exposure-weighted colour and a common gamut correction, rather than clipping RGB channels at separate thresholds. The treatment accepts digital photographs and scans, but it is an artistic approximation of finished images, not a calibrated film stock.

The later inverse-Reinhard response was removed after review of the artist's analogue examples and website outputs. Numerical boundary checks did not establish a convincing analogue match. This rollback restores the earlier behaviour; it does not claim to finish the film simulation.

`PROJECT_SETTINGS` in `scripts.js` defines the artist's treatment. Google selects a random eligible source; a second pairing avoids the immediately previous base. The participant interface has no exposure sliders or contrast controls. Its **Black and white / Original colour** choices set the output colour mode before photo selection triggers automatic development and can create a new colour variant after saving. The Saved Current calculation remains at contrast 12 and zero exposure adjustment per photograph.

A rendered JPEG does not retain its original scene exposure or a measured film/development/scan response. See [EXPOSURE-NOTES.md](EXPOSURE-NOTES.md) for the current model and limitations.

Portrait photographs are rotated 90 degrees clockwise into landscape orientation before processing, for both the base and participant image. Each full photograph is fitted into the base frame without cropping or stretching; different proportions leave black padding, which contributes no exposure. Results use up to 2,400 pixels on the longest edge, and are smaller if either source would otherwise be enlarged. Before any user rotation, the archive and optional download contain the same JPEG bytes. Rotation and resizing affect working images and results; the participant original is uploaded unchanged.

JPEG, PNG, WebP, and AVIF are accepted, up to 30 MB per file. HEIC and RAW need to be exported to a supported format first. Transparent image regions contribute black (no light).

## Optional local tone adjustments

The approved starting preset is Reduced overlap at Haze reduction 20%, contrast 12, 0/0 EV, and black and white enabled. The **Tone adjustments** sliders sit beside the trial image, above the other editing controls, with all five at zero. Previews stay in view while scrolling the controls. On phones, the trial preview stays above the controls and the saved reference appears below the editor. Zero bypasses the finishing stage completely; the exposure engine and its original pixel calculation are unchanged.

Each slider ranges from −100 to +100. Positive brightens its tonal region; negative darkens it. Blacks affects near-black values, Shadows and Highlights affect broader dark and bright values, and Mids affects the middle range. Whites affects a broad upper range, including pure white: lowering it can turn flat white gray, while raising it pushes bright tones toward white and can clip them. Whites overlaps the Highlights range but has more influence toward the brightest tones. Pure black remains fixed. Lowering a clipped white area changes its brightness; it cannot recover the detail already lost there. These are simple finishing controls, not replicas of Lightroom's processing. With Whites at zero, the other four controls retain their preceding calculation exactly.

The controls affect only the finished right preview, after exposure processing and any contrast adjustment. They work with every local treatment and update the visible image while you drag, without developing the photo pair again. Each update starts from the cached neutral result so repeated edits do not accumulate. JPEG export follows briefly after movement stops or immediately on release; download and rotation buttons stay disabled until the export matches the preview. **Reset tones** restores only the five sliders to zero. **Reset trial** also restores Reduced overlap, Haze reduction 20%, contrast 12, and 0/0 EV, while preserving the colour checkbox. Downloads record the finishing settings separately from the exposure renderer. The public page has no tone sliders.

## Rotate a finished exposure

**Rotate 90°** turns the finished image clockwise and updates the downloaded image. It is available beside the result on the public page and the right preview on the local test. Rotation does not change the source photographs or the exposure calculation. On the public page, the archive retains the image in the orientation in which it was created; rotation changes the preview and download without another archive write.

On the local test, rotation turns the neutral cached result before applying the current tone controls. This keeps later live edits independent of previous adjustments. The selected rotation persists when tone, exposure, colour, or treatment settings change. Reset tones keeps the rotation. Reset trial or selecting a new photograph returns it to zero. Settings downloads record `trial.rotationDegrees` and the rotated output dimensions; the left reference stays unchanged.

## Artist default and visitor colour choice

In `project-config.js`, change `forceBlackAndWhite`:

- `true`: start with **Black and white** selected.
- `false`: start with **Original colour** selected, preserving existing colours, including photographs that are already black and white.

The saved artist setting is still `true`. Reload after changing the configuration. It supplies the initial colour choice on the exposure tool and local comparison; visitors can choose either colour option before selecting a photo or after a result is saved. The local comparison keeps its existing temporary toggle.

Photo selection freezes both the colour mode and future-use consent, including while the photo is queued for the initial connection. Both colour choices remain visible but are disabled while processing or saving. Once the result is saved, changing it starts a new operation with a new submission ID, the same authenticated original, and the same pinned base. The workflow sends `reuse.sameBase=true`; it uploads no second original and inherits the existing consent. Earlier saved results and their recipes remain unchanged. Selecting the already active mode does nothing.

Each operation freezes its mode for rendering, archiving, and retries; an uncertain save retries the identical JPEG and recipe. Another random pairing inherits the current operation's colour mode and requests a different base. **Upload another photo** lets the visitor choose again for a new exposure. This affects the finished output only: original upload bytes, orientation, and future-use consent remain independent and unchanged.

## Result controls

After an image appears, **Upload another photo** and **Create another double exposure using this photo** occupy the original upload-button area above it. The first returns to the photo/camera choices; the second keeps the submitted original and requests a different random base. During **Finishing…**, the second button can queue one pairing, which starts automatically only after the current image receives its save confirmation. A failed save keeps that request queued for Retry saving.

Below the image, **Black and white** and **Original colour** are mutually exclusive radio choices. The existing `forceBlackAndWhite` setting still determines their starting selection, and changing a saved result still uses the same archived-variant workflow. Download and rotation remain below the image.

## Development and saving

The browser develops artist pairings directly from `assets/base-photos/` while Google connects and saves the exact original. If Google has already supplied a random candidate from the full artist/participant pool, that candidate is used. Otherwise, the first pairing is selected from the website manifest, excluding the uploaded file’s SHA-256. Consented participant bases remain in the random pool once Google is available; they still need a Google image download. There is no Drive fallback for artist image bytes.

A preview is shown as soon as rendering finishes. Google must confirm the same hash and metadata before the result is archived. No upload response may silently substitute another base. Saving failures retain the preview and the same JPEG for retry; controls unlock only after a matching receipt. Pixel batches use browser message tasks instead of repeated zero-delay timers, preserving all calculations, dimensions and JPEG settings.

## Checks

With Node 18 or newer:

```sh
node --check scripts.js
node scripts/build-google-client.cjs --check
node scripts/build-base-assets.cjs --check
node --test tests/*.test.cjs
```

The current revision passes **405/405 checks**, including local base selection, concurrent rendering and original saving, exact source identity, colour variants, retries, consent and batched sheet reads. Google **Version 8** is deployed on the existing URL. A foreground Live Server test with a synthetic 2400 × 1600 participant image and an actual artist asset displayed the result at **0.92 seconds**, before Google connected at 5.89 seconds; the matching real archive receipt arrived at 18.84 seconds. These are individual test timings, not a guarantee for every photo or device. Physical-device camera and consent-folder checks remain separate.

The checks cover exposure maths, exact original bytes, consent, another pairing, duplicate and self-pairing rules, result eligibility timing, interrupted archive writes, stable retries, limited-access API boundaries, owner imports, iframe-message validation, and the separation of HTML, CSS, and JavaScript. Google services are simulated in those tests; live account authorization and deployment require the setup guide's smoke test.

## Version history

Checkpoint **`cfd8b73`** and Google **Version 7** preserve the state before local-first preview development. Reverting local files and selecting the earlier Google deployment version are separate operations; preserve any later work first.

Git history starts with the current restored project. The `baseline` tag names this first saved version. Later work should be saved in small commits so it can be undone directly.

The version before automatic development on photo selection is saved at **`8069a2c`**. It preserves the separate Create button and original-photo preview. Restore or revert the recorded version after preserving later work to return to that interaction without reconstructing it.

Checkpoint **`736f769`** preserves the version before saved-result colour changes and the preview shown during archiving. Restoring local files does not change the deployed Google version; preserve current work before a rollback and handle the backend deployment separately.

Checkpoint **`29b2d1b`** and the existing Google **Version 6** preserve the state before static artist-asset delivery. Preserve current work before restoring the recorded local files; local rollback and Google deployment selection are separate actions.

The exact state before the film comparison experiment is commit `54a56dd` on `main`, including portrait rotation and the artist's enabled black-and-white setting. The experiment is on `codex/film-comparison`. [The experiment guide](FILM-EXPERIMENT.md#return-to-the-saved-version) explains switching between those saved versions. The older `baseline` tag predates the rotation and colour-option changes.

The version immediately before the smooth-exposure change is also named **`exposure-checkpoint-2026-10-29`** (commit `f03ce10`). It preserves the restored film-curve/current-addition comparison. The smooth trial is saved as a separate commit so it can be undone directly while retaining the checkpoint and history. The version before Revised smooth is commit **`0d5a8ba`**, whose tree matches **`smooth-exposure-checkpoint`** at **`5887061`**. Revised smooth is saved as a separate change; undoing that commit restores the recorded prior version.

The version before Current + contrast is named **`before-current-contrast-trial`**, pointing to **`67ec935`**. Its saved revision can be restored exactly; the contrast trial is recorded separately.

The approved Current + contrast version immediately before Dark/light balance is saved as **`current-contrast-checkpoint`** at **`c1cd211`**. It can be restored directly. The local page also keeps its contrast-12 result in the left preview, and Haze reduction 0% reproduces it with matching EV and colour settings.

The earlier Dark/light balance version, including its shadow boost and original control, is preserved as **`balance-v1-checkpoint`** at **`f9abbd7`**. The Reduced overlap revision is recorded separately so the exact prior code can be restored.

The Reduced overlap version before the black-and-white conversion fix is saved as **`colour-overlap-checkpoint`** at **`a7f543e`**. Its colour output is preserved by the fix; the old monochrome calculation can be restored from that checkpoint.

The layout before the editing sidebar is saved as **`before-editor-sidebar`** at **`a6c0ebe`**. The change moves controls without changing the image processing.

The version before visible tone controls and finished-image rotation is saved as **`before-result-rotation`** at **`747fcaf`**. The new revision can be undone directly after preserving later edits.

The version before the broader Whites control is saved as **`before-whites-control`** at **`fed6171`**. This revision changes only Whites; the four other tone controls retain their previous behaviour when Whites is zero.

The version before live tone previews is saved as **`before-live-tone-preview`** at **`6991e63`**. The tone curve and exposure engine are unchanged by this interaction fix.

The exact project before optional tone controls is saved as **`before-tone-controls`** at **`43740ff`**. The tone controls are a separate change; setting all five to zero also bypasses their processing entirely.

In VS Code, open **Source Control** to see changed files and saved history. To save a version manually, stage the intended files, enter a short description, and commit. Saving a file alone does not create a Git version.

To undo a later committed change, ask to revert that change; Git can create an undo commit while preserving the history. The baseline can also be used to restore a particular file. Earlier versions from before Git was introduced are not automatically part of this history.

## Next stages

Open `index.html` with Live Server to work on the home page and follow its links to the experiment pages. To fill an experiment page:

1. Edit its `<title>` and `<h1>` to change the browser-tab title and visible heading. Change its link text in `index.html` and the experiment-page navigation separately; keep each `href` unchanged unless the file itself is renamed.
2. Put photographs in `images/experiment-1/`, `images/experiment-2/`, or `images/experiment-3/` to match the corresponding page. These folders are ready locally.
3. In `experiment-1.html`, remove the `<!--` and `-->` around the example `<section class="experiment-entry">` to display it. Set the image's `src` to the real filename and replace its `alt` description. Use the corresponding paths in the other two pages.
4. Put your reflection in the empty `<p></p>`. Repeat the complete `experiment-entry` section for another photo/reflection pair. Keep layout changes in `styles.css`; no inline CSS or JavaScript is needed.

Photo files referenced by active experiment HTML load in the local preview, but are **not automatically selected for publication**. The packager includes fifteen core files and only the artist image files explicitly listed in `assets/base-photos.json`—currently 113. It does not sweep in `images/` or experiment photographs. Those need a separate deliberate asset selection before a later manual publication. Never include `AssetCatalog.gs`, backend sources, docs, or private photos automatically.

Run `node scripts/prepare-public-site.cjs` to build `.public-site/` from the fifteen core files and listed artist assets. This only prepares a local copy; it does not publish. If publication is requested later, only that generated copy belongs on the host. README, instructions, tests, local comparisons, backend source including AssetCatalog.gs, secrets, unselected photos, and Git history stay out. Rebuild the asset catalog after changing artist files, then rebuild the package. The packager validates included HTML, JavaScript, photo sizes/hashes, paths, and existing output contents before replacement. Unapproved experiment image links stop packaging instead of silently publishing broken or private images.

To add a further experiment page, create an ordinary `.html` file and add it to the home page's Experiments list and the relevant navigation. Add the page explicitly to `PUBLIC_FILES` in `scripts/prepare-public-site.cjs`, adjust publication checks, and rebuild when it is intended for release. The page's photos, text, layout, and label are yours to choose. Keep Google's `SITE_URL` at the repository root; these static pages need no Apps Script change.

The Google backend includes global request, daily submission, and daily new-file-byte limits plus an owner pause switch. These run inside Apps Script on Google; no rented server is needed. The daily byte allowance is an adjustable intake limit, not total Drive storage capacity. See [GOOGLE-SETUP.md](GOOGLE-SETUP.md) for settings and the live archive check, which is still required after deploying.

The exact project before launch preparation is saved as **`before-launch-setup`** at **`9144f22`**. Image defaults, publication packaging, and archive limits are saved separately so each change can be undone.

The full project before the limited-access rewrite is saved as **`before-limited-drive-access`** at **`f458bb2`**. The image-processing code is unchanged by this rewrite. A local revert does not itself replace deployed Google code or revoke an earlier OAuth grant.

A public gallery, a project-wide finite sequence, and participant-created or edited prompts are not implemented; the current scope is the shared source pool and private archive.

# Double exposure

Participants add a photograph to create a double exposure. The Google connection archives original uploads and finished JPEGs. The revised folder workflow places an explicitly opted-in original in `My_photos` only after its result is saved, with a stable name such as `participant_photo_1.jpg`. It moves that original instead of saving a second copy. Pending and nonconsenting originals remain privately archived in `participant_uploads`, and finished exposures stay in `Completed_double_exposures`.

This tool is one part of a larger interactive artwork. The overall website name is undecided; the artist leads the wording, photo selections, page counts, and layouts, with ordinary HTML/CSS kept easy to edit.

The local home page in `index.html` has **Experiments** on the left, linking to three editable experiment pages, and **Interactive** on the right, linking to `double-exposure.html`. These columns stack in the same order on smaller screens. The experiment pages contain no selected photographs or written reflections yet. This layout and all page drafts remain local and unpublished.

## Try it

To test without Google, right-click `local-test.html` in VS Code and choose **Open with Live Server**. Choose your base photo and a second photo. The left preview keeps the saved **Current** treatment at zero EV and contrast 12. The right starts with **Reduced overlap (trial)** at the same settings, with **Haze reduction 20%**, matching the approved screenshot preset. All five optional tone controls start at zero. Increasing Haze reduction reduces overlapping light across shadows, midtones, and highlights. Dark areas leave the brighter photograph clearer; two dark areas stay closer to their original darkness. Move Haze reduction to 0% to reproduce the saved Current treatment. Current + contrast, Revised smooth, Saved smooth exposure, and the earlier film curve remain available. Adjust each photograph's exposure separately and compare black and white with colour. Use the visible **Tone adjustments** sliders for optional Shadows, Highlights, Mids, Whites, and Blacks finishing controls; **Reset tones** clears only those five controls. Both results use the same full-frame preparation and JPEG export. Download the results and settings to keep a record; nothing is uploaded or automatically archived there. See [FILM-EXPERIMENT.md](FILM-EXPERIMENT.md) for comparisons and how to return to the saved version.

There is no frontend installation or build. The Google archive runs as **Version 5** in the dedicated project account. The user approved activating that existing service, and `UPLOADS_PAUSED=false` is verified. Google serves the visitor bridge itself, so the local tool no longer needs GitHub Pages to connect. The Version 5 release passed **316/316 checks** before the automatic-development UI revision. The user reported successful manual generation around **9:09 PM on October 30**; independent archive-folder, consent, duplicate, and device checks remain pending.

The website itself remains local and unpublished. The last published frontend was the visitor black-and-white release at `949dc1`; local checkpoint `76d40d3` preserves it before the home-page split. The GitHub repository is **private**, and the former GitHub Pages address returns **404: no GitHub Pages site**. No repository files or history were deleted, and no home or experiment draft was published. Activating the Google service does not publish the website. Publishing the finished site will be a separate manual step with guidance; no frontend push or publication is authorized. See [GOOGLE-SETUP.md](GOOGLE-SETUP.md) for the archive status and remaining checks.

## Phones and tablets

The same pages adapt to phones, tablets, and desktop screens. Participants can choose an existing photograph or use **Take a photo**, which asks a supported mobile browser to open the device's camera, preferring the rear camera. The local comparison page offers camera capture for either source. On desktop browsers, a camera control may open an ordinary file chooser instead. No camera stream starts when the page loads.

Camera inputs request JPEG. Library inputs request JPEG, PNG, WebP, or AVIF so the device can supply a supported image. Some Apple photo pickers convert HEIC to JPEG; raw HEIC/HEIF and RAW files are not supported by this project's processor or archive. The original archive keeps the exact file delivered by the picker, including any conversion performed by the device before selection.

To test the local layout on a real phone or tablet, use Live Server's reachable local-network address while both devices are on the same network. `127.0.0.1` or `localhost` on the phone refers to the phone itself, not the computer. An archive connection also needs that exact origin to be allowed by the Google project; the current allowed local origins use port 5500 on the computer. A future published HTTPS address can be tested after publication is explicitly requested.

The comparison page works without Google. On `double-exposure.html`, set the future-use consent and **Black and white** choices before **Upload a photo** or **Take a photo**. Selecting a photo freezes those choices and automatically starts development when the archive is ready. If the initial Google connection is still running, the same photo waits in the queue and starts when it connects. There is no separate Create button or original-photo preview. Centered text says **Please wait while your photo is developed.**, with a spinner, throughout processing. If the archive is unavailable before submission, **Retry** reconnects and resumes the queued photo; **Start over** clears the selection. Pending saves retain their separate retry protections. Disabled upload/camera labels are gray, and content-page navigation appears above the heading.

Before public use, check both library selection and native camera capture on an actual iPhone/iPad and Android device, including cancellation and a portrait photograph. Desktop viewport checks verify layout, not a physical device's camera chooser or HEIC conversion.

1. Drag chosen base photos directly into [My_photos](https://drive.google.com/drive/folders/1KTwgNyGgTgv8HwT1MrBaJeWk-JJIupKY), signed into **aaron.double.exposure.project@gmail.com**. The active service indexes new or changed images in bounded batches when the site connects or begins a pairing, reusing a completed scan for up to one minute. Large batches can need repeated scans. The Apps Script editor can also refresh the collection. The optional owner page still needs its CSS/JavaScript from `SITE_URL`, which are unavailable while Pages is offline; that page is not required for direct Drive intake or the visitor bridge.
2. Set **Black and white** and decide whether the submitted original may join the base-photo library; future-use consent starts unchecked. Then choose **Upload a photo** or **Take a photo**. Development starts automatically, with both choices fixed for this exposure.
3. Wait for the double exposure to appear. It is revealed only after a matching save receipt, without a separate success message. Downloading a copy is optional. If another eligible base is available, **Pair this image with a different photo** creates another result using the same original and choices without saving another original. Identical finished JPEGs reuse one archived result file. **Start over** clears the page; it does not delete archived files.

The tool page stays minimal and black, with no exposure sliders or collection-management panel. A private Google Sheet records consent, source IDs, and each result. The future-use checkbox starts unchecked and controls entry into the shared base-photo pool; it does not turn off the private original archive. Server-computed SHA-256 checks reuse identical original files across artist and participant records and identical results across repeated tests or pairings. An existing artist photo is reused without renaming or moving it. No image pairs with identical bytes, and pending saves keep their assigned base. Renaming a file does not bypass this check. Edited, resized, or re-exported files can have different bytes and are not guaranteed to match. Copies manually dragged into Drive are detected and indexed once, but the program does not silently delete those externally created files.

The existing [GitHub repository](https://github.com/aaronlinguini/double-exposure-online-project) contains only an earlier selected publication, not a mirror of this working repository. Its private visibility and the old website’s 404 response have been verified. Editing a file on GitHub does not automatically update the local copy, and saving or committing locally does not publish it. When publication is requested later, remote and local edits must first be compared. The Google deployment is separate; a frontend publication does not replace its code or settings.

The [Photo archive Apps Script project](https://script.google.com/home/projects/1gj7CIChAW6rMFOmP_Pb16TWSAwUKzZQxnOUOvvEUvDFOwQxKo65lYols/edit) runs in **aaron.double.exposure.project@gmail.com**. Version 4 deployed the Google-hosted visitor bridge on October 30, 2026, at **6:10 PM**. Version 5 deployed faster source scanning at **6:44 PM**, keeping the same `/exec` URL, account, OAuth scopes, and archive folders. The user explicitly approved activating the existing photo service; **`UPLOADS_PAUSED=false`** was saved and verified. No personal-folder sharing or new authorization/setup is needed, and working archive IDs must be preserved.

The final collection refresh verified all **113 artist bases**, with no deferred files, skipped files, or issues. Chrome and a fresh in-app-browser page connected successfully from the local port-5500 site after service activation. The earlier zero-base result concerned an old two-file upload; consult [GOOGLE-SETUP.md](GOOGLE-SETUP.md) for the current details. User photographs have not been altered. Around **9:09 PM on October 30**, the user reported that manual double-exposure generation succeeded. Archive-folder contents, consent-based moves, duplicate reuse, another pairing, and real mobile-camera behaviour have not been independently verified. Earlier browser automation could not select a local file because the Chrome extension lacked local-file access.

The backend uses Drive **read-only** access within the project account to discover photos dropped into **My_photos**. That Google grant can read any Drive file accessible to the account; the code narrows source reads to the configured folder. Archive writes remain restricted to app-created, app-marked files through `drive.file`, with no account-wide Drive write/delete scope. `PROJECT_OWNER_EMAIL` must match the executing account. Faster scans use Drive's SHA-256 checksum with bounded image-header checks where supported, reuse unchanged records, and continue large batches across requests without a scheduled trigger. Full-image reads remain bounded to 10 files and 64 MiB per scan, and actual source bytes are verified when selected for a pairing. Manually duplicated artist files are indexed ineligible rather than deleted. Participant provenance and consent remain independent of filenames; opted-in originals move to the shared base folder without being copied. Cross-role duplicate attempts are rejected, and pending exposures pin their base checksum.

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
- `archive-workflow.js`: original → develop → result archive workflow, consent, another pairing, and retries.
- `drive-storage.js`: website-side Google connection.
- `drive-bridge.js`: canonical visitor bridge source, generated into Google's private `Client.gs` so the bridge can be served by Google.
- `artist-import.js` and `artist-import.css`: external assets for the owner-only import page; they contain no Google access credentials.
- `google-apps-script/`: private Code.gs workflow, Drive/Sheets adapters in Storage.gs, generated Client.gs, Bridge.html, optional owner-only Artist.html, and the dedicated-account manifest.
- `scripts/build-google-client.cjs`: rebuilds `Client.gs` from `drive-bridge.js`; use `--check` to confirm they match without writing.
- `tests/`: numerical, archive workflow, backend persistence, and transport checks.

There are no inline styles, executable script bodies, or inline event handlers in the HTML. All authored scripts and styles are separate files. No third-party frontend packages, remote fonts, or tracking are used. The deployed archive uses Google's HTML-service runtime.

## Exposure treatment

The main website uses the saved Current treatment: restored linear addition followed by contrast 12, at 0/0 EV. It now matches the local left-hand Saved Current preview. It works pixel by pixel on the aligned photographs: decode sRGB, scale each channel by `2 ** exposureEV`, add the two photographs, and clip each channel independently at white before the contrast curve. White stays white and black reveals the other photograph with the selected contrast applied. This treatment is symmetric. The experimental treatments and finishing sliders remain local only.

The default Reduced overlap trial combines matching linear-light values through a continuous power sum. Haze reduction 0% uses the exact saved Current addition; increasing it reduces the extra light added where both photographs contribute, without dimming a photograph against black. At 100%, dark overlaps are darker than addition and a bright value admits less detail from the other photograph. The control also affects midtones and can remove some similarly bright details. It treats both photographs symmetrically and does not lower either photograph's overall opacity. The black-and-white option combines the RGB channels first using the same rule as colour, then measures their combined linear luminance before contrast and encoding. It no longer removes source colour differences before the overlap calculation; colour output itself is unchanged.

The existing contrast curve follows this calculation, with contrast 12 on both previews initially. Current + contrast remains available unchanged. The artist-only Contrast slider ranges from 0 to 30 for it and Reduced overlap. Positive contrast darkens dark tones and lightens light tones; it can compress subtle separation and cannot recover a source channel already clipped to white. Haze reduction and contrast are recorded with downloads. The public exposure calculation remains unchanged.

Dark plus dark should generally remain dark, but adding an exposure does not make the finished positive image darker than either source under a monotonic response. This trial makes overlapping tones darker **relative to addition**, not below the brighter source before the separate contrast adjustment. It removes the earlier arbitrary shadow boost. It is a visual approximation for finished scans and digital photographs, not a calibrated film response; their original scene exposures cannot be recovered from JPEG values alone.

The selectable Revised smooth trial keeps the saved single-source EV adjustment and changes how two overlapping pixels combine. Dark overlaps admit more of both photographs; the added contribution tapers in brighter overlaps. It treats the two photographs symmetrically, so swapping the aligned inputs and their EV settings preserves the result. Colour weights change continuously. When both sources contribute to a bright overlap, colour differences also fade according to the remaining highlight headroom; a photograph against black keeps its colour. Any excess RGB values are then scaled together to fit the display. This is a targeted visual overlap rule, not a calibrated emulsion model or a physical sum of exposure estimates.

The saved smooth treatment estimates an exposure from each pixel's linear luminance, applies the two EV settings, adds those estimates, and develops one output luminance through a continuous response. Dark pixels have less influence beside a brighter photograph, reducing the gray veil. Colour uses that shared luminance response with exposure-weighted colour and a common gamut correction, rather than clipping RGB channels at separate thresholds. The treatment accepts digital photographs and scans, but it is an artistic approximation of finished images, not a calibrated film stock.

The later inverse-Reinhard response was removed after review of the artist's analogue examples and website outputs. Numerical boundary checks did not establish a convincing analogue match. This rollback restores the earlier behaviour; it does not claim to finish the film simulation.

`PROJECT_SETTINGS` in `scripts.js` defines the artist's treatment. Google selects a random eligible source; a second pairing avoids the immediately previous base. The participant interface has no exposure sliders or contrast controls. Its **Black and white** checkbox sets the output colour mode before photo selection triggers automatic development. The Saved Current calculation remains at contrast 12 and zero exposure adjustment per photograph.

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

- `true`: start the visitor's **Black and white** checkbox checked.
- `false`: start it unchecked, preserving the photographs' existing colours, including photographs that are already black and white.

The saved artist setting is still `true`. Reload after changing the configuration. It supplies the initial colour choice on the exposure tool and local comparison; visitors change the tool's checkbox before selecting a photo, and the local comparison keeps its existing temporary toggle.

Photo selection freezes both the colour mode and future-use consent, including while the photo is queued for the initial connection. The public colour checkbox is hidden after selection and while a completed exposure is shown. Each exposure keeps its mode for rendering, archiving, retries, and further pairings, so its displayed result, downloaded JPEG, and archived JPEG use the same colour mode. **Start over** lets the visitor choose again for a new exposure. This affects the finished output only: original upload bytes, orientation, and future-use consent remain independent and unchanged.

## Checks

With Node 18 or newer:

```sh
node --check scripts.js
node scripts/build-google-client.cjs --check
node --test tests/*.test.cjs
```

The automatic-development revision passes **319/319 checks**. Browser checks verified the central developing state on desktop and a 390-pixel phone viewport using a deliberately delayed simulated save. That visual check does not claim a new live Google upload.

The checks cover exposure maths, exact original bytes, consent, another pairing, duplicate and self-pairing rules, result eligibility timing, interrupted archive writes, stable retries, limited-access API boundaries, owner imports, iframe-message validation, and the separation of HTML, CSS, and JavaScript. Google services are simulated in those tests; live account authorization and deployment require the setup guide's smoke test.

## Version history

Git history starts with the current restored project. The `baseline` tag names this first saved version. Later work should be saved in small commits so it can be undone directly.

The version before automatic development on photo selection is saved at **`8069a2c`**. It preserves the separate Create button and original-photo preview. Restore or revert the recorded version after preserving later work to return to that interaction without reconstructing it.

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

Photo files referenced by active HTML load in the local preview, but are **not automatically selected for publication**. Keep private photos out of any future public package. The current packager includes only the thirteen explicitly listed HTML/CSS/JavaScript files; selected image assets and support for their folder paths must be added deliberately before a later manual publication.

Run `node scripts/prepare-public-site.cjs` to build `.public-site/` with those thirteen files: the home page, tool page, three experiment pages, and eight existing styles/scripts. This only prepares a local copy; it does not publish. If publication is requested later, only the generated copy belongs on the host. README, instructions, tests, local comparisons, backend source, secrets, private photos, and Git history stay out. Rebuild after editing a listed website file. The packager validates every included HTML page and rejects inline code/styles, unpublished links, invalid JavaScript, symlinks, and unexpected output files before replacement. An uncommented image example with no approved real asset will therefore stop packaging rather than silently publish a broken or private image.

To add a further experiment page, create an ordinary `.html` file and add it to the home page's Experiments list and the relevant navigation. Add the page explicitly to `PUBLIC_FILES` in `scripts/prepare-public-site.cjs`, adjust publication checks, and rebuild when it is intended for release. The page's photos, text, layout, and label are yours to choose. Keep Google's `SITE_URL` at the repository root; these static pages need no Apps Script change.

The Google backend includes global request, daily submission, and daily new-file-byte limits plus an owner pause switch. These run inside Apps Script on Google; no rented server is needed. The daily byte allowance is an adjustable intake limit, not total Drive storage capacity. See [GOOGLE-SETUP.md](GOOGLE-SETUP.md) for settings and the live archive check, which is still required after deploying.

The exact project before launch preparation is saved as **`before-launch-setup`** at **`9144f22`**. Image defaults, publication packaging, and archive limits are saved separately so each change can be undone.

The full project before the limited-access rewrite is saved as **`before-limited-drive-access`** at **`f458bb2`**. The image-processing code is unchanged by this rewrite. A local revert does not itself replace deployed Google code or revoke an earlier OAuth grant.

A public gallery, a project-wide finite sequence, and participant-created or edited prompts are not implemented; the current scope is the shared source pool and private archive.

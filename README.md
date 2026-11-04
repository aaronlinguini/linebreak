# &lt;br&gt;

## Publishing website changes

Requested website changes are validated, committed, and pushed on `main` by default, without another publication confirmation. Preserve unrelated work and stage only the intended changes. You can also use **Commit & Push** in VS Code whenever you edit the site yourself. This folder is connected to [aaronlinguini/linebreak](https://github.com/aaronlinguini/linebreak); the rename and local origin were verified, preserving the existing repository ID and history. GitHub Actions runs the checks, prepares `.public-site`, and publishes the result to [the website](https://line-break.ca/). Check that the **Publish website** run succeeds before reporting the update live. A failed run keeps the previous deployed site.

CSS and JavaScript cache labels are generated automatically during that build. Ordinary root HTML files are website pages; `local-test.html` stays a local comparison and is excluded from Pages. Its shared JavaScript/CSS and the personal-studio adapter are published as static dependencies, without a public studio page or navigation link. Photos under `images/` are included in the website build when an active page references them. Keep editing source files rather than `.public-site`. Credentials, incoming uploads, temporary backups and generated copies remain ignored. Source code, tests, documentation and Git history are now in the normal GitHub repository; the deployed website contains only its prepared pages and assets.

The separate selected-copy publication records below describe the earlier setup. Normal pushes from this folder replace that workflow.


Configured addresses: [&lt;br&gt;](https://line-break.ca/) · [Double-exposure tool](https://line-break.ca/double-exposure.html) · [Public repository](https://github.com/aaronlinguini/linebreak). The visible site name remains literal &lt;br&gt;.

The custom-domain cutover was verified November 2, 2026. `line-break.ca` has valid HTTPS, `www.line-break.ca` redirects to it, and GitHub's **Enforce HTTPS** setting remained enabled after reloading. Eight delivered website/support files matched the prepared bytes. Google's `SITE_URL` now uses `https://line-break.ca/`; its allowed origins retain local previews and the old GitHub origin alongside both domain names. The anonymous tool and private owner studio loaded without errors, using the new-domain assets. Repository, Google endpoint, Version 12, account, scopes, and archive IDs are unchanged. No new photo uploads or saves were tested for this address change.

Initial selected-copy publication (historical), November 1, 2026: one `Publish website` commit (`4e4ecec`) containing 21 site/support files and 113 selected photos. Development history and this README were excluded. Pages deployment succeeded; 30 delivery checks passed, and the live tool completed Google bootstrap. A new live upload/save and physical iPhone HEIC/camera tests are still separate checks. That selected-copy workflow has been superseded by the normal commit, push, and Actions deployment workflow above.

Participants must choose **Yes** or **No** before uploading or taking a photograph; neither answer is selected by default. In the consent-retention revision, **Yes** retains a new original in the existing private `participant_uploads` folder, without moving it to `My_photos`; it becomes eligible as a participant base only after a completed result. **No** validates the fresh original transiently but writes neither its bytes to Drive nor a row to **Sources**; only the finished double exposure is archived. **Submissions** stores an opaque `unretained:<sha256>` original reference for that No operation. There is no bulk migration or deletion of existing archives, including previously retained No files. A previously retained participant original can move from My_photos to participant_uploads on a new authorized Yes completion, preserving its file ID and bytes without a copy; artist originals remain in My_photos. The requested folder display name is participant_uploads, replacing the former TO BE DELETED suffix on the same folder ID without moving or deleting files. Google Version 9 was deployed November 2 at 1:36 PM in the dedicated project account on the existing endpoint, with Anyone access and unchanged scopes, properties, and folder IDs. Saved Code.gs matched local bytes after editor reload (SHA-256 42067f2d67a72284e887bcd32df48727ab3c7f00a1c2602fa7932cab1791a5c9); Version 8 remains available for rollback. The same originals folder was renamed participant_uploads and its name was verified after reload. All 479 automated checks pass. No new live photo submission or physical-device check was performed in this revision.

This tool is one part of a larger interactive artwork. The website is named &lt;br&gt;, displayed as literal text, and Experiment 3 is called Apparitions. The artist leads the wording, photo selections, page counts, and layouts, with ordinary HTML/CSS kept easy to edit.

The home page in `index.html` has **Interactive photographic project** on the left, linking to `double-exposure.html`, and **Photographic experiments & reflections** on the right, linking to Sketch, Memory Part 1, Memory Part 2, and Apparitions. Mobile stacks Interactive before Experiments. To adjust the scroll space below both boxes, change `padding-bottom: 60vh` in the `.home-links` rule in `styles.css`; `60vh` is 60% of the viewport height. The experiment pages contain the selected photographs and reflections. Edit their source files; validated requested changes follow the commit, push, and Actions deployment workflow above.

## Pairing choices and contribution history

The compact layout in [commit 55d76d6](https://github.com/aaronlinguini/linebreak/commit/55d76d6) passed [Pages run 41715232964](https://github.com/aaronlinguini/linebreak/actions/runs/41715232964) with **594/594 CI checks**. **Google Version 16** deployed November 3, 2026, at **3:52 PM Toronto time**, with the same endpoint, account, access, and settings. Public HTML/CSS matched prepared HTTPS bytes (6,914 / 13,139); the artist-first, shared-default buttons were compact grey 11px controls. Mobile order is consent, Upload, pool; the 390px layout had no overflow. Saved/reloaded Studio.html matched 10,333 bytes, SHA-256 `93004b0f2eb4ad430345e4deec07806938bf607f445a549046507ce38387210b`, changing only its CSS content label. No JavaScript, backend, or renderer logic changed. A fresh authenticated studio was ready to choose two photographs, with no errors, no selected files, and all eight line-break.ca stylesheet/script URLs matching the current template, including the new CSS label; no new upload/archive or physical-phone test is claimed.

The initial pairing/history release is published, and **Google Version 14** was deployed November 3, 2026, at **11:55 AM Toronto time**. [Feature commit 1bb1692](https://github.com/aaronlinguini/linebreak/commit/1bb169246a11ddc6f925ece15532b48d3005294c) passed [Pages run 41676784494](https://github.com/aaronlinguini/linebreak/actions/runs/41676784494) with **594/594 CI checks**. Both generated-template builder checks pass, and the regenerated private Studio.html is installed.

The presentation follow-up in [commit 4160f28](https://github.com/aaronlinguini/linebreak/commit/4160f28) is published by [Pages run 41690646401](https://github.com/aaronlinguini/linebreak/actions/runs/41690646401), which passed **594/594 CI checks** (the local Node 18 run passed 592/592). **Google Version 15** was verified active November 3, 2026, at **1:24 PM Toronto time**. It replaces the checkbox with two native radio choices styled as buttons, beside Upload on desktop and stacked on mobile. Saved/reloaded Studio.html matched 10,333 bytes, SHA-256 `f05e3045a63cfb576b0859ff51178164a01bcd47eac8008dbee359b873e97b0d`. The public HTML, CSS, and JavaScript matched the prepared HTTPS bytes; a fresh page showed the two radios with the shared library selected. Desktop alignment, 390px mobile layout without overflow, arrow-key selection, and independent Yes/No consent were checked without selecting/uploading a file. Backend logic and settings are unchanged. A fresh authenticated private studio was ready to choose two photographs, with no errors and all eight line-break.ca stylesheet/script URLs matching the current template hashes; no files were selected or uploaded. The public control check did not establish completion of its background bootstrap.

In the first phase, Google Version 13 deployed November 3 at 11:29 AM. Saved and reloaded Code.gs matched 64,527 local bytes, SHA-256 `2c1fec8bafb8fc6feb018b2abecd29e507a67a1553505c910fdc6f39182cae79`. A live bootstrap check returned 128 mixed sources (113 artist, 15 participant), 113 artist-only sources with no participants, and only 15 participants after excluding all 113 website hashes, with no excluded candidate returned. No originals were uploaded for these checks. Local responsive browser QA at 390px had no horizontal overflow; this is not physical-device testing.

Version 14 saved/reloaded Studio.html matched 10,333 bytes, SHA-256 `d0183a8777e8ce237cb64210d9eb77150a9b1310c7e83856fe1cebaa4f5771c5`, changing only its two stylesheet/script content labels. Six public files returned 200 and matched prepared bytes. The public checkbox had the exact requested label and remained independent of Yes/No; either retention answer enabled upload without selecting a file. Responsive browser QA at 390 × 844 showed a 390px page without horizontal overflow, including the longer label. No photo upload or archive test was performed. A fresh authenticated owner studio loaded normally, ready to choose two photographs, and all eight stylesheet/script URLs used the new domain, including the current styles.css and scripts.js labels. A fresh public page cleared bootstrap status with error/retry hidden; the pool checkbox was unchecked and both consent answers unanswered.

The default connected draw uses the mixed library: Aaron's selected photographs and eligible originals that participants agreed to share. Every eligible unique file fingerprint has the same chance; Drive photos receive no extra preference. The library choices are **Only pair my photo with Aaron's original base library** first and **Use full shared library** second (selected by default), in one mutually exclusive radio group below the complete Yes/No contribution text and Upload controls. The compact grey buttons fit their content, with 11px labels and a 32px minimum height. Desktop keeps Upload beside consent and the pool group on the full row below; mobile orders consent, Upload, then pool choices. Choose a library before selecting or taking a photo, or change it after a confirmed result for the next pairing with that photo. Both choice groups stay visible and lock while development or saving is pending. Each operation and its retries keep their frozen pool; colour variants retain their existing pair. The **Yes / No** answer is separate and applies once per upload. After the first confirmed result it clears once, labelled **For your next new photo**. A next-upload answer carries through further pairings and the new-image reset without changing consent for the current original.

The browser remembers fingerprints of selected photos so those exact files can be excluded from later pairings. It stores fingerprints, not photograph bytes, in that browser's storage for the current website origin. Another browser/device, private browsing, clearing site data, blocked storage, or a different website origin can lose or separate that history. Photos contributed before this feature cannot be recognized automatically unless their fingerprints are remembered now. Edited or re-exported versions may have different fingerprints. This is a local history, not account-based identification.

Artist photographs still load from the website; participant photographs still come from Drive. The existing fast local website fallback can start while Google connects. If a valid local pool has no eligible photograph left, the selected photo continues to the server's chosen pool without a local preview; an eligible participant base may still be available in the mixed library. A corrupt manifest or image-integrity failure remains an error rather than silently choosing another photograph. A later connection never replaces a displayed pair.

## Try it

To test without Google, right-click `local-test.html` in VS Code and choose **Open with Live Server**. Choose your base photo and a second photo. The left preview keeps the saved **Current** treatment at zero EV and contrast 12. The right starts with **Reduced overlap (trial)** at the same settings, with **Haze reduction 20%**, matching the approved screenshot preset. All five optional tone controls start at zero. Increasing Haze reduction reduces overlapping light across shadows, midtones, and highlights. Dark areas leave the brighter photograph clearer; two dark areas stay closer to their original darkness. Move Haze reduction to 0% to reproduce the saved Current treatment. Current + contrast, Revised smooth, Saved smooth exposure, and the earlier film curve remain available. Adjust each photograph's exposure separately and compare black and white with colour. Use the visible **Tone adjustments** sliders for optional Shadows, Highlights, Mids, Whites, and Blacks finishing controls; **Reset tones** clears only those five controls. Both results use the same full-frame preparation and JPEG export. Download the results and settings to keep a record; nothing is uploaded or automatically archived there. See [FILM-EXPERIMENT.md](FILM-EXPERIMENT.md) for comparisons and how to return to the saved version.

### Private personal studio

The personal studio is served by **Google Version 16** with its verified Version 12 viewport fix and the installed template pointing to current published asset hashes. Open [the private studio](https://script.google.com/macros/s/AKfycbyzIdwIui57NUjmTMm_XyNMvWNHZixo4UyMedoRtz7Qod4COqvjAbcwGDQounUvsCPv/exec?view=studio) signed into **aaron.double.exposure.project@gmail.com**. Google serves the generated `Studio.html` only when the active account matches the executing account and configured project owner. There is no studio link on the public website. Ordinary `local-test.html` remains local-only, with no uploads.

The private studio uses the same comparison controls, with automatic saving added separately from device downloads. Once completed reference and trial outputs have settled for 800 ms, their exact current JPEGs are saved to the app-managed **Personal_double_exposures** folder. The chosen source photographs are never sent separately. These personal results do not enter the visitor source pool, index, or Usage ledger. The new `EXPOSURE_OWNER_RESULTS_FOLDER_ID` property identifies this separate folder; existing archive IDs stay unchanged.

Each output type keeps only its latest queued version. An in-flight save or retry keeps its exact frozen JPEG, and a reused saved reference Blob is not sent again. A matching hash, byte count, dimensions, file URL, and folder receipt are required before the studio says it is saved. Transient failures retry automatically; other failures retain manual retry. Keep the page open until saving is confirmed. Device image/settings downloads remain independent and unchanged.

Build and check the private template whenever the comparison page or its dependencies change:

```sh
node scripts/build-owner-studio.cjs
node scripts/build-owner-studio.cjs --check
```

The builder derives the final public content-hashed CSS/JavaScript URLs. The five added static dependencies are `local-test.js`, `local-test.css`, `film-renderer.js`, `tone-adjustments.js`, and `owner-studio.js`; they contain no credentials. `local-test.html`, generated `google-apps-script/Studio.html`, and backend sources stay out of the Pages artifact. Publish the matching dependencies, save the generated **Studio.html** and affected Google sources, then update the existing Google deployment without changing its endpoint, account, Anyone access, scopes, or existing IDs. No new authorization or setup is required. See [GOOGLE-SETUP.md](GOOGLE-SETUP.md) for the installation checks.

The installed Code.gs, OwnerStudio.gs, and Studio.html matched local bytes after saving and reloading the Google editor. [Pages run 41542819967](https://github.com/aaronlinguini/linebreak/actions/runs/41542819967) published [commit 89bf43e](https://github.com/aaronlinguini/linebreak/commit/89bf43e8c0179964bd8712e711233dde97e0c338); six support files matched prepared bytes, and public `local-test.html` returned 404. The owner page loaded in the project account, while an anonymous browser was denied. Two synthetic source PNGs produced saved reference/trial JPEGs, then changing contrast from 12 to 13 produced a third saved JPEG; no original photographs were stored. The three test JPEGs were then moved to recoverable Drive Trash, leaving **Personal_double_exposures** empty and still private. No real photographs or permanent deletion were involved. No physical-phone check was performed; existing device downloads are unchanged.

Version 12 adds Google's outer-page viewport through `HtmlOutput.addMetaTag('viewport', 'width=device-width, initial-scale=1')`; Apps Script ignores the equivalent meta tag inside its HTML file. Saved and reloaded OwnerStudio.gs matched 3,677 bytes and SHA-256 `3e8f881f19279e89c225b3fadc01ad5ea9772e3ff6836c005e5b6e7a46b59dd4`. The live outer document now exposes the intended viewport value. Responsive browser QA at 390 × 844 verified a 390px inner page with no horizontal overflow; this was not a physical-phone test. All 17 backend studio tests pass; Code.gs, Studio.html, public assets, and saving/download behavior are unchanged.

There is no frontend dependency installation. Google **Version 16** keeps the existing endpoint, dedicated account, Anyone access, scopes, properties, and archive IDs, with **Version 15** as the preceding release and Version 12 retained before the feature. Live bootstrap checks verified the mixed/artist-only/history filters without uploading originals. The same originals folder remains named `participant_uploads`; no real or synthetic photo upload or new archive test was performed for this feature.

The saved-result colour toggle and earlier rendered preview are implemented locally, and their backend changes are installed in **Google Version 6**. `Code.gs` and `Storage.gs` were verified byte-for-byte after reloading the Google editor. Browser checks use the real image processor with simulated storage; both colour directions, pending-preview locks, and the unlocked checkbox after a receipt were verified. These checks do not establish a live archived colour variant. A fresh Version 6 Chrome/Live Server connection completed bootstrap after **Retry**; its initial handshake timed out without an established cause. These changes preserve the exposure calculation, original files, consent, scopes, and archive IDs.

The selected **113 artist bases** have byte-exact local copies in `assets/base-photos/`. Google `Code.gs` and `AssetCatalog.gs` matched their local files after editor reload. The **11:39:43 PM** owner refresh verified all **113/113** catalog/index matches, with zero unmatched, skipped, deferred, or issue entries. Browser checks loaded the actual **4,702,374-byte** `30thbirthday.JPG` over direct same-site HTTP with a SHA query and no load errors, verified it through the loader, and used the real processor in both colour modes. The archive was simulated, so no new external photo upload or live saved-result claim follows. A fresh Version 7 Chrome/Live Server bootstrap completed after Retry, clearing status and errors; its first handshake timed out. No photo was resized, re-encoded, or renamed by the builder.

Release `0514c19` in [apparitions](https://github.com/aaronlinguini/apparitions) was deployed by [Publish website run 41371532468, attempt 2](https://github.com/aaronlinguini/apparitions/actions/runs/41371532468/attempts/2) after 453 checks passed. This update changes the site name to literal &lt;br&gt; and Experiment 3 to Apparitions, and includes the test timing fix. The updated local suite passes 456 checks; GitHub Actions validates and deploys pushed updates. See [GOOGLE-SETUP.md](GOOGLE-SETUP.md) for service details and remaining checks.

## Phones and tablets

The same pages adapt to phones, tablets, and desktop screens. Participants can choose an existing photograph or use **Take a photo**, which asks a supported mobile browser to open the device's camera, preferring the rear camera. The local comparison page offers camera capture for either source. On desktop browsers, a camera control may open an ordinary file chooser instead. No camera stream starts when the page loads.

Camera inputs request JPEG. Library inputs still request JPEG, PNG, WebP, or AVIF, preserving the phone Photo Library's normal JPEG-export path. If the public tool receives a file with a HEIC/HEIF MIME type or filename, `prepareParticipantFile` loads `heic-input.js` on demand. The helper first tries native browser decoding; only if that fails does it load the bundled, same-site **heic-to 1.6.7** decoder. Conversion happens on the device, without a conversion service. RAW files still need to be exported first; the local comparison page also still needs HEIC exported as JPEG.

Normal JPEG, PNG, WebP, and AVIF uploads keep the same File and exact picker-delivered bytes. For HEIC, both rendering and archiving use the same normalized JPEG File instead of the raw HEIC. The raw input and converted JPEG must each stay within 30 MiB, and decoded images must stay within 80 megapixels. The helper retains two recent conversions and shares an in-progress conversion for the same raw-file SHA-256. Server duplicate checks use the resulting JPEG bytes: repeat conversions in different browsers or after the cache is gone can produce different bytes, so the same raw HEIC is not guaranteed to deduplicate across those conversions.

To test the local layout on a real phone or tablet, use Live Server's reachable local-network address while both devices are on the same network. `127.0.0.1` or `localhost` on the phone refers to the phone itself, not the computer. An archive connection also needs that exact origin to be allowed by the Google project; the current allowed local origins use port 5500 on the computer. Use the live HTTPS tool link above for physical-device tests.

The comparison page works without Google. On `double-exposure.html`, choose **Yes** or **No** for retaining the original for future use and set the colour choice before **Upload a photo** or **Take a photo**. Neither future-use answer is selected initially; uploading, camera capture, and generation stay unavailable until an answer is selected. Photo selection freezes those choices and starts development automatically. Local artist pairings can render while Google connects and saves; dynamic participant bases still need their Google image bytes. A preview can appear before the archive confirms it. **Please wait while your double exposure is being developed…** appears above the image, and all result buttons and colour choices stay disabled until the current operation and generated JPEG variants have matching save receipts. Transient failures retry automatically; permanent errors keep **Retry saving** available. Keep the tab open until saving finishes. The leave-page warning cannot guarantee completion if the tab is closed.

The initial archive connection also retries transient failures automatically, showing **Please wait…** without requiring a button press. Local photo selection remains available after Yes/No while it reconnects. Permanent connection errors retain manual **Retry**. The pending photo keeps its exact original, base, consent, JPEG, and retry identity. A new upload waits for confirmation rather than clearing a pending save. Disabled upload/camera labels are gray. The tool keeps Home navigation and has no visible title heading.

Before public use, check both library selection and native camera capture on an actual iPhone/iPad and Android device, including cancellation and a portrait photograph. Desktop viewport checks verify layout, not a physical device's camera chooser or HEIC conversion.

1. Keep the selected artist files in `assets/base-photos/` and their existing matching originals in [My_photos](https://drive.google.com/drive/folders/1KTwgNyGgTgv8HwT1MrBaJeWk-JJIupKY). Version 7 supplies artist image paths for direct website loading; Google retains the source index and exact-original duplicate checks. See the artist-file steps below before changing the collection. Do not delete the retained Drive copies.
2. Set **Black and white** and explicitly select **Yes** or **No** to retaining the submitted original for future double exposures. Neither answer is selected initially. Then choose **Upload a photo** or **Take a photo**. Development starts automatically, with both choices fixed for this exposure.
3. The rendered double exposure can appear before its archive finishes. Wait for the saving message to clear and the result controls to unlock before continuing or leaving the page. Saving a personal copy is optional. After confirmation, changing **Black and white / Original colour** creates or reuses the corresponding JPEG for the same two photographs; all result controls lock again while a new variant saves. Another pairing and **Create a double exposure using a new image** are available only after the current saves finish. Identical originals and finished JPEGs retain the existing duplicate checks.

The tool page stays minimal and black, with no exposure sliders or collection-management panel. A private Google Sheet records the frozen Yes/No answer, original reference, base, and result. Yes permits original retention and future pairings after completion; No does not create a retained original or source-pool entry. Re-pairing and colour variants authenticate the existing original reference and reuse the same frozen browser File without sending another original. Hash checks still prevent self-pairing, reuse identical retained originals and completed JPEGs, and preserve retry identity. Renaming bytes does not bypass those checks; edited or re-exported files may have different hashes. Previously archived files are not deleted.

The older [double-exposure-online-project repository](https://github.com/aaronlinguini/double-exposure-online-project) is a historical selected publication; its private visibility and the old website’s 404 response were verified. The repository and history at the preceding [br address](https://github.com/aaronlinguini/br) are preserved at [linebreak](https://github.com/aaronlinguini/linebreak). Editing a file on GitHub does not automatically update the local copy, so compare remote and local work before pushing. The Google deployment is separate; a frontend publication does not replace its code or settings.

The [Photo archive Apps Script project](https://script.google.com/home/projects/1gj7CIChAW6rMFOmP_Pb16TWSAwUKzZQxnOUOvvEUvDFOwQxKo65lYols/edit) runs in **aaron.double.exposure.project@gmail.com**. Version 4 deployed the Google-hosted visitor bridge on October 30, 2026, at **6:10 PM**. Version 5 deployed faster source scanning at **6:44 PM**. Version 6 added same-base colour variants and one batched read for the three existing archive tabs at **10:00 PM**, keeping the same `/exec` URL, account, Anyone access, OAuth scopes, and archive folders. The user explicitly approved activating the existing photo service; **`UPLOADS_PAUSED=false`** was saved and verified. No personal-folder sharing or new authorization/setup is needed, and working archive IDs must be preserved.

The final collection refresh verified all **113 artist bases**, with no deferred files, skipped files, or issues. Chrome and a fresh in-app-browser page connected successfully from the local port-5500 site after service activation. The earlier zero-base result concerned an old two-file upload; consult [GOOGLE-SETUP.md](GOOGLE-SETUP.md) for the current details. User photographs have not been altered. Around **9:09 PM on October 30**, the user reported that manual double-exposure generation succeeded. Archive-folder contents, consent-based moves, duplicate reuse, another pairing, and real mobile-camera behaviour have not been independently verified. Earlier browser automation could not select a local file because the Chrome extension lacked local-file access.

The delivery path has one authoritative artist library: the assets listed in `assets/base-photos.json` and the matching private `AssetCatalog.gs`. Only artist source-index entries with matching SHA-256, MIME type, and byte length can be selected. The browser encodes each raw filename, downloads it from the same website, and verifies its size and SHA-256 before using the unchanged renderer. It caches the two most recently loaded assets. A missing or mismatched mapped artist asset fails; Google does not silently return another artist pool or base64 fallback. Opted-in participant bases stay dynamic in the existing Google pool.

Drive permissions and archive safeguards remain unchanged. Google still scans retained originals using metadata and bounded header checks, and fully verifies existing original bytes when a duplicate upload must be reused. Archive writes remain restricted to app-created, app-marked files through `drive.file`; `PROJECT_OWNER_EMAIL` must match the dedicated account. Retained Drive artist copies are still needed for the index and original verification. No account-wide write/delete scope, OAuth grant, or folder-ID change is required.

Open `double-exposure.html` through Live Server at `http://127.0.0.1:5500/`, or serve this folder on the same allowed port with the command below. Use one local server at a time. The live archive needs the deployed Google service and an allowed origin; **a published website or GitHub Pages bridge asset is no longer required**.

```sh
python3 -m http.server 5500 --bind 127.0.0.1
```

## Files

- `index.html`: the physical homepage entry file, with separate Experiments and Interactive link lists; the shared Home link uses `./` to open the clean repository root.
- `includes/site-header.html`: the shared site name, divider, and experiment navigation.
- `site-header.js`: loads the shared header in local previews and supplies the same rendering functions to the publication builder.
- `experiment-1.html`: the Sketch photo gallery and reflection.
- `experiment-2-part-1.html` and `experiment-2-part-2.html`: the separate Memory pages, with links to both parts at the top.
- `experiment-3.html`: the Apparitions photo gallery and reflection.
- `double-exposure.html`: the double-exposure tool’s HTML; loads its external stylesheet and scripts.
- `styles.css`: shared page styling and responsive layouts.
- `scripts.js`: photo loading, pairing, light processing, finished-image rotation, and downloads.
- `local-test.html`: local comparison page without uploads; also the source for the private Google-served studio template, never a Pages page.
- `local-test.js` and `local-test.css`: shared comparison controls and layout for the local page and private studio.
- `tone-adjustments.js`: optional finishing curve for the comparison and private studio; it does not change the visitor renderer.
- `film-renderer.js`: experimental revised/saved smooth-exposure and assumed film-response models for the comparison and private studio.
- `owner-studio.js`: owner-studio-only autosave adapter; leaves the ordinary local page and device downloads untouched.
- `project-config.js`: the public Google deployment URL, artist colour option, and connection timeouts.
- `archive-workflow.js`: original → develop → result archive workflow, consent, saved colour variants, another pairing, and retries.
- `drive-storage.js`: website-side Google connection.
- `drive-bridge.js`: canonical visitor bridge source, generated into Google's private `Client.gs` so the bridge can be served by Google.
- `base-assets.js`: same-site artist-file loading, exact size/SHA checks, and a two-asset cache.
- `heic-input.js`: on-demand HEIC-to-JPEG preparation for participant uploads; native decoding first, then the bundled fallback.
- `vendor/heic-to/`: the separate heic-to 1.6.7 decoder, its LGPL-3.0 license and notices, and the bundled corresponding sources in `SOURCES.tar.gz`.
- `assets/base-photos/` and `assets/base-photos.json`: selected artist image files and their generated public manifest.
- `artist-import.js` and `artist-import.css`: external assets for the owner-only import page; they contain no Google access credentials.
- `google-apps-script/`: backend Code.gs workflow, Drive/Sheets adapters in Storage.gs, generated Client.gs and AssetCatalog.gs, Bridge.html, optional owner-only Artist.html, personal-save OwnerStudio.gs, generated owner-only Studio.html, and the dedicated-account manifest; none are Pages assets.
- `scripts/build-owner-studio.cjs`: generates/checks the private Studio.html template from the comparison page and final hashed public dependencies.
- `scripts/build-google-client.cjs`: rebuilds `Client.gs` from `drive-bridge.js`; use `--check` to confirm they match without writing.
- `scripts/build-base-assets.cjs`: validates selected photo files and regenerates the public manifest and private Google catalog without changing the images.
- `scripts/vendor/es-module-lexer/`: a small MIT-licensed parser used only during preparation to identify real JavaScript imports. It is not included in the website and needs no installation.
- `tests/`: numerical, archive workflow, backend persistence, and transport checks.

There are no inline styles, executable script bodies, or inline event handlers in the HTML. All authored scripts and styles are separate files. The only bundled third-party frontend package is the lazily loaded HEIC decoder, kept separate with its license, notices, and sources. No remote fonts or tracking are used. The deployed archive uses Google's HTML-service runtime.

## Artist base files

1. Copy selected JPEG, PNG, WebP, or AVIF files, up to 30 MiB each, directly into `assets/base-photos/`. Keep their raw filenames. The folder accepts no subfolders or unrelated files apart from `.DS_Store`.
2. Run `node scripts/build-base-assets.cjs`, then `node scripts/build-base-assets.cjs --check`. The builder hashes and validates every file, keeps one manifest entry per identical byte sequence, and does not delete, rename, resize, or re-encode photographs.
3. Keep the corresponding byte-identical Drive originals for the current source index and duplicate checks. New or changed local assets must match indexed artist originals; adding only an unmapped local file does not make it eligible.
4. Save the generated `google-apps-script/AssetCatalog.gs` in the existing Google project. Save `Code.gs` too only when its code changed, then deploy a new version of that existing endpoint. No new authorization or setup is needed. Refresh the owner collection check and confirm the catalog has no unmatched assets.

The public manifest, `base-assets.js`, and selected image files are included in the generated website package. The Google catalog and backend are excluded from the deployed artifact. A local build prepares the package; pushing to `main` starts the Actions deployment.

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

Portrait photographs are rotated 90 degrees clockwise into landscape orientation before processing, for both the base and participant image. Each full photograph is fitted into the base frame without cropping or stretching; different proportions leave black padding, which contributes no exposure. Results use up to 2,400 pixels on the longest edge, and are smaller if either source would otherwise be enlarged. Before any user rotation, the archive and optional download contain the same JPEG bytes. Rotation and resizing affect working images and results; supported participant files are uploaded unchanged, while HEIC uploads use the normalized JPEG described above.

JPEG, PNG, WebP, and AVIF are accepted, up to 30 MiB per file. The public tool automatically prepares HEIC/HEIF as JPEG when one is delivered by the picker; RAW files need to be exported to a supported format first. Transparent image regions contribute black (no light).

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

Photo selection freezes both the colour mode and the Yes/No retention choice, including while the photo waits for connection. Result colour choices stay disabled while rendering or saving is pending. A new colour variant uses its exact displayed JPEG, a new submission ID, the same authenticated original reference and pinned base, and `reuse.sameBase=true`; it sends no second original and inherits the existing choice. For No, that reference is `unretained:<sha256>` and the original remains the same frozen File in the open browser session. All result controls lock until confirmation. Existing saved results stay unchanged; a cached saved mode reuses its JPEG.

Each operation freezes its mode for rendering, archiving, and retries; an uncertain save retries the identical JPEG and recipe. Another random pairing inherits the currently visible colour mode and requests a different base. **Create a double exposure using a new image** lets the visitor choose again for a new exposure. This affects the finished output only: original upload bytes, orientation, and future-use consent remain independent and unchanged.

## Result controls

**Create a double exposure using a new image**, **Create another double exposure using this photo**, **Save image**, **Rotate 90°**, and both result colour choices stay disabled while rendering or saving is pending. **Please wait while your double exposure is being developed…** appears above the image until every current save is confirmed. There are no background fresh uploads or queued re-pairing requests. Once unlocked, uploading returns to fresh choices, re-pairing uses the same original with a different base, and rotation changes the personal copy without another archive write.

Below the image, **Black and white** and **Original colour** are mutually exclusive radio choices. `forceBlackAndWhite` determines their initial selection. A colour change after confirmation uses the existing saved-variant workflow and locks all result controls while it renders or saves. Switching to an already saved cached mode reuses its JPEG.

After Google confirms saving, a tap on **Save image** opens native sharing on supported phones and tablets with the exact displayed JPEG, including its selected colour and rotation. Sharing starts directly from that tap. The operating system controls the available destinations, so a Photos or Save Image option cannot be guaranteed. Cancelling sharing does not start a download; unavailable or failed sharing falls back to a JPEG download. Desktop browsers keep the direct download. Saving a personal copy is separate from Google archiving; no physical-phone saving test is claimed.

## Development and saving

The browser develops artist pairings directly from `assets/base-photos/` while Google connects and validates the original. Yes originals are retained under the new policy; No originals are not persisted. If Google has already supplied a random candidate from the artist/eligible-participant pool, that candidate is used. Otherwise, the first pairing comes from the website manifest, excluding the input SHA-256. Completed, consented participant bases remain eligible when Google is available and still need their Google image bytes. Artist image bytes have no Drive fallback.

A preview is shown as soon as rendering finishes, while the result controls remain locked. Google must confirm the same hash and metadata before the archive is complete. No upload response may silently substitute another base. Saving failures retain the same original, base, JPEG, consent, and retry identity. Pixel batches use browser message tasks instead of repeated zero-delay timers, preserving all calculations, dimensions and JPEG settings.

The page handles one photo at a time and prioritizes completing its archive. Transient connection and service failures retry automatically with increasing delays; permanent validation or permission errors require attention, with manual retry visible. Retries exist only in the open tab: closing or reloading can interrupt unfinished saves, and the leave-page warning cannot guarantee completion. The saving UI preserves the renderer. The consent-retention revision requires updating the existing Google deployment and is not yet verified live. Checkpoint `1ddef3a` preserves the preceding interaction.

## Checks

With Node 18 or newer:

```sh
node --check scripts.js
node scripts/build-google-client.cjs --check
node scripts/build-base-assets.cjs --check
node --test tests/*.test.cjs
```

The current publication passed **594/594 CI checks**, including contribution-history and pool filtering, local base selection, concurrent rendering and original saving, exact source identity, colour variants, retries, consent, batched sheet reads, HEIC preparation, personal-studio autosaving and access, and publication packaging. Google **Version 16** and the regenerated Studio.html are installed, and the matching frontend publication succeeded. An earlier foreground Live Server test with a synthetic 2400 × 1600 participant image and an actual artist asset displayed the result at **0.92 seconds**, before Google connected at 5.89 seconds; the matching real archive receipt arrived at 18.84 seconds. A real libheif HEIC sample converted through the Chrome fallback in **3.32 seconds**, from 718,114 bytes to a 675,803-byte JPEG at 1280 × 854; a repeated conversion returned identical JPEG bytes. These are individual test timings, not a guarantee for every photo or device. Physical-device camera, iPhone HEIC, and consent-folder checks remain separate.

The checks cover exposure maths, exact original bytes, consent, another pairing, duplicate and self-pairing rules, result eligibility timing, interrupted archive writes, stable retries, limited-access API boundaries, owner imports, iframe-message validation, and the separation of HTML, CSS, and JavaScript. Google services are simulated in those tests; live account authorization and deployment require the setup guide's smoke test.

## Version history

Checkpoint **`5ea2a0f`** preserves the version before automatic HEIC preparation and the toolbar with download and rotation above the image. The toolbar is saved separately in **`b823323`**, before HEIC support, so the two changes can be undone independently. No Google backend change is needed for this update.

Checkpoint **`34c6379`** preserves the controls that waited for saving before download or colour changes. This frontend update uses the existing Google Version 8 API and does not need a backend deployment.

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

### Editing the shared header

Edit the name once in `includes/site-header.html` to change **&lt;br&gt;** across the website. Write the visible tag as `&lt;br&gt;` so it appears as text. The same template contains the grey `<hr class="site-divider">` and the four experiment links. Change the line's colour, thickness, and spacing in the `.site-divider` rule in `styles.css`.

Each website page loads `site-header.js` and contains a `<div data-site-header></div>` placeholder. Experiment pages use `<div data-site-header="experiments"></div>` to show the experiment navigation. Keep page-specific headings and content outside that placeholder. Keep `index.html` as the physical homepage file; the shared title/Home link uses `href="./"` so navigation opens the clean repository root, rather than `/home` or an explicit `index.html` URL. A local title-link click from Experiment 1 verified the root address and literal &lt;br&gt; browser title.

Save the template and refresh each Live Server page to see the changes. During publication preparation, the builder embeds the header into every page and updates the marked home/tool titles and tool link-preview metadata. Published pages therefore contain the complete header without JavaScript or a runtime template request. Saving a local file alone does not update the live website; validated requested changes are committed and pushed through the normal Actions workflow above.

### Editing experiment content

**Read all reflections** opens `reflections.html`, a continuous text view linked from the home page and experiment navigation. Edit reflections in the experiment HTML as usual. The text view copies the main reflections and nonempty image notes automatically, preserving paragraphs and emphasis. Image-group labels follow the gallery's numbered positions, including groups containing several photos; they do not count individual images. Publication embeds the complete text in the page, so reading it does not require JavaScript. Live Server uses `reflections.js` to load the same content locally. Its layout is in `reflections.css`.

Open `index.html` with Live Server to work on the home page and follow its links to the experiment pages. To fill an experiment page:

Memory has separate Part 1 and Part 2 links under its home-page label. Edit each part in its matching HTML file; both use photographs from `images/experiment-2/`. The local parts replace `experiment-2.html`; earlier publication records below retain that release's filename.

1. Edit its `<title>` and `<h1>` to change the browser-tab title and visible heading. Change its home-page link text in `index.html` and its shared navigation text in `includes/site-header.html`; keep each `href` unchanged unless the file itself is renamed.
2. Put photographs in `images/experiment-1/`, `images/experiment-2/`, or `images/experiment-3/` to match the corresponding page. These folders are ready locally.
3. In `experiment-1.html`, remove the `<!--` and `-->` around the example `<section class="experiment-entry">` to display it. Set the image's `src` to the real filename and replace its `alt` description. Use the corresponding paths in the other two pages.
4. Put your reflection in the empty `<p></p>`. Repeat the complete `experiment-entry` section for another photo/reflection pair. Keep layout changes in `styles.css`; no inline CSS or JavaScript is needed.

Photo files referenced by active experiment HTML are selected automatically for the website package, alongside the artist assets listed in `assets/base-photos.json`—currently 113. Unreferenced experiment photos and commented-out examples are excluded from the deployed artifact. README, project instructions, tests, `local-test.html`, generated Studio.html, backend sources, and Git history belong to the working repository but are not website assets; secrets and incoming participant files remain ignored. The comparison's shared static dependencies are included for the private studio.

The earlier selected-copy package used these twenty-one core paths (historical):

```text
index.html
double-exposure.html
experiment-1.html
experiment-2.html
experiment-3.html
styles.css
scripts.js
project-config.js
archive-workflow.js
drive-storage.js
drive-bridge.js
artist-import.js
artist-import.css
base-assets.js
assets/base-photos.json
heic-input.js
vendor/heic-to/heic-to.js
vendor/heic-to/LICENSE
vendor/heic-to/NOTICE.txt
vendor/heic-to/SOURCES.tar.gz
.nojekyll
```

The current packager discovers ordinary root HTML pages automatically, excluding `local-test.html`, and includes their active gallery images, shared header, carousel assets, the listed artist assets, the private studio's static dependencies, and the separate decoder's license, notices, and corresponding sources. The private studio HTML and backend are not included. Run `node scripts/prepare-public-site.cjs` to prepare `.public-site/` locally, or push the validated source changes to `main` and let Actions build and deploy it. Rebuild the asset catalog after changing artist base files. The packager validates HTML, JavaScript, photo sizes/hashes, paths, and existing output contents before replacement; invalid or missing image references stop packaging.

### Automatic cache labels

Edit the normal source files, including `styles.css`, in VS Code. HTML uses plain filenames such as `href="styles.css"`; there is no version number to maintain or filename to rename.

GitHub Actions runs preparation before deployment. To inspect the same package locally, run:

```sh
node scripts/prepare-public-site.cjs
```

The prepared HTML in `.public-site/` gets a `?v=` label calculated from each stylesheet or script's SHA-256 content hash. An unchanged file keeps its label; a changed file gets a different one. All pages referencing the shared stylesheet receive the same label. Restoring identical file contents restores the same label safely, since the cached bytes then match. Existing manually written `v` values are replaced in the prepared copy. Other query parameters and fragments are retained.

Script imports are processed before their parent is hashed, including the HEIC helper and its separate decoder. Updating the decoder therefore also updates the helper and main script URLs. The parser identifies executable imports without changing commented examples, quoted text, or the vendor decoder's bytes. Computed import URLs and circular local import chains stop preparation with an error instead of producing incomplete cache labels. The current project uses literal, acyclic imports.

After a push to `main`, GitHub Actions prepares and deploys the **contents of `.public-site/`** automatically. The generated directory stays ignored; commit editable source files rather than generated output. Preparation leaves those source files unchanged. Ordinary public-page cache updates need no framework, runtime cache script, or new Google deployment. This updates asset URLs when the latest HTML is loaded; it cannot force a visitor's already-open page to reload. The optional Google-served owner import page still uses its separate backend URLs. Private-studio page/dependency changes require rebuilding and installing Studio.html so its hashed URLs match the published bytes, then updating the existing Google deployment.

Historical checkpoint **`9a9e90f`** preserves the home-page draft and the project before automatic cache labels. At that stage, changes were left uncommitted for review; the current standing authorization is to commit and push validated requested website changes.

To add a further experiment page, create an ordinary `.html` file and add it to the home page's Experiments list and the relevant navigation. Root HTML pages are discovered automatically by `scripts/prepare-public-site.cjs`; validate the new page and its image references, then commit and push through the normal workflow. The page's photos, text, layout, and label are yours to choose. Keep Google's `SITE_URL` at the canonical website root, `https://line-break.ca/`; these static pages need no Apps Script change.

The intake revision removes both application-level daily caps: submission count and newly saved bytes. The configurable `REQUESTS_PER_MINUTE` limit remains at its default 120, along with the owner pause switch and existing per-file image validation. The Usage ledger remains for write identity, duplicate prevention, and retry recovery, without a daily quota. Google storage and service quotas still apply. Google Version 10 was deployed November 2 at 2:33 PM on the same endpoint with the same project account, Anyone access, scopes, properties, and folder IDs. Saved Code.gs matched local bytes after editor reload (62,548 bytes; SHA-256 6d8cd19ac48ad9d7653f89f90048f1be0000b9cbbd80cef38c6c7e706d993f4c). Version 9 remains available for rollback. That release passed 481/481 checks; no new live photo submission was performed. See [GOOGLE-SETUP.md](GOOGLE-SETUP.md) for settings.

The exact project before launch preparation is saved as **`before-launch-setup`** at **`9144f22`**. Image defaults, publication packaging, and archive limits are saved separately so each change can be undone.

The full project before the limited-access rewrite is saved as **`before-limited-drive-access`** at **`f458bb2`**. The image-processing code is unchanged by this rewrite. A local revert does not itself replace deployed Google code or revoke an earlier OAuth grant.

A public gallery, a project-wide finite sequence, and participant-created or edited prompts are not implemented; the current scope is the shared source pool and private archive.

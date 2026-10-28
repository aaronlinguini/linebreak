# Double exposure

Participants add a photograph to create a double exposure. The Google connection archives the original upload and finished JPEG, and makes completed participant originals available as future bases.

## Try it

To test the exposure effect without Google, right-click `local-test.html` in VS Code and choose **Open with Live Server**. Choose your base photo and a second photo from your computer; the result develops automatically. Changing either photo makes another exposure. Use **Download image** to keep a copy. This separate page uses the same photo preparation, crop, mixer, project settings, and JPEG export as the main website, but has no archive connection. Nothing is uploaded or automatically saved there.

There is no frontend installation or build. To test automatic archiving on the main `index.html` page, first deploy and connect the Google archive: follow [GOOGLE-SETUP.md](GOOGLE-SETUP.md).

1. Upload artist photographs to the project's Drive folder and import them through the private Apps Script owner function.
2. On the website, press **Add a photograph**. Its exact original is saved, a base is selected, and the exposure develops and archives automatically.
3. Wait for **Saved to the archive.** Downloading a copy is optional.

The public page stays minimal and black, with no exposure controls or collection-management panel. Source photographs are stored separately from finished exposures. A private Google Sheet records both source IDs and each result. Exact duplicates share a source-pool entry; no image pairs with identical bytes. Pending and failed submissions can be retried without changing the selected base or duplicating the archived result.

The code is not yet connected to a live Google deployment: `project-config.js` deliberately contains an empty endpoint until setup is complete. It disables uploads when unconfigured and does not present local processing as a successful archive save.

For a local HTTP layout preview, run this in the project folder and open the printed address. A live archive additionally requires a deployed Google script, published bridge asset, and allowed preview origin as described in the setup guide:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

## Files

- `index.html`: structure and content; links the stylesheet and deferred script.
- `styles.css`: all page styling and responsive layouts.
- `scripts.js`: photo loading, pairing, light processing, and downloads.
- `local-test.html` and `local-test.js`: browser-only exposure testing without Google.
- `project-config.js`: the public Google deployment URL and connection timeouts.
- `archive-workflow.js`: original → develop → result archive workflow and retries.
- `drive-storage.js`: website-side Google connection.
- `drive-bridge.js`: external script running inside Google's hidden bridge frame.
- `google-apps-script/`: private Drive/Sheets backend, bridge HTML, and manifest.
- `tests/`: numerical, archive workflow, backend persistence, and transport checks.

There are no inline styles, executable script bodies, or inline event handlers in the HTML. All authored scripts and styles are separate files. No third-party frontend packages, remote fonts, or tracking are used. The deployed archive uses Google's HTML-service runtime.

## Exposure treatment

The current blend is the restored linear-addition baseline. It works pixel by pixel on the aligned photographs: decode sRGB, scale each channel by `2 ** exposureEV`, add the two photographs, and clip each channel independently at white. At neutral settings, white stays white and black reveals the other photograph. This treatment is symmetric.

The later inverse-Reinhard response was removed after review of the artist's analogue examples and website outputs. Numerical boundary checks did not establish a convincing analogue match. This rollback restores the earlier behaviour; it does not claim to finish the film simulation.

`PROJECT_SETTINGS` in `scripts.js` defines the artist's treatment. Google selects a random eligible source. The participant interface has no exposure sliders, contrast controls, colour options, pairing selector, or separate develop button. The restored settings use colour, neutral contrast, and zero exposure adjustment per photograph.

A rendered JPEG does not retain its original scene exposure or a measured film/development/scan response. See [EXPOSURE-NOTES.md](EXPOSURE-NOTES.md) for the current model and limitations.

Portrait photographs are rotated 90 degrees clockwise into landscape orientation before processing, for both the base and participant image. Each full photograph is fitted into the base frame without cropping or stretching; different proportions leave black padding, which contributes no exposure. Results use up to 2,400 pixels on the longest edge, and are smaller if either source would otherwise be enlarged. The archive and optional download contain the same JPEG bytes. Rotation and resizing affect working images and results; the participant original is uploaded unchanged.

JPEG, PNG, WebP, and AVIF are accepted, up to 30 MB per file. HEIC and RAW need to be exported to a supported format first. Transparent image regions contribute black (no light).

## Artist colour option

In `project-config.js`, change `forceBlackAndWhite`:

- `true`: make every finished double exposure black and white.
- `false`: preserve the photographs' existing colours, including photographs that are already black and white. This is the default.

Reload the page and select the photographs again after changing the option. It applies to both the main site and the local test page. The archived original uploads retain their original colours and orientation.

## Checks

With Node 18 or newer:

```sh
node --check scripts.js
node --test tests/*.test.cjs
```

The checks cover exposure maths, exact original bytes, duplicate and self-pairing rules, result eligibility timing, interrupted archive writes, stable retries, iframe-message validation, and the separation of HTML, CSS, and JavaScript. Google services are simulated in those tests; live account authorization and deployment require the setup guide's smoke test.

## Version history

Git history starts with the current restored project. The `baseline` tag names this first saved version. Later work should be saved in small commits so it can be undone directly.

In VS Code, open **Source Control** to see changed files and saved history. To save a version manually, stage the intended files, enter a short description, and commit. Saving a file alone does not create a Git version.

To undo a later committed change, ask to revert that change; Git can create an undo commit while preserving the history. The baseline can also be used to restore a particular file. Earlier versions from before Git was introduced are not automatically part of this history.

## Next stages

Publish the static files, authorize and deploy the Google script, and complete a real upload/archive check. Judge the exposure treatment with the artist's photographs. A public gallery, a project-wide finite sequence, and participant-created or edited prompts are not implemented; the current scope is the shared source pool and private archive.

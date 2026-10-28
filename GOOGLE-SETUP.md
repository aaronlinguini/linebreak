# Connect the Google archive

To test only the exposure effect now, open `local-test.html` with VS Code's Live Server and choose both photographs from your computer. It uses the main site's image processor. Nothing is uploaded or automatically archived. The steps below connect the separate Google storage workflow; placing photos in Drive alone does not connect the website.

If you copied an earlier version of `Code.gs`, replace it with the current file and save it so `setupProject` and `refreshArtistCollection` appear in the Run dropdown. If you manually installed an older manifest, replace it with the updated manifest too.

The implementation has not been deployed into your Google account. Google services have been simulated in automated tests; that is not an independent security audit or a completed public-launch security review.

## Before authorizing

The current manifest requests account-wide Drive and Sheets permissions, plus email identity for the owner check. The code uses project folder IDs, but those IDs are not a Google-enforced folder-only permission boundary. Creating folders manually does not reduce the authorization scope. A project-only Google account avoids granting this script access to personal documents in your usual account. The public upload endpoint also needs abuse controls and a live load test before unrestricted launch. Do not treat these instructions as a reason to bypass a Google warning without reviewing the access requested.

You can create and fill the folders before publishing. Connecting the website requires a public HTTPS site address.

## 1. Publish the website files

Publish this project to GitHub Pages. Keep these files together at the same site base address:

- `index.html`
- `styles.css`
- `scripts.js`
- `project-config.js`
- `archive-workflow.js`
- `drive-storage.js`
- `drive-bridge.js`

For example, the site might be `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`. Keep the repository path in this address. `drive-bridge.js` must be publicly available at that address followed by `drive-bridge.js`.

The empty Google URL in `project-config.js` is intentional at this stage. The page disables uploads until its archive is connected; it never silently falls back to making unsaved results.

## 2. Create your Apps Script project

Open [Google Apps Script](https://script.google.com/) under the Google account that will own the archive and create a new project.

1. Replace the contents of `Code.gs` with [google-apps-script/Code.gs](google-apps-script/Code.gs).
2. Add an **HTML** file named `Bridge`. Copy [google-apps-script/Bridge.html](google-apps-script/Bridge.html) into it.
3. In **Project Settings**, enable **Show appsscript.json manifest file in editor**. Replace the manifest with [google-apps-script/appsscript.json](google-apps-script/appsscript.json).
4. In **Project Settings → Script Properties**, add `SITE_URL` with your full published website address from step 1.

Do not replace the `__PARENT_ORIGIN__`, `__CHANNEL__`, or `__BRIDGE_SCRIPT_URL__` markers in `Bridge.html`. The server replaces them for each connection. All JavaScript remains in external `.js` or `.gs` files; the HTML contains no inline code or styles.

## 3. Use your own folders, or create them through the script

### Use folders you create manually

In Google Drive, create a private parent folder and three private subfolders, for example:

```text
Double exposure
├── My photographs
├── Participant originals
└── Finished double exposures
```

Upload your base photographs into **My photographs**. Leave the other two subfolders empty. Keep sharing restricted; copying an address from the browser's address bar does not require making a folder public.

Open each folder and copy its URL. The folder ID is the part after `/folders/`, excluding any `?` query string. In Apps Script's **Project Settings → Script Properties**, enter these exact keys with the corresponding IDs:

| Property | Folder |
| --- | --- |
| `EXPOSURE_ROOT_FOLDER_ID` | The parent Double exposure folder |
| `EXPOSURE_ARTIST_FOLDER_ID` | My photographs |
| `EXPOSURE_ORIGINALS_FOLDER_ID` | Participant originals |
| `EXPOSURE_RESULTS_FOLDER_ID` | Finished double exposures |

With all four IDs supplied, `setupProject` uses your folders instead of creating new ones. It creates the private index spreadsheet and its column headers. The folder names can differ from these examples because the code uses their IDs. Only run it after deciding which account and authorization you are comfortable using.

Then run `refreshArtistCollection` to register your base photographs. In the steps below, read the default folder names as your corresponding manually created folders.

### Let the script create folders

Select `setupProject` in the Apps Script function selector and run it. Google will ask you to authorize your own script to use Drive and Sheets and verify your signed-in email identity. The manifest requests those service permissions; the implementation confines its archive operations to the project folders it creates. Review the source before authorizing it.

The execution log prints links to a new **Double exposure project** folder, these three subfolders, and its **Double exposure index** spreadsheet:

| Folder | Contents | Available for future pairing? |
| --- | --- | --- |
| `01 Artist photographs` | Photographs you upload beforehand | Yes, after import |
| `02 Participant originals` | The exact files participants submit | After their finished exposure is saved |
| `03 Double exposures` | Automatically archived finished JPEGs | No |

The setup function does not make folders or the spreadsheet public. Keep them private. Eligible source photographs are delivered through the script to make future exposures; the public API has no gallery, result-download, arbitrary-file-read, or delete operation.

Running `setupProject` again reuses the saved project IDs. Do not delete its `EXPOSURE_*_ID` script properties: they identify the archive you already created.

## 4. Add your starting photographs

Upload your base images directly into **01 Artist photographs**, then run `refreshArtistCollection` in the Apps Script editor. Run it again whenever you add, replace, move, or remove artist photographs.

Supported formats are JPEG, PNG, WebP, and AVIF, up to 30 MB each. HEIC and RAW files need an exported version first. The index stores file references and checksums, not the photograph bytes themselves. At least one different base photograph is needed for an exposure; a file cannot be paired with an identical copy of itself.

The visible editor functions are `setupProject` and `refreshArtistCollection`, without a trailing underscore. Their internal helpers keep the underscore and stay private. The visible launchers verify that the signed-in user matches the executing owner before accessing the archive. Anonymous visitors and other Google accounts are denied. The manifest includes the email-identity scope for that check.

## 5. Deploy the Google web app

In Apps Script, choose **Deploy → New deployment → Web app**:

- **Execute as:** you (the archive owner).
- **Who has access:** Anyone, including visitors who are not signed into Google.

Some Workspace organizations prohibit anonymous deployments. If that option is unavailable, use an account whose policy permits it or resolve the restriction before launch; the site cannot override that policy.

Finish Google's deployment/authorization flow and copy the web-app URL ending in `/exec`. Do not use the editor's `/dev` test URL.

## 6. Connect the website

Put that `/exec` URL into `project-config.js`:

```js
const EXPOSURE_CONFIG = Object.freeze({
  googleScriptUrl: "https://script.google.com/macros/s/YOUR-DEPLOYMENT-ID/exec",
  connectionTimeoutMs: 30000,
  requestTimeoutMs: 120000
});
```

Publish the updated file through GitHub Pages. The deployment URL is public configuration, not an account password or access token. Google account tokens and the private index remain on Google's side.

## 7. Run the live check

Open the published site in a private browser window, without signing that visitor into Google:

1. Add a photograph that differs from your base photograph. Wait for **Saved to the archive.**
2. In your own Drive, verify its original file exists in **02 Participant originals** and the finished JPEG exists in **03 Double exposures**.
3. Open **Submissions** in the index. The row should have `status = complete`, the original and base IDs, the result ID, settings, and a completion time.
4. Download the result from the site and compare it with the archived JPEG. The website downloads the same blob it sent to the archive.
5. Open a fresh visitor window and submit another photo. Completed participant originals are now eligible alongside your originals. Random choice does not guarantee that the next selection will be a participant image.

Do not declare the live Google connection tested until this check passes. The included automated tests use simulated Drive/Sheets services, not your real account.

## Retries and updates

The website saves the untouched original first, develops a JPEG, then archives that JPEG. It reports success only after the server confirms the stored result and its pairing record. A network failure exposes **Retry saving** and keeps the same original, selected base, submission ID, and generated result in this page session. It does not silently start a new exposure or re-upload a second archive copy.

Keep the tab open until saving finishes. Closing a tab or losing the device before an upload completes cannot be made reliable by an in-memory retry mechanism. The original may already be archived even when the result has not finished; the Sheet preserves that pending state.

An identical original upload reuses its participant-original file rather than weighting the pool with copies. Each new submission can still produce its own archived result. Identical images across artist and participant folders occupy one effective pairing slot. Cropped or re-exported versions are separate images.

To change server code later, update **Manage deployments → Edit → New version**. Keeping that deployment preserves the `/exec` URL. Ordinary frontend `.js` and `.css` changes are published through GitHub Pages.

## Artist settings

The default is to include completed participant originals as future bases. To stop that, set Script Property `INCLUDE_PARTICIPANT_PHOTOS` to `false`; originals are still archived, but the pool uses artist images only. This is an artist setting, not a visitor control.

For a local HTTP preview, add an exact additional origin such as `http://127.0.0.1:8000` to Script Property `ALLOWED_ORIGINS`. Multiple origins are comma-separated. `SITE_URL` must still identify the published HTTPS site so Google can load the external bridge script. Opening `index.html` through `file://` cannot connect to this archive.

For advanced artist exposure changes, edit `PROJECT_SETTINGS` in `scripts.js`. Visitors have no adjustment controls.

## Practical limits

This uses the storage allowance and Apps Script quotas of the owning Google account. It does not create unlimited storage or guarantee unlimited simultaneous uploads. Originals are preserved in their uploaded resolution; working copies and results use up to 2,400 pixels on the longest edge. Finished JPEG uploads are limited to 12 MB. Sources are selected from the private index; very large archives and sustained high visitor traffic need a separate load test.

Google documentation: [Web apps](https://developers.google.com/apps-script/guides/web), [HTML-service RPC](https://developers.google.com/apps-script/guides/html/communication), [external script requirements](https://developers.google.com/apps-script/guides/html/restrictions), [quotas](https://developers.google.com/apps-script/guides/services/quotas).

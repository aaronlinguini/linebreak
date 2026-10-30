/*
 * Private Drive archive + Sheets index for the double-exposure project.
 * Uses Advanced Drive / Sheets with per-file authorization through Storage.gs.
 * Run setupProject in the editor, then import local artist photographs at the
 * deployed /exec?view=artist page. No operation changes Drive sharing settings.
 *
 * Script properties:
 * SITE_URL: full HTTPS site base, including its GitHub repository path.
 * ALLOWED_ORIGINS: optional comma-separated exact extra origins (local HTTP
 *                 origins are allowed for development; wildcards are not).
 * INCLUDE_PARTICIPANT_PHOTOS: "false" disables all participant bases. Otherwise
 *                           only completed, individually opted-in originals join.
 * UPLOADS_PAUSED: "true" temporarily closes the visitor API; absent/"false" opens it.
 * REQUESTS_PER_MINUTE / SUBMISSIONS_PER_DAY / UPLOAD_BYTES_PER_DAY: optional
 * positive integer limits, shared by all visitors (defaults 120 / 200 / 1 GiB).
 * EXPOSURE_REQUEST_WINDOW is internal request accounting. The private Usage
 * sheet reserves each submission and new file once; do not edit its records.
 * EXPOSURE_*_ID properties are populated by setupProject_.
 *
 * Sources columns: sourceId, sha256, nameJson, mimeType, byteLength, kind,
 *                  eligible, createdAt. kind is artist or participant.
 * Submissions columns: submissionId, token, originalId, originalSha256, baseId,
 *   status, resultId, resultSha256, width, height, settingsJson, createdAt,
 *   completedAt, allowReuse, parentSubmissionId. Status progresses pending ->
 *   paired -> saving -> complete. Blank allowReuse on older rows means false.
 * JSON-encoded names cannot become spreadsheet formulas. Dates are ISO strings.
 * Files use deterministic names so a retry can recover a Drive write that
 * succeeded immediately before a Sheet write was interrupted.
 *
 * This is a public submission endpoint, not an authentication boundary for an
 * artist admin. A prior submission token authorizes another pairing of its
 * original. Editor launchers check that the active user is the executing
 * owner. Their internal helpers end in _. Keep this script, its properties,
 * Sheet and folders private.
 */

var EXPOSURE_CONFIG_ = Object.freeze({
  rootName: "Double_exposure_web_project (app)",
  sheetName: "Double exposure index",
  maxOriginalBytes: 30 * 1024 * 1024,
  maxResultBytes: 12 * 1024 * 1024,
  usageHeaders: ["key", "day", "kind", "bytes"],
  sourcesHeaders: ["sourceId", "sha256", "nameJson", "mimeType", "byteLength", "kind", "eligible", "createdAt"],
  submissionsHeaders: ["submissionId", "token", "originalId", "originalSha256", "baseId", "status", "resultId", "resultSha256", "width", "height", "settingsJson", "createdAt", "completedAt", "allowReuse", "parentSubmissionId"]
});

function doGet(e) {
  try {
    var config = siteConfig_();
    var parameters = e && e.parameter ? e.parameter : {};
    if (parameters.view === "artist") {
      requireOwner_();
      var artistHtml = HtmlService.createHtmlOutputFromFile("Artist").getContent();
      artistHtml = artistHtml.split("__ARTIST_SCRIPT_URL__").join(escapeHtml_(config.siteUrl + "artist-import.js?v=drive-file-v1"));
      artistHtml = artistHtml.split("__ARTIST_STYLE_URL__").join(escapeHtml_(config.siteUrl + "artist-import.css?v=drive-file-v1"));
      // Retain Google's default framing protection for the owner page.
      return HtmlService.createHtmlOutput(artistHtml).setTitle("Artist photograph import");
    }
    var origin = String(parameters.origin || "");
    var channel = String(parameters.channel || "");
    if (config.origins.indexOf(origin) < 0 || !/^[a-zA-Z0-9_-]{16,100}$/.test(channel)) {
      throw apiError_("INVALID_BRIDGE", "This archive connection is not allowed.");
    }
    var html = HtmlService.createHtmlOutputFromFile("Bridge").getContent();
    var replacements = {
      "__PARENT_ORIGIN__": origin,
      "__CHANNEL__": channel,
      "__BRIDGE_SCRIPT_URL__": config.siteUrl + "drive-bridge.js"
    };
    Object.keys(replacements).forEach(function (token) {
      html = html.split(token).join(escapeHtml_(replacements[token]));
    });
    return HtmlService.createHtmlOutput(html)
      .setTitle("Exposure archive connection")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    return HtmlService.createHtmlOutput(error && error.exposureCode_ === "OWNER_REQUIRED"
      ? "Open the artist import page while signed into the account that deployed this project."
      : "The exposure archive connection is unavailable.");
  }
}

// The visitor API. No method accepts a caller-selected Drive file ID.
function exposureApi(request) {
  try {
    if (!isObject_(request) || ["bootstrap", "begin", "complete"].indexOf(request.action) < 0) {
      throw apiError_("INVALID_REQUEST", "Choose a valid archive operation.");
    }
    var payload = request.payload === undefined ? {} : request.payload;
    if (!isObject_(payload)) throw apiError_("INVALID_REQUEST", "The archive request is invalid.");
    var data = withLock_(function () {
      guardVisitorRequest_();
      var project = project_();
      if (request.action === "bootstrap") return bootstrap_(project);
      if (request.action === "begin") return begin_(project, payload);
      return complete_(project, payload);
    });
    return { ok: true, data: data };
  } catch (error) {
    var response = {
      code: error && error.exposureCode_ ? error.exposureCode_ : "ARCHIVE_UNAVAILABLE",
      message: error && error.exposureCode_ ? error.message : "The archive is temporarily unavailable. Please retry."
    };
    if (error && error.originalSaved_ === true) response.originalSaved = true;
    return { ok: false, error: response };
  }
}

// This RPC is separate from the anonymous visitor API. Every call verifies
// Google's active caller identity; a client-supplied email is never trusted.
function artistApi(request) {
  try {
    requireOwner_();
    if (!isObject_(request) || ["status", "import", "refresh"].indexOf(request.action) < 0) {
      throw apiError_("INVALID_REQUEST", "Choose a valid collection operation.");
    }
    var payload = request.payload === undefined ? {} : request.payload;
    if (!isObject_(payload)) throw apiError_("INVALID_REQUEST", "The collection request is invalid.");
    var data = request.action === "refresh" ? refreshArtistCollection_() : withLock_(function () {
      var project = project_();
      if (request.action === "status") return artistStatus_(project);
      return importArtist_(project, imageInput_(payload.image, EXPOSURE_CONFIG_.maxOriginalBytes, false));
    });
    return { ok: true, data: data };
  } catch (error) {
    return { ok: false, error: {
      code: error && error.exposureCode_ ? error.exposureCode_ : "ARCHIVE_UNAVAILABLE",
      message: error && error.exposureCode_ ? error.message : "The collection request could not be confirmed. Please retry."
    } };
  }
}

function artistStatus_(project) {
  return {
    artistCount: readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders).filter(function (source) {
      return source.kind === "artist" && isEligible_(source);
    }).length,
    maxOriginalBytes: EXPOSURE_CONFIG_.maxOriginalBytes,
    folders: {
      root: ArchiveDrive.getFolderById(PropertiesService.getScriptProperties().getProperty("EXPOSURE_ROOT_FOLDER_ID")).getUrl(),
      artist: project.artist.getUrl(), originals: project.originals.getUrl(), results: project.results.getUrl()
    }
  };
}

function importArtist_(project, image) {
  var sources = readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders);
  var existing = sources.filter(function (source) { return source.kind === "artist" && source.sha256 === image.hash; })[0];
  if (existing && isEligible_(existing)) {
    readSource_(existing);
    return { imported: false, duplicate: true, artistCount: artistStatus_(project).artistCount, name: image.name };
  }
  // Artist uploads are deliberate owner operations, separate from the visitor
  // intake budget. A deterministic name recovers an interrupted index write.
  var filename = "artist-" + image.hash + "." + extension_(image.mimeType);
  var files = project.artist.getFilesByName(filename);
  var duplicate = files.hasNext();
  var file;
  if (duplicate) {
    file = files.next();
    var bytes = file.getBlob().getBytes();
    if (bytes.length !== image.bytes.length || sha256_(bytes) !== image.hash || detectMime_(bytes) !== image.mimeType) {
      throw apiError_("STORAGE_CONFLICT", "An artist photograph could not be verified. Check the collection before retrying.");
    }
  } else {
    file = project.artist.createFile(Utilities.newBlob(image.bytes, image.mimeType, filename));
  }
  var record = Object.assign({}, existing || { createdAt: now_() }, {
    sourceId: file.getId(), sha256: image.hash, nameJson: JSON.stringify(image.name), mimeType: image.mimeType,
    byteLength: image.bytes.length, kind: "artist", eligible: true
  });
  writeRecord_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders, record);
  return { imported: !duplicate, duplicate: duplicate, artistCount: artistStatus_(project).artistCount, name: image.name };
}

// Visible in the editor's Run menu. A public web visitor cannot pass this check.
function setupProject() {
  requireOwner_();
  return setupProject_();
}

function refreshArtistCollection() {
  requireOwner_();
  return refreshArtistCollection_();
}

function requireOwner_() {
  var active = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
  var effective = String(Session.getEffectiveUser().getEmail() || "").trim().toLowerCase();
  if (!active || !effective || active !== effective) {
    throw apiError_("OWNER_REQUIRED", "Open this page while signed into the archive owner's account, or run it in that account's Apps Script editor.");
  }
}

function setupProject_() {
  return withLock_(function () {
    var properties = PropertiesService.getScriptProperties();
    var rootId = properties.getProperty("EXPOSURE_ROOT_FOLDER_ID");
    var root;
    if (rootId) root = ArchiveDrive.getFolderById(rootId);
    else {
      // A globally same-named folder might already be shared. Start with a new
      // default-private root; all subsequent runs reuse this saved identity.
      root = ArchiveDrive.createFolder(EXPOSURE_CONFIG_.rootName);
      properties.setProperty("EXPOSURE_ROOT_FOLDER_ID", root.getId());
    }
    var artist = setupFolder_(root, properties, "EXPOSURE_ARTIST_FOLDER_ID", "My_photos");
    var originals = setupFolder_(root, properties, "EXPOSURE_ORIGINALS_FOLDER_ID", "participant_uploads");
    var results = setupFolder_(root, properties, "EXPOSURE_RESULTS_FOLDER_ID", "Completed_double_exposures");
    var sheetId = properties.getProperty("EXPOSURE_SPREADSHEET_ID");
    var spreadsheet;
    if (sheetId) spreadsheet = ArchiveSheets.openById(sheetId);
    else {
      var existing = root.getFilesByName(EXPOSURE_CONFIG_.sheetName);
      while (existing.hasNext() && !spreadsheet) {
        var candidate = existing.next();
        if (candidate.getMimeType() === "application/vnd.google-apps.spreadsheet") {
          spreadsheet = ArchiveSheets.openById(candidate.getId());
        }
      }
      if (!spreadsheet) spreadsheet = ArchiveSheets.create(EXPOSURE_CONFIG_.sheetName);
      // Save the ID before moving it: a retry still finds a partially set-up Sheet.
      properties.setProperty("EXPOSURE_SPREADSHEET_ID", spreadsheet.getId());
    }
    ArchiveDrive.getFileById(spreadsheet.getId()).moveTo(root);
    setupSheet_(spreadsheet, "Sources", EXPOSURE_CONFIG_.sourcesHeaders);
    setupSheet_(spreadsheet, "Submissions", EXPOSURE_CONFIG_.submissionsHeaders);
    setupSheet_(spreadsheet, "Usage", EXPOSURE_CONFIG_.usageHeaders);
    var links = { root: root.getUrl(), artist: artist.getUrl(), originals: originals.getUrl(), results: results.getUrl(), sheet: spreadsheet.getUrl() };
    console.log(JSON.stringify(links));
    return links;
  });
}

function refreshArtistCollection_() {
  return withLock_(function () {
    var project = project_();
    var existing = readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders);
    var byId = {};
    existing.forEach(function (source) { byId[source.sourceId] = source; });
    var retainedIds = {};
    var seenHashes = {};
    var updates = [];
    var skipped = 0;
    var preserved = 0;
    var files = project.artist.getFiles();
    while (files.hasNext()) {
      var file = files.next();
      var fileId = "";
      try {
        fileId = file.getId();
        if (file.getSize() > EXPOSURE_CONFIG_.maxOriginalBytes) { skipped++; continue; }
        var bytes = file.getBlob().getBytes();
        var mimeType = detectMime_(bytes);
        if (!mimeType || bytes.length > EXPOSURE_CONFIG_.maxOriginalBytes) { skipped++; continue; }
        var hash = sha256_(bytes);
        if (seenHashes[hash]) { skipped++; continue; }
        seenHashes[hash] = true;
        retainedIds[fileId] = true;
        var record = Object.assign({}, byId[fileId] || { createdAt: now_() });
        record.sourceId = fileId;
        record.sha256 = hash;
        record.nameJson = JSON.stringify(cleanName_(file.getName()));
        record.mimeType = mimeType;
        record.byteLength = bytes.length;
        record.kind = "artist";
        record.eligible = true;
        updates.push(record);
      } catch (error) {
        skipped++;
        // A transient quota/read error is not evidence that an indexed source
        // became invalid. Keep its last known eligibility until a successful
        // scan can inspect it. Explicit unsupported/oversized files above and
        // files absent from the folder still become ineligible.
        var previous = fileId && byId[fileId];
        if (previous && previous.kind === "artist" && !seenHashes[previous.sha256]) {
          retainedIds[fileId] = true;
          if (isEligible_(previous)) {
            seenHashes[previous.sha256] = true;
            preserved++;
          }
        }
      }
    }
    // Build the new inventory before changing eligibility. Interrupted scans do
    // not first erase the usable artist collection.
    existing.forEach(function (source) {
      if (source.kind === "artist" && !retainedIds[source.sourceId]) {
        source.eligible = false;
        writeRecord_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders, source);
      }
    });
    updates.forEach(function (source) { writeRecord_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders, source); });
    var summary = { artistCount: updates.length + preserved, skipped: skipped, preserved: preserved };
    console.log(JSON.stringify(summary));
    return summary;
  });
}

function bootstrap_(project) {
  var includeParticipants = includeParticipants_();
  var sources = eligibleSources_(project, "", includeParticipants);
  var artistCount = sources.filter(function (source) { return source.kind === "artist"; }).length;
  return {
    totalEligible: sources.length,
    artistCount: artistCount,
    participantCount: sources.length - artistCount,
    includeParticipantPhotos: includeParticipants,
    maxOriginalBytes: EXPOSURE_CONFIG_.maxOriginalBytes,
    maxResultBytes: EXPOSURE_CONFIG_.maxResultBytes
  };
}

function begin_(project, payload) {
  var submissionId = submissionId_(payload.submissionId);
  if (payload.reuse !== undefined && !isObject_(payload.reuse)) {
    throw apiError_("INVALID_REQUEST", "The previous exposure could not be verified.");
  }
  var reusing = isObject_(payload.reuse);
  if (reusing === (payload.original !== undefined)) {
    throw apiError_("INVALID_REQUEST", "Choose one photograph or one saved exposure to pair.");
  }
  if (reusing && payload.allowReuse !== undefined) {
    throw apiError_("INVALID_REQUEST", "A photograph's sharing choice cannot be changed by another pairing.");
  }
  var submissions = readRecords_(project.submissions, EXPOSURE_CONFIG_.submissionsHeaders);
  var previous = null;
  var original = null;
  var originalHash;
  var allowReuse;
  if (reusing) {
    var previousId = submissionId_(payload.reuse.submissionId);
    previous = findRecord_(submissions, "submissionId", previousId);
    if (!previous || !tokenMatches_(previous.token, payload.reuse.token) || previous.status !== "complete") {
      throw apiError_("INVALID_TOKEN", "The previous exposure could not be verified. Start with a new photograph.");
    }
    originalHash = previous.originalSha256;
    allowReuse = previous.allowReuse === true || previous.allowReuse === "true";
  } else {
    if (payload.allowReuse !== undefined && typeof payload.allowReuse !== "boolean") {
      throw apiError_("INVALID_REQUEST", "The photograph sharing choice is invalid.");
    }
    original = imageInput_(payload.original, EXPOSURE_CONFIG_.maxOriginalBytes, false);
    originalHash = original.hash;
    allowReuse = payload.allowReuse === true;
  }
  var submission = findRecord_(submissions, "submissionId", submissionId);
  if (submission && (submission.originalSha256 !== originalHash ||
      (submission.allowReuse === true || submission.allowReuse === "true") !== allowReuse ||
      String(submission.parentSubmissionId || "") !== (previous ? previous.submissionId : ""))) {
    throw apiError_("SUBMISSION_CONFLICT", "This submission already belongs to a different photograph. Start a new submission.");
  }
  if (!submission) {
    reserveUsage_(project, "submission:" + submissionId, "submission", 0);
    var source = previous
      ? findRecord_(readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders), "sourceId", previous.originalId)
      : saveOriginal_(project, original);
    if (!source || source.sha256 !== originalHash) throw apiError_("ARCHIVE_UNAVAILABLE", "The original photograph is unavailable. Please contact the artist.");
    submission = {
      submissionId: submissionId, token: newToken_(), originalId: source.sourceId,
      originalSha256: originalHash, baseId: "", status: "pending", resultId: "",
      resultSha256: "", width: "", height: "", settingsJson: "", createdAt: now_(), completedAt: "",
      allowReuse: allowReuse, parentSubmissionId: previous ? previous.submissionId : ""
    };
    writeRecord_(project.submissions, EXPOSURE_CONFIG_.submissionsHeaders, submission);
  }
  try {
    var base;
    if (submission.baseId) {
      var assigned = findRecord_(readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders), "sourceId", submission.baseId);
      if (!assigned) throw apiError_("BASE_UNAVAILABLE", "The assigned photograph is unavailable. Please contact the artist.");
      base = readSource_(assigned);
    } else {
      var excludedBaseHash = "";
      if (previous) {
        var priorBase = findRecord_(readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders), "sourceId", previous.baseId);
        if (!priorBase) throw apiError_("BASE_UNAVAILABLE", "The previous base photograph is unavailable. Please contact the artist.", true);
        excludedBaseHash = priorBase.sha256;
      }
      var candidates = eligibleSources_(project, originalHash, includeParticipants_(), excludedBaseHash);
      var hadCandidates = candidates.length > 0;
      while (candidates.length && !base) {
        var choice = Math.floor(Math.random() * candidates.length);
        var selected = candidates.splice(choice, 1)[0];
        try { base = readSource_(selected); }
        catch (error) {
          // A Drive read can fail transiently. Skip this candidate only for this
          // request; owner refresh controls persistent collection eligibility.
        }
      }
      if (!base) {
        if (hadCandidates) throw apiError_("BASE_UNAVAILABLE", "Your original was saved, but source photographs could not be read. Please retry.", true);
        if (previous) throw apiError_("NO_ALTERNATIVE_BASE", "There is no different photograph available for another pairing yet.", true);
        throw apiError_("NO_BASE", "Your original was saved. No different source photograph is available yet. Retry after the artist adds photographs.", true);
      }
      submission.baseId = base.id;
      submission.status = "paired";
      writeRecord_(project.submissions, EXPOSURE_CONFIG_.submissionsHeaders, submission);
    }
    return { submissionId: submissionId, token: submission.token, originalId: submission.originalId, base: base };
  } catch (error) {
    error.originalSaved_ = true;
    throw error;
  }
}

function complete_(project, payload) {
  var submissionId = submissionId_(payload.submissionId);
  var submission = findRecord_(readRecords_(project.submissions, EXPOSURE_CONFIG_.submissionsHeaders), "submissionId", submissionId);
  if (!submission || !tokenMatches_(submission.token, payload.token)) {
    throw apiError_("INVALID_TOKEN", "This submission could not be verified. Retry the original submission.");
  }
  try {
    if (!submission.baseId) throw apiError_("NO_BASE", "Your original is saved, but it has not been paired yet. Retry the original submission.", true);
    var result = imageInput_(payload.result, EXPOSURE_CONFIG_.maxResultBytes, true);
    var dimensions = dimensions_(payload.width, payload.height);
    var settings = settings_(payload.settings);
    var settingsJson = JSON.stringify(settings);
    if (submission.resultSha256 && (submission.resultSha256 !== result.hash || Number(submission.width) !== dimensions.width || Number(submission.height) !== dimensions.height || submission.settingsJson !== settingsJson)) {
      throw apiError_("RESULT_CONFLICT", "This submission already has a different result. Start a new submission to save another result.", true);
    }
    if (!submission.resultSha256) {
      submission.resultSha256 = result.hash;
      submission.width = dimensions.width;
      submission.height = dimensions.height;
      submission.settingsJson = settingsJson;
      submission.status = "saving";
      writeRecord_(project.submissions, EXPOSURE_CONFIG_.submissionsHeaders, submission);
    }
    var filename = "result-" + submissionId + "-" + result.hash + ".jpg";
    var file = recoverOrCreate_(project, project.results, filename, result);
    submission.resultId = file.getId();
    submission.status = "complete";
    if (!submission.completedAt) submission.completedAt = now_();
    writeRecord_(project.submissions, EXPOSURE_CONFIG_.submissionsHeaders, submission);
    var original = findRecord_(readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders), "sourceId", submission.originalId);
    if (!original) throw apiError_("ARCHIVE_UNAVAILABLE", "The original's archive record is unavailable. Please retry.", true);
    // Eligibility follows the saved result and this photograph's consent.
    // A retry repairs an interrupted final update without another file write.
    if ((submission.allowReuse === true || submission.allowReuse === "true") && !isEligible_(original)) {
      original.eligible = true;
      writeRecord_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders, original);
    }
    var currentBase = findRecord_(readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders), "sourceId", submission.baseId);
    var alternatives = currentBase ? eligibleSources_(project, submission.originalSha256, includeParticipants_(), currentBase.sha256) : [];
    return { submissionId: submissionId, saved: true, resultId: file.getId(), originalId: submission.originalId,
      baseId: submission.baseId, canRePair: alternatives.length > 0 };
  } catch (error) {
    error.originalSaved_ = true;
    throw error;
  }
}

function saveOriginal_(project, image) {
  var sources = readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders);
  var existing = sources.filter(function (source) { return source.kind === "participant" && source.sha256 === image.hash; })[0];
  if (existing) {
    // Verify the archived file rather than trust only a stale index entry.
    readSource_(existing);
    return existing;
  }
  var filename = "source-" + image.hash + "." + extension_(image.mimeType);
  var file = recoverOrCreate_(project, project.originals, filename, image);
  var source = {
    sourceId: file.getId(), sha256: image.hash, nameJson: JSON.stringify(image.name), mimeType: image.mimeType,
    byteLength: image.bytes.length, kind: "participant", eligible: false, createdAt: now_()
  };
  writeRecord_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders, source);
  return source;
}

function recoverOrCreate_(project, folder, filename, image) {
  var files = folder.getFilesByName(filename);
  if (files.hasNext()) {
    var file = files.next();
    var bytes = file.getBlob().getBytes();
    if (bytes.length !== image.bytes.length || sha256_(bytes) !== image.hash || detectMime_(bytes) !== image.mimeType) {
      throw apiError_("STORAGE_CONFLICT", "An archive file could not be verified. Please contact the artist.");
    }
    return file;
  }
  // Reserve before Drive writes. A retry reuses this key, including when the
  // previous attempt stopped after reservation or after creating the file.
  reserveUsage_(project, "file:" + folder.getId() + ":" + filename, "file", image.bytes.length);
  return folder.createFile(Utilities.newBlob(image.bytes, image.mimeType, filename));
}

function readSource_(source) {
  try {
    var file = ArchiveDrive.getFileById(source.sourceId);
    if (file.getSize() > EXPOSURE_CONFIG_.maxOriginalBytes) throw new Error("Too large");
    var bytes = file.getBlob().getBytes();
    if (bytes.length > EXPOSURE_CONFIG_.maxOriginalBytes || sha256_(bytes) !== source.sha256 || detectMime_(bytes) !== source.mimeType) throw new Error("Changed source");
    return { id: source.sourceId, name: JSON.parse(source.nameJson), mimeType: source.mimeType, base64: Utilities.base64Encode(bytes) };
  } catch (error) {
    throw apiError_("BASE_UNAVAILABLE", "The assigned photograph is unavailable. Please contact the artist.");
  }
}

function eligibleSources_(project, excludedHash, includeParticipants, excludedBaseHash) {
  var candidates = readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders).filter(function (source) {
    return isEligible_(source) && source.sha256 !== excludedHash && source.sha256 !== excludedBaseHash &&
      (source.kind === "artist" || (includeParticipants && source.kind === "participant"));
  });
  // Archive roles remain separate, but byte-identical photographs get one
  // chance in the lottery. Prefer the artist's source when both roles exist.
  var ordered = candidates.filter(function (source) { return source.kind === "artist"; })
    .concat(candidates.filter(function (source) { return source.kind === "participant"; }));
  var seen = {};
  return ordered.filter(function (source) {
    if (seen[source.sha256]) return false;
    seen[source.sha256] = true;
    return true;
  });
}

function imageInput_(input, limit, resultOnly) {
  if (!isObject_(input) || typeof input.name !== "string" || typeof input.mimeType !== "string" || typeof input.base64 !== "string") {
    throw apiError_("INVALID_IMAGE", "The photograph could not be read. Please choose it again.");
  }
  var encoded = input.base64;
  if (!encoded.length || encoded.length > Math.ceil(limit / 3) * 4 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw apiError_("INVALID_IMAGE", "The photograph is invalid or exceeds the archive size limit.");
  }
  var bytes;
  try { bytes = Utilities.base64Decode(encoded); }
  catch (error) { throw apiError_("INVALID_IMAGE", "The photograph could not be decoded."); }
  if (!bytes.length || bytes.length > limit) throw apiError_("IMAGE_TOO_LARGE", "The photograph exceeds the archive size limit.");
  var mimeType = detectMime_(bytes);
  if (!mimeType || input.mimeType.toLowerCase() !== mimeType || (resultOnly && mimeType !== "image/jpeg")) {
    throw apiError_("UNSUPPORTED_IMAGE", resultOnly ? "The finished exposure must be a JPEG." : "Choose a JPEG, PNG, WebP, or AVIF photograph.");
  }
  return { name: cleanName_(input.name), mimeType: mimeType, bytes: bytes, hash: sha256_(bytes) };
}

function detectMime_(bytes) {
  var length = bytes.length;
  var byte = function (index) { return bytes[index] & 255; };
  var text = function (offset, count) {
    var value = "";
    for (var i = offset; i < offset + count && i < length; i++) value += String.fromCharCode(byte(i));
    return value;
  };
  if (length >= 3 && byte(0) === 255 && byte(1) === 216 && byte(2) === 255) return "image/jpeg";
  if (length >= 8 && byte(0) === 137 && text(1, 3) === "PNG" && byte(4) === 13 && byte(5) === 10 && byte(6) === 26 && byte(7) === 10) return "image/png";
  if (length >= 12 && text(0, 4) === "RIFF" && text(8, 4) === "WEBP") return "image/webp";
  if (length >= 16 && text(4, 4) === "ftyp") {
    var boxSize = byte(0) * 16777216 + byte(1) * 65536 + byte(2) * 256 + byte(3);
    if (boxSize >= 16 && boxSize <= length) {
      if (/^avi[fs]$/.test(text(8, 4))) return "image/avif";
      for (var offset = 16; offset + 4 <= boxSize; offset += 4) {
        if (/^avi[fs]$/.test(text(offset, 4))) return "image/avif";
      }
    }
  }
  return "";
}

function dimensions_(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 10000 || height > 10000 || width * height > 80000000) {
    throw apiError_("INVALID_DIMENSIONS", "The finished exposure dimensions are invalid.");
  }
  return { width: width, height: height };
}

function settings_(value) {
  if (!isObject_(value) || typeof value.baseExposure !== "number" || !Number.isFinite(value.baseExposure) || value.baseExposure < -3 || value.baseExposure > 1 || typeof value.participantExposure !== "number" || !Number.isFinite(value.participantExposure) || value.participantExposure < -3 || value.participantExposure > 1 || typeof value.contrast !== "number" || !Number.isFinite(value.contrast) || value.contrast < -30 || value.contrast > 30 || typeof value.monochrome !== "boolean") {
    throw apiError_("INVALID_SETTINGS", "The exposure settings are invalid.");
  }
  return { baseExposure: value.baseExposure, participantExposure: value.participantExposure, contrast: value.contrast, monochrome: value.monochrome };
}

function project_() {
  var properties = PropertiesService.getScriptProperties();
  var ids = ["EXPOSURE_ARTIST_FOLDER_ID", "EXPOSURE_ORIGINALS_FOLDER_ID", "EXPOSURE_RESULTS_FOLDER_ID", "EXPOSURE_SPREADSHEET_ID"].map(function (key) { return properties.getProperty(key); });
  if (ids.some(function (id) { return !id; })) throw apiError_("NOT_CONFIGURED", "The artist has not connected the archive yet.");
  var spreadsheet = ArchiveSheets.openById(ids[3]);
  var sources = spreadsheet.getSheetByName("Sources");
  var submissions = spreadsheet.getSheetByName("Submissions");
  if (!sources || !submissions) throw apiError_("NOT_CONFIGURED", "The archive index has not been set up yet.");
  validateHeaders_(sources, EXPOSURE_CONFIG_.sourcesHeaders);
  ensureSubmissionHeaders_(submissions);
  // Add the ledger when an older deployment first opens its existing index.
  var usage = setupSheet_(spreadsheet, "Usage", EXPOSURE_CONFIG_.usageHeaders);
  return { artist: ArchiveDrive.getFolderById(ids[0]), originals: ArchiveDrive.getFolderById(ids[1]), results: ArchiveDrive.getFolderById(ids[2]), sources: sources, submissions: submissions, usage: usage };
}

function archiveLimits_() {
  var properties = PropertiesService.getScriptProperties();
  function positive(key, fallback) {
    var raw = properties.getProperty(key);
    if (raw === null) return fallback;
    var value = Number(raw);
    if (!/^\d+$/.test(String(raw).trim()) || !Number.isSafeInteger(value) || value < 1) {
      throw apiError_("LIMIT_CONFIGURATION", "The archive limits need the artist's attention.");
    }
    return value;
  }
  var paused = properties.getProperty("UPLOADS_PAUSED");
  if (paused !== null && ["true", "false"].indexOf(String(paused).trim().toLowerCase()) < 0) {
    throw apiError_("LIMIT_CONFIGURATION", "The archive limits need the artist's attention.");
  }
  return { paused: String(paused).trim().toLowerCase() === "true",
    requests: positive("REQUESTS_PER_MINUTE", 120),
    submissions: positive("SUBMISSIONS_PER_DAY", 200),
    bytes: positive("UPLOAD_BYTES_PER_DAY", 1024 * 1024 * 1024) };
}

// Called under the script lock before reading or decoding visitor data. The
// fixed UTC minute is a global budget, not a per-person or per-IP rate limit.
function guardVisitorRequest_() {
  var limits = archiveLimits_();
  if (limits.paused) throw apiError_("UPLOADS_PAUSED", "The artist has temporarily paused uploads. Please try again later.");
  var properties = PropertiesService.getScriptProperties();
  var minute = Math.floor(Date.now() / 60000);
  var raw = properties.getProperty("EXPOSURE_REQUEST_WINDOW");
  var state = { minute: minute, count: 0 };
  if (raw !== null) {
    try { state = JSON.parse(raw); } catch (error) { state = null; }
    if (!isObject_(state) || !Number.isSafeInteger(state.minute) || state.minute < 0 || state.minute > minute ||
        !Number.isSafeInteger(state.count) || state.count < 0) {
      throw apiError_("LIMIT_CONFIGURATION", "The archive limits need the artist's attention.");
    }
    if (state.minute < minute) state = { minute: minute, count: 0 };
  }
  if (state.count >= limits.requests) throw apiError_("RATE_LIMITED", "The archive is receiving too many requests. Please retry in a minute.");
  state.count++;
  properties.setProperty("EXPOSURE_REQUEST_WINDOW", JSON.stringify(state));
}

function reserveUsage_(project, key, kind, bytes) {
  var records = readRecords_(project.usage, EXPOSURE_CONFIG_.usageHeaders);
  var today = now_().slice(0, 10);
  var usedBytes = 0;
  var usedSubmissions = 0;
  var existing = null;
  var seen = {};
  records.forEach(function (record) {
    if (typeof record.key !== "string" || !record.key || seen[record.key] ||
        typeof record.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(record.day) || record.day > today ||
        !Number.isFinite(Date.parse(record.day)) || new Date(record.day).toISOString().slice(0, 10) !== record.day ||
        ["submission", "file"].indexOf(record.kind) < 0 || !Number.isSafeInteger(record.bytes) || record.bytes < 0 ||
        (record.kind === "submission" && record.bytes !== 0) || (record.kind === "file" && record.bytes < 1)) {
      throw apiError_("LIMIT_CONFIGURATION", "The archive usage records need the artist's attention.");
    }
    seen[record.key] = true;
    if (record.key === key) existing = record;
    if (record.day === today) {
      usedBytes += record.bytes;
      if (record.kind === "submission") usedSubmissions++;
    }
  });
  if (!Number.isSafeInteger(usedBytes)) throw apiError_("LIMIT_CONFIGURATION", "The archive usage records need the artist's attention.");
  if (existing) {
    if (existing.kind !== kind || existing.bytes !== bytes) throw apiError_("LIMIT_CONFIGURATION", "The archive usage records need the artist's attention.");
    if (existing.day === today) return;
  }
  var limits = archiveLimits_();
  if ((kind === "submission" && usedSubmissions >= limits.submissions) || bytes > limits.bytes - usedBytes) {
    throw apiError_("DAILY_LIMIT_REACHED", "Today's archive intake limit has been reached. Please try again tomorrow.");
  }
  // Keep ISO day labels as text instead of letting Sheets infer a local date.
  var reservation = existing || { key: key, kind: kind, bytes: bytes };
  // This helper runs only before a new submission/file write. A recovered
  // existing file bypasses it. Move an unused older reservation to today so
  // delayed attempts cannot spend several days' allowances in one day.
  reservation.day = today;
  project.usage.getRange(reservation._row || project.usage.getLastRow() + 1, 2).setNumberFormat("@");
  writeRecord_(project.usage, EXPOSURE_CONFIG_.usageHeaders, reservation);
  // Persist this reservation before a Drive write or a later index operation.
  ArchiveSheets.flush();
}

function setupFolder_(root, properties, key, name) {
  var id = properties.getProperty(key);
  if (id) return ArchiveDrive.getFolderById(id);
  var folders = root.getFoldersByName(name);
  var folder = folders.hasNext() ? folders.next() : root.createFolder(name);
  properties.setProperty(key, folder.getId());
  return folder;
}

function setupSheet_(spreadsheet, name, headers) {
  var sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (name === "Submissions") ensureSubmissionHeaders_(sheet);
  else validateHeaders_(sheet, headers);
  return sheet;
}

function ensureSubmissionHeaders_(sheet) {
  var headers = EXPOSURE_CONFIG_.submissionsHeaders;
  validateHeaders_(sheet, headers.slice(0, 13));
  var extra = sheet.getRange(1, 14, 1, 2).getValues()[0];
  if (extra[0] === "" && extra[1] === "") sheet.getRange(1, 14, 1, 2).setValues([headers.slice(13)]);
  validateHeaders_(sheet, headers);
}

function validateHeaders_(sheet, headers) {
  var actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (headers.some(function (header, index) { return actual[index] !== header; })) {
    throw apiError_("INDEX_SCHEMA", "The archive index needs the artist's attention.");
  }
}

function readRecords_(sheet, headers) {
  var count = sheet.getLastRow() - 1;
  if (count < 1) return [];
  return sheet.getRange(2, 1, count, headers.length).getValues().map(function (values, index) {
    var record = { _row: index + 2 };
    headers.forEach(function (header, column) { record[header] = values[column]; });
    return record;
  });
}

function writeRecord_(sheet, headers, record) {
  var row = record._row || sheet.getLastRow() + 1;
  var values = headers.map(function (header) { return record[header] === undefined ? "" : record[header]; });
  sheet.getRange(row, 1, 1, headers.length).setValues([values]);
  record._row = row;
}

function findRecord_(records, key, value) {
  for (var index = 0; index < records.length; index++) if (records[index][key] === value) return records[index];
  return null;
}

function withLock_(callback) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw apiError_("BUSY", "The archive is busy. Please retry in a moment.");
  try {
    ArchiveDrive.reset();
    ArchiveSheets.reset();
    return callback();
  }
  finally {
    // Commit buffered Sheet writes before another request acquires the lock.
    try { ArchiveSheets.flush(); }
    finally { lock.releaseLock(); }
  }
}

function siteConfig_() {
  var properties = PropertiesService.getScriptProperties();
  var siteUrl = String(properties.getProperty("SITE_URL") || "").trim();
  var match = /^(https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?)(\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]*)?$/.exec(siteUrl);
  if (!match) throw apiError_("NOT_CONFIGURED", "The archive website address has not been configured.");
  var origins = [match[1]];
  String(properties.getProperty("ALLOWED_ORIGINS") || "").split(",").forEach(function (entry) {
    var origin = entry.trim();
    if (!origin) return;
    var validHttps = /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(origin);
    var validLocal = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/.test(origin);
    if (!validHttps && !validLocal) throw apiError_("NOT_CONFIGURED", "An additional website origin is invalid.");
    if (origins.indexOf(origin) < 0) origins.push(origin);
  });
  return { siteUrl: siteUrl.replace(/\/+$/, "") + "/", origins: origins };
}

function includeParticipants_() {
  return String(PropertiesService.getScriptProperties().getProperty("INCLUDE_PARTICIPANT_PHOTOS") || "").toLowerCase().trim() !== "false";
}

function submissionId_(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw apiError_("INVALID_SUBMISSION", "The submission identifier is invalid. Start a new submission.");
  }
  return value.toLowerCase();
}

function sha256_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function (byte) {
    return ("0" + (byte & 255).toString(16)).slice(-2);
  }).join("");
}

function newToken_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ""); }
function tokenMatches_(expected, supplied) {
  if (typeof supplied !== "string" || typeof expected !== "string" || supplied.length !== expected.length || !expected.length) return false;
  var difference = 0;
  for (var index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  return difference === 0;
}
function cleanName_(value) { return String(value).replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 200).trim() || "Photograph"; }
function extension_(mimeType) { return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" }[mimeType]; }
function isEligible_(source) { return source.eligible === true || source.eligible === "true"; }
function isObject_(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function now_() { return new Date().toISOString(); }
function escapeHtml_(value) { return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function apiError_(code, message, originalSaved) {
  var error = new Error(message);
  error.exposureCode_ = code;
  if (originalSaved) error.originalSaved_ = true;
  return error;
}

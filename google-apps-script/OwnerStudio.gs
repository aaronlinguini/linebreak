function studioPage_(siteUrl) {
  requireOwner_();
  requireProjectOwner_();
  var html = HtmlService.createHtmlOutputFromFile("Studio").getContent();
  html = html.split("__STUDIO_ASSET_ROOT__").join(escapeHtml_(siteUrl));
  return HtmlService.createHtmlOutput(html)
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setTitle("Double exposure studio");
}

function studioApi(request) {
  return runStudioRequest_(request, false);
}

function publicStudioApi(request) {
  return runStudioRequest_(request, true);
}

function runStudioRequest_(request, publicArchive) {
  try {
    if (!publicArchive) requireOwner_();
    requireProjectOwner_();
    var archive = publicArchive ? "studio" : "personal archive";
    var invalid = "The " + archive + " request is invalid.";
    if (!isObject_(request) || Object.keys(request).some(function (key) { return ["action", "payload"].indexOf(key) < 0; }) ||
        ["status", "save"].indexOf(request.action) < 0) {
      throw apiError_("INVALID_REQUEST", "Choose a valid " + archive + " operation.");
    }
    var payload = request.payload === undefined ? {} : request.payload;
    if (!isObject_(payload)) throw apiError_("INVALID_REQUEST", invalid);
    var image, dimensions, maximum = EXPOSURE_CONFIG_.maxResultBytes;
    if (request.action === "status") {
      if (Object.keys(payload).length) throw apiError_("INVALID_REQUEST", invalid);
    } else {
      if (Object.keys(payload).some(function (key) { return ["program", "image", "width", "height"].indexOf(key) < 0; }) ||
          payload.program !== undefined && ["original-current", "experimental-film-sim"].indexOf(payload.program) < 0 ||
          !isObject_(payload.image) || Object.keys(payload.image).some(function (key) { return ["name", "mimeType", "base64"].indexOf(key) < 0; }) ||
          typeof payload.image.name === "string" && /[\\/]/.test(payload.image.name)) {
        throw apiError_("INVALID_REQUEST", invalid);
      }
      if (!publicArchive) image = imageInput_(payload.image, maximum, true);
      dimensions = dimensions_(payload.width, payload.height);
    }
    var data = withLock_(function () {
      if (publicArchive) guardVisitorRequest_();
      if (publicArchive && request.action === "status") {
        if (!PropertiesService.getScriptProperties().getProperty("EXPOSURE_ROOT_FOLDER_ID")) {
          throw apiError_("NOT_CONFIGURED", "The studio archive is not connected.");
        }
        return { maxResultBytes: maximum };
      }
      if (publicArchive) image = imageInput_(payload.image, maximum, true);
      var folder = studioFolder_(publicArchive);
      if (request.action === "status") return { folderUrl: folder.getUrl(), maxResultBytes: maximum };
      return saveStudioResult_(folder, image, dimensions, payload.program, publicArchive);
    });
    return { ok: true, data: data };
  } catch (error) {
    return { ok: false, error: {
      code: error && error.exposureCode_ ? error.exposureCode_ : "ARCHIVE_UNAVAILABLE",
      message: error && error.exposureCode_ ? error.message : (publicArchive ? "The save" : "The personal save") + " could not be confirmed. Please retry."
    } };
  }
}

function studioFolder_(publicArchive) {
  var properties = PropertiesService.getScriptProperties();
  var rootId = properties.getProperty("EXPOSURE_ROOT_FOLDER_ID");
  var archive = publicArchive ? "studio archive" : "personal archive";
  if (!rootId) throw apiError_("NOT_CONFIGURED", "The " + archive + " is not connected.");
  var ownerKey = "EXPOSURE_OWNER_RESULTS_FOLDER_ID", publicKey = "EXPOSURE_PUBLIC_STUDIO_RESULTS_FOLDER_ID";
  var key = publicArchive ? publicKey : ownerKey;
  var name = publicArchive ? "Studio_double_exposures" : "Personal_double_exposures";
  var existingId = properties.getProperty(key);
  var reservedIds = [rootId, properties.getProperty("EXPOSURE_ARTIST_FOLDER_ID"),
    properties.getProperty("EXPOSURE_ORIGINALS_FOLDER_ID"), properties.getProperty("EXPOSURE_RESULTS_FOLDER_ID"),
    properties.getProperty(publicArchive ? ownerKey : publicKey)];
  if (existingId && reservedIds.indexOf(existingId) >= 0) {
    throw apiError_("STUDIO_CONFIGURATION", "The " + archive + " folder needs attention.");
  }
  var root = ArchiveDrive.getFolderById(rootId);
  if (!publicArchive) return setupFolder_(root, properties, key, name);

  // Public saves may use only an app-managed child with this folder name.
  var folders = root.getFoldersByName(name);
  while (folders.hasNext()) {
    var folder = folders.next();
    if (reservedIds.indexOf(folder.getId()) >= 0 || (existingId && folder.getId() !== existingId)) continue;
    if (!existingId) properties.setProperty(key, folder.getId());
    return folder;
  }
  if (existingId) throw apiError_("STUDIO_CONFIGURATION", "The studio archive folder needs attention.");
  var created = root.createFolder(name);
  properties.setProperty(key, created.getId());
  return created;
}

function saveStudioResult_(folder, image, dimensions, program, publicArchive) {
  var prefix = publicArchive ? "studio-result" : program === "original-current" ? "original-current-double-exposure-program"
    : program === "experimental-film-sim" ? "experimental-film-sim" : "personal-result";
  var filename = prefix + "-" + image.hash + ".jpg";
  var files = folder.getFilesByName(filename);
  var duplicate = files.hasNext();
  var file = duplicate ? files.next() : folder.createFile(Utilities.newBlob(image.bytes, image.mimeType, filename));
  verifyImageFile_(file, image);
  var result = {
    saved: true, duplicate: duplicate, sha256: image.hash, byteLength: image.bytes.length,
    width: dimensions.width, height: dimensions.height
  };
  if (!publicArchive) {
    result.fileUrl = file.getUrl();
    result.folderUrl = folder.getUrl();
  }
  return result;
}

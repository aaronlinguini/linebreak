/*
 * Small adapters for the archive's Drive and Sheets operations. Archive writes
 * use drive.file and require this app's private marker. The artist-folder reader
 * uses drive.readonly so photos dropped directly into Drive can be discovered.
 * Run this version from the dedicated project account, not a personal account.
 * Enable Advanced Drive v3 and Sheets v4. Binary downloads use only the fixed
 * Drive API media endpoint and need script.external_request as well.
 */
var ArchiveDrive = (function () {
  var folderType = "application/vnd.google-apps.folder";
  var sheetType = "application/vnd.google-apps.spreadsheet";
  var marker = "drive-file-v1";
  var fields = "id,name,mimeType,size,parents,trashed,isAppAuthorized,appProperties,createdTime,modifiedTime,sha256Checksum,version,capabilities(canDownload)";
  var metadata = Object.create(null);

  function failure(code, message) {
    var error = new Error(message);
    error.exposureCode_ = code;
    return error;
  }
  function accessFailure() {
    return failure("ACCESS_NOT_GRANTED", "This archive file or folder was not created by the limited-access project. Use the archive IDs saved by setup; manually added photos are read through the separately configured base-photo folder.");
  }
  function validId(id) {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw accessFailure();
    return id;
  }
  function managed(file) {
    return file && file.isAppAuthorized === true && file.appProperties &&
      file.appProperties.exposureArchive === marker && file.trashed !== true;
  }
  function remember(file) {
    if (!managed(file)) throw accessFailure();
    metadata[validId(file.id)] = file;
    return file;
  }
  function get(id) {
    validId(id);
    if (!metadata[id]) {
      try { remember(Drive.Files.get(id, { fields: fields })); }
      catch (error) {
        if (error.exposureCode_ || /\b(?:401|403|404)\b|not found|insufficient permission|permission denied/i.test(String(error.message))) throw accessFailure();
        throw error;
      }
    }
    return metadata[id];
  }
  function create(name, mimeType, parent, blob) {
    var resource = { name: String(name), mimeType: mimeType, appProperties: { exposureArchive: marker } };
    if (parent) {
      if (get(parent).mimeType !== folderType) throw accessFailure();
      resource.parents = [parent];
    }
    var file = blob
      ? Drive.Files.create(resource, blob, { fields: fields })
      : Drive.Files.create(resource, null, { fields: fields });
    return wrap(remember(file).id);
  }
  function quote(value) { return "'" + String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'"; }
  function iterator(items) {
    var index = 0;
    return { hasNext: function () { return index < items.length; }, next: function () { return items[index++]; } };
  }
  function list(query, select) {
    var found = [], pageToken, seenTokens = Object.create(null);
    do {
      var options = { q: query, fields: "nextPageToken,incompleteSearch,files(" + fields + ")", pageSize: 1000 };
      if (pageToken) options.pageToken = pageToken;
      var page = Drive.Files.list(options);
      if (page.incompleteSearch) throw failure("ARCHIVE_UNAVAILABLE", "The archive file listing was incomplete. Please retry.");
      (page.files || []).forEach(function (file) {
        var selected = select(file);
        if (selected) found.push(selected);
      });
      pageToken = page.nextPageToken;
      if (pageToken && seenTokens[pageToken]) throw failure("ARCHIVE_UNAVAILABLE", "The archive file listing could not be completed. Please retry.");
      if (pageToken) seenTokens[pageToken] = true;
    } while (pageToken);
    return iterator(found);
  }
  function children(id, folders, name) {
    if (get(id).mimeType !== folderType) throw accessFailure();
    var query = quote(id) + " in parents and trashed = false and mimeType " +
      (folders ? "= " : "!= ") + quote(folderType) +
      " and appProperties has { key='exposureArchive' and value='" + marker + "' }";
    if (name !== undefined) query += " and name = " + quote(name);
    return list(query, function (file) {
      // External artist files never enter this managed-file cache or writer.
      if (managed(file) && (file.parents || []).indexOf(id) >= 0 &&
          (file.mimeType === folderType) === folders && (name === undefined || file.name === name)) {
        return wrap(remember(file).id);
      }
      return null;
    });
  }
  function blobFor(id, file) {
    file = file || get(id);
    var size = Number(file.size);
    if (!/^image\/(jpeg|png|webp|avif)$/.test(file.mimeType) || file.capabilities?.canDownload !== true ||
        !Number.isSafeInteger(size) || size < 1 || size > 30 * 1024 * 1024) {
      throw failure("ARCHIVE_UNAVAILABLE", "The archive photograph cannot be downloaded.");
    }
    // IDs come from this app's private index. Never fetch a caller-supplied URL,
    // follow a redirect with the token, return the token, or log the response.
    var response = UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(id) + "?alt=media", {
      method: "get", headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      followRedirects: false, muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) throw failure("ARCHIVE_UNAVAILABLE", "The archive photograph could not be downloaded. Please retry.");
    var blob = response.getBlob();
    if (blob.getBytes().length !== size) throw failure("ARCHIVE_UNAVAILABLE", "The archive photograph changed while it was being read. Please retry.");
    return blob.setName(file.name).setContentType(file.mimeType);
  }

  function artistFailure() {
    return failure("BASE_UNAVAILABLE", "The photograph or configured base-photo folder is unavailable.");
  }
  function artistMetadata(id) {
    validId(id);
    var file;
    try { file = Drive.Files.get(id, { fields: fields }); }
    catch (error) {
      if (/\b(?:401|403|404)\b|not found|insufficient permission|permission denied/i.test(String(error.message))) throw artistFailure();
      throw error;
    }
    if (!file || file.id !== id || file.trashed === true) throw artistFailure();
    return file;
  }
  function artistFolder(id) {
    var file = artistMetadata(id);
    if (file.mimeType !== folderType) throw artistFailure();
    return file;
  }
  function artistImage(file, folderId) {
    return file && file.trashed !== true && /^image\/(jpeg|png|webp|avif)$/.test(file.mimeType) &&
      Array.isArray(file.parents) && file.parents.indexOf(folderId) >= 0;
  }
  function artistFile(id, folderId) {
    validId(folderId);
    var file = artistMetadata(id);
    if (!artistImage(file, folderId)) throw artistFailure();
    return file;
  }
  function checksum(file) {
    return typeof file.sha256Checksum === "string" && /^[0-9a-f]{64}$/i.test(file.sha256Checksum)
      ? file.sha256Checksum.toLowerCase() : "";
  }
  function sameArtistContent(before, after) {
    return before.modifiedTime === after.modifiedTime && before.mimeType === after.mimeType &&
      Number(before.size) === Number(after.size) && before.sha256Checksum === after.sha256Checksum &&
      before.version === after.version && before.capabilities?.canDownload === true && after.capabilities?.canDownload === true &&
      JSON.stringify((before.parents || []).slice().sort()) === JSON.stringify((after.parents || []).slice().sort());
  }
  function fingerprintFor(id, file) {
    var size = Number(file.size), hash = checksum(file);
    if (!hash || !/^image\/(jpeg|png|webp)$/.test(file.mimeType)) return null;
    if (!Number.isSafeInteger(size) || size < 1 || size > 30 * 1024 * 1024 || file.capabilities?.canDownload !== true) throw artistFailure();
    var length = Math.min(64, size);
    var response = UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(id) + "?alt=media", {
      method: "get", headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken(), Range: "bytes=0-" + (length - 1) },
      followRedirects: false, muteHttpExceptions: true
    });
    var status = response.getResponseCode();
    var bytes = response.getBlob().getBytes();
    var transfer = { transferredBytes: bytes.length, fullRead: status !== 206 || bytes.length > 64 };
    try {
      if (status !== 206 && status !== 200) throw artistFailure();
      if (status === 206) {
        var headers = response.getAllHeaders();
        var names = Object.keys(headers).filter(function (name) { return name.toLowerCase() === "content-range"; });
        if (names.length !== 1 || typeof headers[names[0]] !== "string" ||
            headers[names[0]] !== "bytes 0-" + (length - 1) + "/" + size || bytes.length !== length) throw artistFailure();
      } else {
        // A server may ignore Range. Verify that full response without fetching it again.
        if (bytes.length !== size) throw artistFailure();
        var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
          .map(function (value) { return ("0" + ((value + 256) % 256).toString(16)).slice(-2); }).join("");
        if (digest !== hash) throw artistFailure();
      }
    } catch (error) {
      throw scanReadFailure(error, transfer);
    }
    return Object.assign(transfer, { sha256: hash, header: bytes.slice(0, length) });
  }
  function scanReadFailure(error, transfer) {
    error.scanFullRead_ = transfer.fullRead;
    error.scanBytes_ = transfer.transferredBytes;
    return error;
  }
  function artistChildren(id, name) {
    artistFolder(id);
    var query = quote(id) + " in parents and trashed = false and (" +
      ["image/jpeg", "image/png", "image/webp", "image/avif"].map(function (type) { return "mimeType = " + quote(type); }).join(" or ") + ")";
    if (name !== undefined) query += " and name = " + quote(name);
    return list(query, function (file) {
      if (artistImage(file, id) && (name === undefined || file.name === name)) {
        return artistWrap(validId(file.id), id, file);
      }
      return null;
    });
  }
  function artistWrap(id, folderId, initial) {
    var current = initial;
    var isFolder = folderId === undefined;
    function read(fresh) {
      if (fresh || !current) current = isFolder ? artistFolder(id) : artistFile(id, folderId);
      return current;
    }
    function readOnly() {
      throw failure("READ_ONLY_SOURCE", "Manage base photographs directly in Google Drive; this source reader cannot change them.");
    }
    function listImages(name) {
      if (!isFolder) throw artistFailure();
      return artistChildren(id, name);
    }
    return {
      getId: function () { return id; },
      getName: function () { return read().name; },
      getMimeType: function () { return read().mimeType; },
      getSize: function () { return Number(read().size || 0); },
      getUrl: function () { return isFolder ? "https://drive.google.com/drive/folders/" + id : "https://drive.google.com/file/d/" + id + "/view"; },
      getDateCreated: function () { return new Date(read().createdTime); },
      getLastUpdated: function () { return new Date(read().modifiedTime); },
      getSha256Checksum: function () { return checksum(read()); },
      isTrashed: function () { return read().trashed === true; },
      isParticipantPhoto: function () { return read().appProperties?.exposureRole === "participant"; },
      getScanFingerprint: function () {
        if (isFolder) throw artistFailure();
        artistFolder(folderId);
        var listed = read(), before = read(true);
        if (!sameArtistContent(listed, before)) throw artistFailure();
        var result = fingerprintFor(id, before);
        if (!result) return null;
        try {
          var after = read(true);
          artistFolder(folderId);
          if (!sameArtistContent(before, after)) throw artistFailure();
        } catch (error) {
          throw scanReadFailure(error, result);
        }
        return result;
      },
      getBlob: function () {
        if (isFolder) throw artistFailure();
        artistFolder(folderId);
        var before = read(true);
        var blob = blobFor(id, before);
        var after = read(true);
        artistFolder(folderId);
        if (!sameArtistContent(before, after)) {
          throw failure("BASE_UNAVAILABLE", "The base photograph changed while it was being read. Please retry.");
        }
        return blob;
      },
      getFiles: function () { return listImages(); },
      getFilesByName: listImages,
      getFoldersByName: function () { throw failure("UNSUPPORTED_SOURCE_OPERATION", "Only photographs directly inside the base-photo folder are listed."); },
      createFolder: readOnly,
      createFile: readOnly,
      markParticipantPhoto: readOnly,
      moveTo: readOnly
    };
  }
  function wrap(id) {
    return {
      getId: function () { return id; },
      getName: function () { return get(id).name; },
      getMimeType: function () { return get(id).mimeType; },
      getSize: function () { return Number(get(id).size || 0); },
      getUrl: function () { return get(id).mimeType === folderType ? "https://drive.google.com/drive/folders/" + id : "https://drive.google.com/file/d/" + id + "/view"; },
      getDateCreated: function () { return new Date(get(id).createdTime); },
      getLastUpdated: function () { return new Date(get(id).modifiedTime); },
      isTrashed: function () { return get(id).trashed === true; },
      isParticipantPhoto: function () { return get(id).appProperties?.exposureRole === "participant"; },
      getBlob: function () { return blobFor(id); },
      getFiles: function () { return children(id, false); },
      getFilesByName: function (name) { return children(id, false, name); },
      getFoldersByName: function (name) { return children(id, true, name); },
      createFolder: function (name) { return create(name, folderType, id); },
      createFile: function (blob) { return create(blob.getName(), blob.getContentType(), id, blob); },
      markParticipantPhoto: function (name) {
        var file = get(id);
        if (!/^image\/(jpeg|png|webp|avif)$/.test(file.mimeType) ||
            !/^participant_photo_[1-9][0-9]*\.(jpg|png|webp|avif)$/.test(name)) throw accessFailure();
        if (file.name === name && file.appProperties.exposureRole === "participant") return this;
        // Mark provenance before moving the same file into the source pool.
        // A later folder scan must never treat it as an artist-owned upload.
        remember(Drive.Files.update({ name: name, appProperties: Object.assign({}, file.appProperties, {
          exposureRole: "participant"
        }) }, id, null, { fields: fields }));
        return this;
      },
      moveTo: function (folder) {
        var target = validId(folder.getId());
        if (get(target).mimeType !== folderType) throw accessFailure();
        var file = get(id), parents = file.parents || [];
        if (parents.length === 1 && parents[0] === target) return this;
        var options = { fields: fields, addParents: target };
        if (parents.length) options.removeParents = parents.join(",");
        remember(Drive.Files.update({}, id, null, options));
        return this;
      }
    };
  }
  return Object.freeze({
    reset: function () { metadata = Object.create(null); },
    createFolder: function (name) { return create(name, folderType); },
    getFolderById: function (id) { if (get(id).mimeType !== folderType) throw accessFailure(); return wrap(id); },
    getFileById: function (id) { if (get(id).mimeType === folderType) throw accessFailure(); return wrap(id); },
    getArtistFolderById: function (id) { return artistWrap(id, undefined, artistFolder(id)); },
    getArtistFileById: function (id, folderId) {
      artistFolder(folderId);
      return artistWrap(id, folderId, artistFile(id, folderId));
    },
    markCreatedSpreadsheet: function (id) {
      validId(id);
      // Called only immediately after Sheets.Spreadsheets.create returned this ID.
      var file = remember(Drive.Files.update({ appProperties: { exposureArchive: marker } }, id, null, { fields: fields }));
      if (file.mimeType !== sheetType) throw accessFailure();
    }
  });
})();

var ArchiveSheets = (function () {
  var books = Object.create(null), rows = Object.create(null);
  var sheetType = "application/vnd.google-apps.spreadsheet";
  function open(id) {
    if (ArchiveDrive.getFileById(id).getMimeType() !== sheetType) throw new Error("The archive index is not a spreadsheet.");
    return book(id);
  }
  function details(id) {
    if (!books[id]) books[id] = Sheets.Spreadsheets.get(id, { fields: "spreadsheetId,sheets(properties(sheetId,title,gridProperties))" });
    return books[id];
  }
  function quote(name) { return "'" + name.replace(/'/g, "''") + "'"; }
  function columnName(column) {
    var name = "";
    while (column > 0) { column--; name = String.fromCharCode(65 + column % 26) + name; column = Math.floor(column / 26); }
    return name;
  }
  function values(id, title) {
    var key = id + ":" + title;
    if (!rows[key]) rows[key] = Sheets.Spreadsheets.Values.get(id, quote(title), { valueRenderOption: "UNFORMATTED_VALUE" }).values || [];
    return rows[key];
  }
  function properties(id, title) {
    var item = (details(id).sheets || []).filter(function (sheet) { return sheet.properties.title === title; })[0];
    if (!item) throw new Error("The archive index sheet is missing.");
    return item.properties;
  }
  function grow(id, title, lastRow, lastColumn) {
    var current = properties(id, title), grid = current.gridProperties;
    if (lastRow <= grid.rowCount && lastColumn <= grid.columnCount) return;
    var expanded = { rowCount: Math.max(lastRow, grid.rowCount), columnCount: Math.max(lastColumn, grid.columnCount) };
    Sheets.Spreadsheets.batchUpdate({ requests: [{ updateSheetProperties: {
      properties: { sheetId: current.sheetId, gridProperties: expanded }, fields: "gridProperties(rowCount,columnCount)"
    } }] }, id);
    current.gridProperties = expanded;
  }
  function range(id, title, row, column, height, width) {
    if (![row, column, height, width].every(function (value) { return Number.isSafeInteger(value) && value > 0; })) throw new Error("The archive cell range is invalid.");
    var self = {
      getValues: function () {
        var source = values(id, title);
        return Array.from({ length: height }, function (_, y) {
          return Array.from({ length: width }, function (_, x) { return source[row + y - 1]?.[column + x - 1] ?? ""; });
        });
      },
      setValues: function (data) {
        if (!Array.isArray(data) || data.length !== height || data.some(function (line) {
          return !Array.isArray(line) || line.length !== width || line.some(function (value) {
            return !["string", "number", "boolean"].includes(typeof value) || typeof value === "number" && !Number.isFinite(value);
          });
        })) throw new Error("The archive row data is invalid.");
        var cached = values(id, title);
        grow(id, title, row + height - 1, column + width - 1);
        var a1 = quote(title) + "!" + columnName(column) + row + ":" + columnName(column + width - 1) + (row + height - 1);
        Sheets.Spreadsheets.Values.update({ values: data, majorDimension: "ROWS" }, id, a1, { valueInputOption: "RAW" });
        // Update local state only after the synchronous Google write succeeds.
        data.forEach(function (line, y) {
          cached[row + y - 1] = cached[row + y - 1] || [];
          line.forEach(function (value, x) { cached[row + y - 1][column + x - 1] = value; });
        });
        return self;
      },
      setNumberFormat: function (format) {
        // RAW writes already keep ISO dates and names literal instead of parsing.
        if (format !== "@") throw new Error("Only literal archive text formatting is supported.");
        return self;
      }
    };
    return self;
  }
  function sheet(id, title) {
    return {
      getName: function () { return title; },
      getLastRow: function () { return values(id, title).length; },
      getLastColumn: function () { return values(id, title).reduce(function (last, line) { return Math.max(last, (line || []).length); }, 0); },
      getRange: function (row, column, height, width) { return range(id, title, row, column, height === undefined ? 1 : height, width === undefined ? 1 : width); }
    };
  }
  function book(id) {
    return {
      getId: function () { return id; },
      getUrl: function () { return "https://docs.google.com/spreadsheets/d/" + id + "/edit"; },
      getSheetByName: function (title) {
        return (details(id).sheets || []).some(function (item) { return item.properties.title === title; }) ? sheet(id, title) : null;
      },
      insertSheet: function (title) {
        Sheets.Spreadsheets.batchUpdate({ requests: [{ addSheet: { properties: { title: title } } }] }, id);
        delete books[id];
        return sheet(id, title);
      }
    };
  }
  return Object.freeze({
    reset: function () { books = Object.create(null); rows = Object.create(null); },
    flush: function () { /* Advanced Sheets writes complete synchronously. */ },
    openById: open,
    create: function (name) {
      var created = Sheets.Spreadsheets.create({ properties: { title: name }, sheets: [{ properties: { title: "Sheet1" } }] });
      ArchiveDrive.markCreatedSpreadsheet(created.spreadsheetId);
      return open(created.spreadsheetId);
    }
  });
})();

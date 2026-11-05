/**
 * Standalone Apps Script project for the published schedule viewer.
 * Configure PUBLISHED_SCHEDULE_FOLDER_ID and PUBLISHED_SCHEDULE_SECRET in
 * this project's Script Properties. Do not add this file to the existing form bridge.
 */
function doPost(event) {
  try {
    const request = JSON.parse(event.postData.contents || "{}");
    const expectedSecret = PropertiesService.getScriptProperties().getProperty(
      "PUBLISHED_SCHEDULE_SECRET",
    );

    if (!expectedSecret || request.secret !== expectedSecret) {
      return jsonResponse({ state: "error" });
    }

    const folderId = PropertiesService.getScriptProperties().getProperty(
      "PUBLISHED_SCHEDULE_FOLDER_ID",
    );
    if (!folderId) return jsonResponse({ state: "error" });

    const files = DriveApp.getFolderById(folderId).getFiles();
    const currentFiles = [];
    while (files.hasNext() && currentFiles.length < 2) {
      currentFiles.push(files.next());
    }

    if (currentFiles.length === 0) return jsonResponse({ state: "empty" });
    if (currentFiles.length > 1) return jsonResponse({ state: "multiple" });

    const file = currentFiles[0];
    if (file.getMimeType() !== "application/pdf") {
      return jsonResponse({ state: "invalid_file" });
    }

    return jsonResponse({
      state: "available",
      fileName: file.getName(),
      viewerUrl: "https://drive.google.com/file/d/" + encodeURIComponent(file.getId()) + "/preview",
    });
  } catch {
    return jsonResponse({ state: "error" });
  }
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

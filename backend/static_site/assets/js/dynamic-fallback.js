(function () {
  var API_BASE = window.__CMS_API_BASE__;
  var LANG = window.__CMS_LANG__;

  if (!API_BASE || !LANG) return;

  function loadDynamicContent() {
    var detail = document.querySelector(".entry-detail");
    if (!detail) return;

    var entryId = detail.getAttribute("data-entry-id");
    var contentType = detail.getAttribute("data-content-type");
    if (!entryId || !contentType) return;

    var url =
      API_BASE +
      "/public/entries/" +
      contentType +
      "/by-id/" +
      entryId +
      "?language=" +
      LANG +
      "&all_languages=true";

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("API error: " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data.translation || !data.translation.title) return;

        window.__CMS_DYNAMIC_MODE__ = true;

        var notice = document.createElement("div");
        notice.className = "dynamic-notice";
        notice.textContent =
          "This page is being served dynamically because the static version is not available yet.";
        detail.parentNode.insertBefore(notice, detail);

        var h1 = detail.querySelector(".entry-header h1");
        if (h1) h1.textContent = data.translation.title;

        var fieldValues = data.translation.field_values || {};
        detail.querySelectorAll(".field-block").forEach(function (block) {
          var fieldName = block.getAttribute("data-field-name");
          if (fieldName && fieldValues[fieldName] !== undefined) {
            var valEl = block.querySelector(".field-value");
            if (valEl) {
              var val = fieldValues[fieldName];
              if (typeof val === "string") {
                valEl.textContent = val;
              } else {
                valEl.textContent = JSON.stringify(val);
              }
            }
          }
        });
      })
      .catch(function (err) {
        console.warn("Dynamic fallback failed:", err);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadDynamicContent);
  } else {
    loadDynamicContent();
  }
})();

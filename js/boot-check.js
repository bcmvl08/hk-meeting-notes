window.setTimeout(function () {
  if (window.__NOTES_BOOTED) return;
  var el = document.getElementById("boot-error");
  if (el) el.hidden = false;
}, 1500);

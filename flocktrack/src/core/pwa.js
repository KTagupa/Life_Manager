(function() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (window.location.protocol === "file:") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", {
      scope: "./"
    }).catch(err => {
      console.error("FlockTrack offline support could not be enabled.", err);
    });
  });
})();

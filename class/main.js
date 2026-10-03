/* 화면 전환: #/center… 는 강사센터·마스터(admin.js), 나머지는 수강생 센터(app.js) */
(function () {
  "use strict";
  DB.load();
  let mode = null;
  function go() {
    const next = /^#\/center/.test(location.hash) ? "admin" : "student";
    const changed = next !== mode;
    mode = next;
    document.body.dataset.mode = next;
    document.getElementById("modal-root").innerHTML = "";
    const app = next === "admin" ? window.AdminApp : window.StudentApp;
    if (changed) app.mount(); else app.render();
  }
  window.addEventListener("hashchange", go);
  // 다른 탭(예: 강사센터 탭)에서 바뀐 내용을 이 탭에도 반영
  window.addEventListener("storage", (e) => {
    if (e.key && e.key.indexOf("moonclass:db") === 0) { DB.load(); go(); }
  });
  go();
})();

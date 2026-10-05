"use strict";
/* JSON 파일 저장소. 데이터는 메모리에 두고 바뀔 때마다 data/db.json 에 원자적으로(임시 파일 → 이름 바꾸기) 저장한다.
   사용자 수천 명 규모까지는 충분하고, 커지면 같은 모양 그대로 SQLite/Postgres 로 옮기면 된다. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const EMPTY = () => ({
  users: [],
  sessions: {},
  campaigns: [],
  replies: [],      // 댓글 처리 기록 (답글·인증코드)
  submissions: [],  // 신청 폼 접수
  emails: [],       // 보낸 메일 (미리보기 포함)
  newVideos: [],    // 새 영상 감지 기록
  demoVideos: [],   // 데모 모드 가상 영상
  demoComments: [], // 데모 모드 가상 댓글
  meta: {},
});

function createDb(file) {
  let data = EMPTY();
  if (file && fs.existsSync(file)) data = Object.assign(EMPTY(), JSON.parse(fs.readFileSync(file, "utf8")));
  let timer = null;

  function flush() {
    clearTimeout(timer);
    timer = null;
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  }
  function save() {
    if (!file || timer) return;
    timer = setTimeout(flush, 150);
  }
  const id = () => crypto.randomBytes(8).toString("hex");
  return { data, save, flush, id };
}

module.exports = { createDb };

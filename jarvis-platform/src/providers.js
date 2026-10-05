"use strict";
/* 유튜브 제공자 두 가지. 엔진은 어느 쪽인지 모르고 같은 함수만 부른다.
   - live: YouTube Data API v3 (사용자가 연결한 구글 계정의 채널)
   - demo: 플랫폼 안의 가상 유튜브 (구글 연결 없이 전체 흐름을 시험) */

function createLiveProvider({ getToken, fetchImpl = fetch, apiBase = "https://www.googleapis.com/youtube/v3" }) {
  async function api(method, path, params, body) {
    const token = await getToken();
    const url = `${apiBase}/${path}?${new URLSearchParams(params)}`;
    const res = await fetchImpl(url, {
      method,
      headers: Object.assign({ authorization: `Bearer ${token}` }, body ? { "content-type": "application/json" } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = json.error && json.error.errors && json.error.errors[0] && json.error.errors[0].reason;
      const err = new Error(`YouTube API 오류 (${res.status}${reason ? ` ${reason}` : ""}): ${(json.error && json.error.message) || ""}`);
      err.reason = reason || "";
      err.quota = /quota/i.test(reason || "");
      throw err;
    }
    return json;
  }

  return {
    kind: "live",
    async myChannel() {
      const r = await api("GET", "channels", { part: "snippet,contentDetails", mine: "true" });
      const ch = (r.items || [])[0];
      if (!ch) throw new Error("연결한 구글 계정에 유튜브 채널이 없습니다");
      return { id: ch.id, title: ch.snippet.title, uploads: ch.contentDetails.relatedPlaylists.uploads };
    },
    /** 최신 댓글부터. source = { channelId } 또는 { videoId } */
    async listThreads(source, pageToken) {
      const params = { part: "snippet", order: "time", maxResults: "100", textFormat: "plainText" };
      if (source.videoId) params.videoId = source.videoId;
      else params.allThreadsRelatedToChannelId = source.channelId;
      if (pageToken) params.pageToken = pageToken;
      const r = await api("GET", "commentThreads", params);
      return {
        nextPageToken: r.nextPageToken || "",
        items: (r.items || []).map(t => {
          const c = t.snippet.topLevelComment.snippet;
          return {
            id: t.id,
            videoId: t.snippet.videoId || c.videoId || "",
            text: c.textDisplay || "",
            author: c.authorDisplayName || "",
            authorChannelId: (c.authorChannelId && c.authorChannelId.value) || "",
            publishedAt: c.publishedAt,
          };
        }),
      };
    },
    async reply(threadId, text) {
      await api("POST", "comments", { part: "snippet" }, { snippet: { parentId: threadId, textOriginal: text } });
    },
    async postComment(videoId, text) {
      await api("POST", "commentThreads", { part: "snippet" }, { snippet: { videoId, topLevelComment: { snippet: { textOriginal: text } } } });
    },
    async recentUploads(uploadsPlaylistId) {
      const p = await api("GET", "playlistItems", { part: "contentDetails", playlistId: uploadsPlaylistId, maxResults: "10" });
      const ids = (p.items || []).map(i => i.contentDetails.videoId).filter(Boolean);
      if (!ids.length) return [];
      const v = await api("GET", "videos", { part: "snippet,status", id: ids.join(",") });
      return (v.items || []).map(x => ({ id: x.id, title: x.snippet.title, publishedAt: x.snippet.publishedAt, isPublic: x.status.privacyStatus === "public" }));
    },
    async videoTitle(videoId) {
      const v = await api("GET", "videos", { part: "snippet", id: videoId });
      return v.items && v.items[0] ? v.items[0].snippet.title : "";
    },
  };
}

function createDemoProvider(db, user) {
  const data = db.data;
  const channelId = `DEMO_${user.id}`;
  const title = `${user.username} 데모 채널`;
  const mine = list => list.filter(x => x.userId === user.id);

  return {
    kind: "demo",
    async myChannel() {
      return { id: channelId, title, uploads: "demo" };
    },
    async listThreads(source) {
      const items = mine(data.demoComments)
        .filter(c => !c.parentId && (source.videoId ? c.videoId === source.videoId : true))
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        .map(c => ({ id: c.id, videoId: c.videoId, text: c.text, author: c.author, authorChannelId: c.authorChannelId, publishedAt: c.publishedAt }));
      return { items, nextPageToken: "" };
    },
    async reply(threadId, text) {
      const parent = data.demoComments.find(c => c.id === threadId && c.userId === user.id);
      if (!parent) throw new Error("댓글을 찾을 수 없습니다");
      data.demoComments.push({ id: db.id(), userId: user.id, videoId: parent.videoId, parentId: threadId, text, author: title, authorChannelId: channelId, publishedAt: new Date().toISOString() });
      db.save();
    },
    async postComment(videoId, text) {
      data.demoComments.push({ id: db.id(), userId: user.id, videoId, text, author: title, authorChannelId: channelId, publishedAt: new Date().toISOString(), pinnedNotice: true });
      db.save();
    },
    async recentUploads() {
      return mine(data.demoVideos).map(v => ({ id: v.id, title: v.title, publishedAt: v.publishedAt, isPublic: true }));
    },
    async videoTitle(videoId) {
      const v = mine(data.demoVideos).find(x => x.id === videoId);
      return v ? v.title : "";
    },
  };
}

module.exports = { createLiveProvider, createDemoProvider };

"""Episode config + derived output timeline, shared by render / music / mix."""
import json

FPS = 30
REWIND = 0.3        # rewind transition into the replay
DIARY = 3.2         # "오늘의 승유" diary card
SUBSCRIBE = 2.6     # channel / subscribe card


def snap(t):
    return round(t * FPS) / FPS


class Episode:
    def __init__(self, path):
        self.cfg = c = json.load(open(path))
        self.main_end = snap(c["src_duration"])
        t = self.main_end + REWIND
        self.replay = []                      # (out_start, out_end, src_start, src_end, text)
        for a, b, text in c["replay"]:
            a, b = snap(a), snap(b)
            self.replay.append((t, t + (b - a), a, b, text))
            t += b - a
        self.replay_end = t
        self.diary = (t, t + DIARY)
        self.subscribe = (t + DIARY, t + DIARY + SUBSCRIBE)
        self.total = self.subscribe[1]
        self.total_frames = int(round(self.total * FPS))

    def __getitem__(self, k):
        return self.cfg[k]

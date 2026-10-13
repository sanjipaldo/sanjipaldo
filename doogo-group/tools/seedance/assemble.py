#!/usr/bin/env python3
"""Seedance 2.0로 생성한 11개 장면 클립을 홈페이지 영상으로 편집해 교체합니다.

준비: tools/seedance/clips/ 에 S01.mp4 ~ S11.mp4 (shots.json 의 id 이름) 를 넣습니다.
실행: python3 tools/seedance/assemble.py [--film-audio 음악또는내레이션.mp3]

만드는 파일 (assets/video/ — 같은 이름으로 덮어써서 HTML 수정 없이 바로 바뀝니다)
  hero-loop.mp4 + hero-poster.webp   메인 첫 화면 배경 (26초, 무음, 구간 경계 시간 유지)
  group-film.mp4 + group-film-poster.webp + group-film.ko.vtt   '그룹 영상 보기' (자막 시간 자동 계산)
  biz-{사업}.mp4 + biz-{사업}.webp     사업별 반복 영상 7개
필요: ffmpeg, ffprobe, Python 3 + Pillow
"""
import argparse, json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
VIDEO = os.path.join(ROOT, 'assets', 'video')
XF = 0.4  # 장면 사이 크로스페이드(초)


def run(cmd):
    subprocess.run(cmd, check=True)


def duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                         check=True, capture_output=True, text=True).stdout.strip()
    return float(out)


def height(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=height', '-of', 'csv=p=0', path],
                         check=True, capture_output=True, text=True).stdout.strip()
    return int(out)


def xfade_chain(parts, out, size, crf=23, audio=None):
    """parts: [(path, start, length)] — 순서대로 XF초 크로스페이드로 잇습니다."""
    w, h = size
    cmd = ['ffmpeg', '-y', '-loglevel', 'error']
    for p, ss, ln in parts:
        cmd += ['-ss', f'{ss:.3f}', '-t', f'{ln:.3f}', '-i', p]
    if audio:
        cmd += ['-i', audio]
    f = []
    for i in range(len(parts)):
        f.append(f'[{i}:v]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},fps=30,format=yuv420p,setsar=1,settb=AVTB[v{i}]')
    acc, acc_len = 'v0', parts[0][2]
    for i in range(1, len(parts)):
        off = acc_len - XF
        f.append(f'[{acc}][v{i}]xfade=transition=fade:duration={XF}:offset={off:.3f}[x{i}]')
        acc, acc_len = f'x{i}', acc_len + parts[i][2] - XF
    cmd += ['-filter_complex', ';'.join(f), '-map', f'[{acc}]']
    if audio:
        cmd += ['-map', f'{len(parts)}:a', '-c:a', 'aac', '-b:a', '160k', '-shortest']
    else:
        cmd += ['-an']
    cmd += ['-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]
    run(cmd)
    return acc_len


def poster(video, out, t=0.0):
    tmp = out + '.png'
    run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{t:.2f}', '-i', video, '-frames:v', '1', tmp])
    from PIL import Image
    Image.open(tmp).convert('RGB').save(out, quality=82)
    os.remove(tmp)


def vtt_time(s):
    m, s = divmod(s, 60)
    return f'{int(m):02d}:{s:06.3f}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--clips', default=os.path.join(HERE, 'clips'))
    ap.add_argument('--film-audio', default=None)
    a = ap.parse_args()
    spec = json.load(open(os.path.join(HERE, 'shots.json'), encoding='utf-8'))
    shots = {s['id']: s for s in spec['shots']}
    clip = lambda sid: os.path.join(a.clips, f'{sid}.mp4')
    missing = [sid for sid in shots if not os.path.exists(clip(sid))]
    if missing:
        sys.exit('클립이 없습니다: ' + ', '.join(missing) + f'  (폴더: {a.clips})')
    hi = min(height(clip(sid)) for sid in shots)
    size = (1920, 1080) if hi >= 1080 else (1280, 720)
    print('출력 해상도', size)

    # 1) 메인 배경: 구간 경계 시간이 shots.json 과 정확히 같도록 앞뒤 XF/2 만큼 겹쳐서 자릅니다.
    segs = spec['edit']['hero_loop']['segments']
    parts = []
    for i, sg in enumerate(segs):
        ln = (sg['end'] - sg['start']) + (XF / 2 if i > 0 else 0) + (XF / 2 if i < len(segs) - 1 else 0)
        src = clip(sg['shot'])
        ss = max(0.0, min(0.4, duration(src) - ln))
        parts.append((src, ss, ln))
    hero = os.path.join(VIDEO, 'hero-loop.mp4')
    total = xfade_chain(parts, hero, size, crf=24)
    poster(hero, os.path.join(VIDEO, 'hero-poster.webp'), 0.1)
    print(f'✓ hero-loop.mp4 ({total:.1f}s)')

    # 2) 전체 그룹 영상 + 자막
    ids = spec['edit']['film']['shots']
    parts = [(clip(sid), 0.0, duration(clip(sid))) for sid in ids]
    film = os.path.join(VIDEO, 'group-film.mp4')
    total = xfade_chain(parts, film, size, crf=24, audio=a.film_audio)
    lines, t = ['WEBVTT', ''], 0.0
    for i, (sid, (_, _, ln)) in enumerate(zip(ids, parts)):
        start = t + (XF if i else 0) + 0.2
        end = t + ln - 0.2
        lines += [f'{vtt_time(start)} --> {vtt_time(end)}', shots[sid]['narration'], '']
        t += ln - XF
    open(os.path.join(VIDEO, 'group-film.ko.vtt'), 'w', encoding='utf-8').write('\n'.join(lines))
    poster(film, os.path.join(VIDEO, 'group-film-poster.webp'), min(19.0, total / 2))
    print(f'✓ group-film.mp4 ({total:.1f}s) + 자막')

    # 3) 사업별 반복 영상: 정방향 + 역방향(핑퐁)으로 끊김 없이 반복
    for slug, sid in spec['edit']['biz_loops'].items():
        out = os.path.join(VIDEO, f'biz-{slug}.mp4')
        run(['ffmpeg', '-y', '-loglevel', 'error', '-i', clip(sid), '-filter_complex',
             f'[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=30,format=yuv420p,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]',
             '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out])
        poster(out, os.path.join(VIDEO, f'biz-{slug}.webp'), 0.1)
        print(f'✓ biz-{slug}.mp4')
    print('완료 — 브라우저에서 새로고침(캐시 비우기)으로 확인하세요.')


if __name__ == '__main__':
    main()

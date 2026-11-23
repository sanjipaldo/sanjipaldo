import { loadFont } from "@remotion/fonts";
import { AbsoluteFill, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

// 한글 폰트: youtube/setup.sh 가 public/fonts 에 Pretendard 를 채운다
loadFont({ family: "Pretendard", url: staticFile("fonts/Pretendard-Black.woff2"), weight: "900" });

export const KoreanTest: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - 8, fps, config: { damping: 14 } });
  const bar = interpolate(frame, [20, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, #2B1416, #0A0A0B 70%)", justifyContent: "center", alignItems: "center", fontFamily: "Pretendard" }}>
      <div style={{ transform: `scale(${0.85 + 0.15 * pop})`, opacity: pop, textAlign: "center", color: "#fff", fontWeight: 900, fontSize: 96, lineHeight: 1.15, letterSpacing: -2 }}>
        두고보는 문대표
        <div style={{ color: "#FF3B3B" }}>Remotion 테스트</div>
      </div>
      <div style={{ marginTop: 40, width: 120 * bar, height: 10, borderRadius: 5, background: "#FF3B3B" }} />
    </AbsoluteFill>
  );
};

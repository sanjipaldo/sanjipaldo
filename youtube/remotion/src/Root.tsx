import { Composition } from "remotion";
import { KoreanTest } from "./KoreanTest";

export const RemotionRoot: React.FC = () => (
  <Composition id="KoreanTest" component={KoreanTest} durationInFrames={90} fps={30} width={1080} height={1920} />
);

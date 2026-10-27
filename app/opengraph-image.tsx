import { ImageResponse } from "next/og";
export const alt =
  "DubbingNow — AI dubbing online for clear, single-speaker recordings.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px",
        background: "#fbfaf6",
        color: "#24362e",
      }}
    >
      <div style={{ display: "flex", fontSize: 28, marginBottom: 65 }}>
        dubbingnow<span style={{ color: "#db7956" }}>.</span>
      </div>
      <div style={{ fontSize: 90, display: "flex", letterSpacing: "-5px" }}>
        AI Dubbing Online.
      </div>
      <div style={{ fontSize: 29, color: "#748167", marginTop: 25 }}>
        One clear voice. A whole new audience.
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 65,
          fontSize: 20,
          color: "#db7956",
        }}
      >
        YOUR STORY, WITHOUT BORDERS
      </div>
    </div>,
    size,
  );
}

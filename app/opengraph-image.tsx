import { ImageResponse } from "next/og";

export const alt = "FlashReels splash preview";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#101113",
          color: "#f6f1e8",
          fontFamily: "Arial, sans-serif",
          padding: 64,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            border: "2px solid rgba(246, 241, 232, 0.16)",
            borderRadius: 32,
            overflow: "hidden",
            background: "#17191d",
          }}
        >
          <div
            style={{
              width: 390,
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#f6f1e8",
            }}
          >
            <div
              style={{
                width: 230,
                height: 230,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                background: "#ff4f38",
              }}
            >
              <div
                style={{
                  width: 0,
                  height: 0,
                  marginLeft: 18,
                  borderTop: "52px solid transparent",
                  borderBottom: "52px solid transparent",
                  borderLeft: "82px solid #f6f1e8",
                }}
              />
            </div>
          </div>
          <div
            style={{
              flex: 1,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "70px 76px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              <div
                style={{
                  display: "flex",
                  color: "#ff4f38",
                  fontSize: 32,
                  fontWeight: 700,
                  letterSpacing: 0,
                }}
              >
                FlashReels
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 78,
                  fontWeight: 800,
                  lineHeight: 0.96,
                  letterSpacing: 0,
                }}
              >
                Step-aware reels, ready to publish.
              </div>
            </div>
            <div
              style={{
                display: "flex",
                maxWidth: 610,
                color: "#c9c1b4",
                fontSize: 30,
                lineHeight: 1.28,
                letterSpacing: 0,
              }}
            >
              RunwayML-powered image-list-to-video creation with review, library, and public playback in one workspace.
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

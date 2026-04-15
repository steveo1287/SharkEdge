import { ImageResponse } from "next/og";

import { brandKit } from "@/lib/brand/brand-kit";

export const size = {
  width: 64,
  height: 64
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background:
            "radial-gradient(circle at top right, rgba(55, 150, 255, 0.34), transparent 34%), linear-gradient(180deg, #04070d 0%, #08101b 48%, #0b1521 100%)",
          border: "2px solid rgba(198, 165, 91, 0.9)",
          borderRadius: 18,
          display: "flex",
          height: "100%",
          justifyContent: "center",
          position: "relative",
          width: "100%"
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 4,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.08)",
            background:
              "linear-gradient(135deg, rgba(55, 150, 255, 0.24), rgba(4, 7, 13, 0.95) 55%)"
          }}
        />
        <div
          style={{
            position: "relative",
            color: "white",
            display: "flex",
            fontFamily: "sans-serif",
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: "-0.06em"
          }}
        >
          {brandKit.shortName}
        </div>
      </div>
    ),
    size
  );
}

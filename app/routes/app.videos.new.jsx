// This route is no longer used — import modal is in app.videos.jsx
// Kept as empty component to avoid 404
export default function NewVideo() {
  if (typeof window !== "undefined") {
    window.location.href = "/app/videos";
  }
  return null;
}
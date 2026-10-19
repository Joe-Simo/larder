import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Larder demo video",
  description: "A 1 minute 37 second walkthrough of Larder running live.",
};

export default function DemoPage() {
  return (
    <main className="mx-auto w-full max-w-[960px] flex-1 px-5 pb-20 pt-12 sm:pt-16">
      <Link href="/" className="text-sm text-mute hover:text-ink">&larr; Larder</Link>
      <h1 className="mt-4 text-[28px] font-semibold leading-[1.15] tracking-tight sm:text-[36px]">Larder demo</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-mute">1:37. A full household session in the simulated Alexa+, run on the live site.</p>
      <video
        className="mt-6 aspect-video w-full rounded-2xl border border-line bg-panel"
        src="/demo.mp4"
        poster="/demo-poster.jpg"
        controls
        playsInline
        preload="metadata"
      >
        <a href="/demo.mp4">Download the video (MP4)</a>
      </video>
      <p className="mt-4 text-sm text-mute">
        <a className="underline decoration-line underline-offset-4 hover:text-ink" href="/demo.mp4">Open the MP4 directly</a>
        . Narration is a synthetic voice (Piper TTS, LJ Speech).
      </p>
    </main>
  );
}

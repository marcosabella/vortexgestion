import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import fs from "node:fs";

const dir = "public/video-promocional";
const output = `${dir}/VORTEX_Video_Promocional_Instagram.mp4`;
const durations = [5, 9, 9, 9, 9, 9, 9];
const args = ["-y"];

durations.forEach((duration, index) => {
  args.push("-i", `${dir}/slide-${String(index + 1).padStart(2, "0")}.png`);
});
args.push("-i", `${dir}/voz-argentina.mp3`);

const filters = durations.map((duration, index) => {
  return `[${index}:v]loop=loop=-1:size=1:start=0,trim=duration=${duration},setpts=PTS-STARTPTS,scale=1080:1920,fps=30,fade=t=in:st=0:d=0.35,fade=t=out:st=${Math.max(0, duration - 0.35)}:d=0.35[v${index}]`;
});
filters.push(`${durations.map((_, index) => `[v${index}]`).join("")}concat=n=${durations.length}:v=1:a=0[v]`);

args.push(
  "-filter_complex", filters.join(";"),
  "-map", "[v]", "-map", "7:a",
  "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "160k", "-ar", "44100",
  "-movflags", "+faststart", "-shortest", output,
);

const result = spawnSync(ffmpegPath, args, { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
const sizeMb = (fs.statSync(output).size / 1024 / 1024).toFixed(1);
console.log(`Video generado: ${output} (${sizeMb} MB)`);

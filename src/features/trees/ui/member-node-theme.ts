import type { Gender } from "@/features/members";

export type MemberNodeTheme = ReturnType<typeof memberNodeTheme>;

export function memberNodeTheme(gender: Gender) {
  if (gender === "male")
    return {
      ring: "ring-sky-400/60",
      strip: "from-sky-500 via-sky-400 to-cyan-400",
      avatarBg: "bg-gradient-to-br from-sky-500 to-cyan-400",
      handle: "!border-sky-500 !bg-card",
      border: "border-sky-200/70 dark:border-sky-500/30",
    };
  if (gender === "female")
    return {
      ring: "ring-pink-400/60",
      strip: "from-pink-500 via-rose-400 to-fuchsia-400",
      avatarBg: "bg-gradient-to-br from-pink-500 to-fuchsia-400",
      handle: "!border-pink-500 !bg-card",
      border: "border-pink-200/70 dark:border-pink-500/30",
    };
  return {
    ring: "ring-slate-400/60",
    strip: "from-slate-500 via-slate-400 to-zinc-400",
    avatarBg: "bg-gradient-to-br from-slate-500 to-zinc-400",
    handle: "!border-slate-500 !bg-card",
    border: "border-slate-200/70 dark:border-slate-500/30",
  };
}

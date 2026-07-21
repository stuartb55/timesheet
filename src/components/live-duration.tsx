"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/domain/time";

export function LiveDuration({ startedAt }: { startedAt: string }) {
  const [minutes, setMinutes] = useState(() => elapsedMinutes(startedAt));
  useEffect(() => {
    const timer = window.setInterval(
      () => setMinutes(elapsedMinutes(startedAt)),
      30_000,
    );
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return <span>{formatDuration(minutes)}</span>;
}

function elapsedMinutes(startedAt: string): number {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000),
  );
}

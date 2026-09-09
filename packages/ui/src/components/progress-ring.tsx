import * as React from "react";
import { cn } from "cn";

/**
 * SVG ring for the focus timer and completion ratios. Pure geometry: it owns
 * no timing and no state. The ring is an accessible progressbar; `children`
 * render inside it (the remaining time, a percentage).
 */
function ProgressRing({
  value,
  max = 100,
  size = 160,
  strokeWidth = 8,
  label,
  children,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  label: string;
  children?: React.ReactNode;
}) {
  const clamped = Math.min(Math.max(value, 0), max);
  const fraction = max === 0 ? 0 : clamped / max;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      data-slot="progress-ring"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={clamped}
      aria-label={label}
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      {...props}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: "stroke-dashoffset var(--duration-base) var(--ease-standard)",
          }}
        />
      </svg>
      {children ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export { ProgressRing };

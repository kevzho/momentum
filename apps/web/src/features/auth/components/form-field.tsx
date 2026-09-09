import { Input } from "@momentum/ui/components/input";
import { Label } from "@momentum/ui/components/label";

// Errors live inside the `aria-describedby` target and the input carries
// `aria-invalid`, so state is never signalled by colour alone.
export function FormField({
  name,
  label,
  errors,
  hint,
  ...props
}: React.ComponentProps<typeof Input> & {
  name: string;
  label: string;
  errors?: string[];
  hint?: string;
}) {
  const describedBy = [errors?.length ? `${name}-error` : null, hint ? `${name}-hint` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...props}
      />
      {hint ? (
        <p id={`${name}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {errors?.length ? (
        <p id={`${name}-error`} className="text-xs text-destructive">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

/** Form-level feedback. Focusable by script, not Tab, for `useResultFocus`. */
export function FormMessage({
  tone,
  children,
  ref,
}: {
  tone: "error" | "info";
  children: React.ReactNode;
  ref?: React.Ref<HTMLParagraphElement>;
}) {
  return (
    <p
      ref={ref}
      tabIndex={-1}
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          : "rounded-lg border bg-muted px-3 py-2 text-sm text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      }
    >
      {children}
    </p>
  );
}

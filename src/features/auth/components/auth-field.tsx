import { Label } from "@/shared/ui/label";

export function AuthField({
  label,
  icon,
  children,
}: {
  label?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <div className="relative">
        {icon && (
          <span className="absolute inset-s-3 top-2.5 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-muted-foreground">
            {icon}
          </span>
        )}
        <div className={icon ? "[&_input]:ps-9" : ""}>{children}</div>
      </div>
    </div>
  );
}

export function GoogleMark() {
  return (
    <svg className="me-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.4a4.6 4.6 0 0 1-2 3v2.7h3.5c2-1.9 3.2-4.6 3.2-7.7Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.9 0 5.3-1 7-2.6l-3.5-2.7c-1 .7-2.2 1-3.5 1a6.2 6.2 0 0 1-5.8-4.3H2.6v2.8A10 10 0 0 0 12 22Z"
      />
      <path fill="#FBBC05" d="M6.2 13.4a6 6 0 0 1 0-3.8V6.8H2.6a10 10 0 0 0 0 9.4l3.6-2.8Z" />
      <path
        fill="#EA4335"
        d="M12 6.2c1.6 0 3 .5 4.1 1.6l3.1-3A10 10 0 0 0 2.6 6.7l3.6 2.8A6.2 6.2 0 0 1 12 6.2Z"
      />
    </svg>
  );
}

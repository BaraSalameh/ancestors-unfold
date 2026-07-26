import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { cn } from "@/shared/utils/cn";

type PasswordInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  showLabel: string;
  hideLabel: string;
  wrapperClassName?: string;
};

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, wrapperClassName, showLabel, hideLabel, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    const label = visible ? hideLabel : showLabel;

    return (
      <div className={cn("relative", wrapperClassName)}>
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn("pe-10", className)}
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute inset-e-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
          aria-label={label}
          title={label}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };

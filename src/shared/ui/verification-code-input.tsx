import { InputOTP, InputOTPGroup, InputOTPSlot } from "./input-otp";
import { normalizeVerificationCode } from "./verification-code-value";

export function VerificationCodeInput({
  id,
  value,
  onChange,
  disabled,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  return (
    <div dir="ltr">
      <InputOTP
        id={id}
        maxLength={6}
        value={value}
        onChange={(nextValue) => onChange(normalizeVerificationCode(nextValue))}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        disabled={disabled}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
      >
        <InputOTPGroup>
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <InputOTPSlot key={index} index={index} data-slot="verification-code-slot" />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}

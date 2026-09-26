import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from 'input-otp';
import { type ReactNode, useRef } from 'react';
import { useReplay } from '../components/useReplay';

export const codeLength = 8;

function Slot({ char, isActive, hasFakeCaret }: SlotProps): ReactNode {
  return (
    <span className={isActive ? 'otp-slot active' : 'otp-slot'}>
      {char}
      {hasFakeCaret && <span className="otp-caret" />}
    </span>
  );
}

interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  error: string;
  attempt: number;
}

export function CodeInput({ value, onChange, error, attempt }: CodeInputProps): ReactNode {
  const field = useRef<HTMLDivElement>(null);
  useReplay(field, error ? `${attempt}` : '');
  return (
    <div className="otp" ref={field}>
      <OTPInput
        id="code"
        name="code"
        maxLength={codeLength}
        pattern={REGEXP_ONLY_DIGITS}
        pasteTransformer={pasted => pasted.replace(/\D/g, '')}
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="go"
        spellCheck={false}
        value={value}
        onChange={onChange}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'code-error' : undefined}
        containerClassName="otp-slots"
        render={({ slots }) => (
          <>
            <span className="otp-group">
              {slots.slice(0, codeLength / 2).map((slot, index) => (
                <Slot key={index} {...slot} />
              ))}
            </span>
            <span className="otp-separator" />
            <span className="otp-group">
              {slots.slice(codeLength / 2).map((slot, index) => (
                <Slot key={index} {...slot} />
              ))}
            </span>
          </>
        )}
      />
    </div>
  );
}

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { announce } from '../announce';

interface Question {
  text: string;
  confirmLabel: string;
  opener: string | undefined;
  resolve: (confirmed: boolean) => void;
}

interface Feedback {
  flash: (text: string) => void;
  confirm: (text: string, confirmLabel: string) => Promise<boolean>;
}

const FeedbackContext = createContext<Feedback | null>(null);
const noticeDuration = 6000;

export function useFeedback(): Feedback {
  const feedback = useContext(FeedbackContext);
  if (!feedback) throw new Error('useFeedback needs a FeedbackProvider');
  return feedback;
}

export function FeedbackProvider({ children }: { children: ReactNode }): ReactNode {
  const [notice, setNotice] = useState('');
  const [question, setQuestion] = useState<Question | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dialog = useRef<HTMLDialogElement>(null);

  const flash = useCallback((text: string) => {
    setNotice(text);
    announce(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), noticeDuration);
  }, []);

  const confirm = useCallback(
    (text: string, confirmLabel: string) =>
      new Promise<boolean>(resolve => {
        const active = document.activeElement;
        const opener = active instanceof HTMLElement ? active.dataset.key : undefined;
        setQuestion({ text, confirmLabel, opener, resolve });
      }),
    [],
  );

  useEffect(() => {
    if (question) dialog.current?.showModal();
  }, [question]);

  function close(): void {
    const current = question;
    if (!current || !dialog.current) return;
    setQuestion(null);
    current.resolve(dialog.current.returnValue === 'confirm');
    const { opener } = current;
    requestAnimationFrame(() => {
      if (opener && document.activeElement === document.body)
        document.querySelector<HTMLElement>(`[data-key="${opener}"]`)?.focus();
    });
  }

  const value = useMemo(() => ({ flash, confirm }), [flash, confirm]);

  return (
    <FeedbackContext value={value}>
      {children}
      {notice && (
        <p className="notice enter" key={notice}>
          {notice}
        </p>
      )}
      {question && (
        <dialog className="ask" aria-labelledby="ask-question" ref={dialog} onClose={close}>
          <form method="dialog">
            <p id="ask-question">{question.text}</p>
            <div className="row">
              <button className="button" value="cancel">
                Cancel
              </button>
              <button className="button primary" value="confirm">
                {question.confirmLabel}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </FeedbackContext>
  );
}

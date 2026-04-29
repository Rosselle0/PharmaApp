"use client";

type Props = {
  className?: string;
  title?: string;
  confirmMessage: string;
  children: React.ReactNode;
};

export default function ConfirmSubmitButton({ className, title, confirmMessage, children }: Props) {
  return (
    <button
      className={className}
      type="submit"
      title={title}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}


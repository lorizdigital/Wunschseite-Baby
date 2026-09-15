"use client";

import { useState, type InputHTMLAttributes } from "react";

function VisibilityIcon({ visible }: { visible: boolean }) {
  return visible
    ? <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10.7 6.2A9.6 9.6 0 0 1 12 6.1c4.6 0 7.8 3.4 9 5.4a1 1 0 0 1 0 1c-.5.9-1.5 2.2-2.9 3.3M6.5 7.7C4.7 8.9 3.5 10.5 3 11.5a1 1 0 0 0 0 1c1.2 2 4.4 5.4 9 5.4 1.4 0 2.6-.3 3.7-.8" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M4 4l16 16" /></svg>
    : <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 11.5a1 1 0 0 0 0 1c1.2 2 4.4 5.4 9 5.4s7.8-3.4 9-5.4a1 1 0 0 0 0-1c-1.2-2-4.4-5.4-9-5.4S4.2 9.5 3 11.5Z" /><circle cx="12" cy="12" r="2.8" /></svg>;
}

export function SecretInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return <div className="secret-input">
    <input {...props} type={visible ? "text" : "password"} />
    <button className="secret-visibility-button" type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? "Zugangscode verbergen" : "Zugangscode anzeigen"} aria-pressed={visible} disabled={props.disabled}>
      <VisibilityIcon visible={visible} />
    </button>
  </div>;
}

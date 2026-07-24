"use client";

import type { SaveFeedback } from "../AdminEventsEditor";

export default function SaveFeedbackOverlay({ feedback }: { feedback: SaveFeedback }) {
  return (
    <div className="admin-save-feedback-modal" role="alert" aria-live="assertive">
      <div className="admin-save-feedback-panel">
        <span className={`admin-save-feedback-icon is-${feedback.state}`} aria-hidden="true">
          {feedback.state === "success" ? "✓" : null}
        </span>
        <strong>{feedback.label}</strong>
        {feedback.state === "loading" ? <small>Carregando...</small> : <small>Tudo certo.</small>}
      </div>
    </div>
  );
}

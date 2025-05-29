import MonacoEditor from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";

/**
 * Popup/modal code editor using Monaco.
 * 
 * Props:
 * - lines: array of strings (the code to edit) OR string
 * - onSave: function(newLines: string[] | string) => void
 * - onClose: function() => void
 * - language: string (optional, default 'python')
 * - title: string (optional)
 * 
 * The component auto-detects the type of `lines` (array or string) and saves in the same style.
 */
const MonacoCodeEditorPopup = ({
  lines,
  onSave,
  onClose,
  language = "python",
  title = "Редактирование кода",
}) => {
  // Determine initial code value and save style
  const [saveAsString] = useState(() => typeof lines === "string");
  const [code, setCode] = useState(() => {
    if (typeof lines === "string") return lines;
    if (Array.isArray(lines)) return lines.join("");
    return "";
  });
  const overlayRef = useRef();

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose && onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Prevent background scroll when open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Click outside to close
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) {
      onClose && onClose();
    }
  };

  const handleSave = () => {
    if (onSave) {
      if (saveAsString) {
        onSave(code);
      } else {
        // Split into lines, preserving line endings
        const newLines = code.split(/(?<=\n)/g);
        onSave(newLines);
      }
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: "fixed",
        zIndex: 2000,
        top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "8px",
          boxShadow: "0 4px 32px rgba(0,0,0,0.18)",
          minWidth: "600px",
          minHeight: "400px",
          maxWidth: "90vw",
          maxHeight: "90vh",
          width: "70vw",
          height: "70vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          padding: "12px 20px",
          borderBottom: "1px solid #eee",
          background: "#f8f9fa",
          fontWeight: "bold",
          fontSize: "1.1rem",
          flex: "0 0 auto",
        }}>
          {title}
        </div>
        <div style={{ flex: "1 1 0", minHeight: 0, display: "flex" }}>
          <MonacoEditor
            width="100%"
            height="100%"
            defaultLanguage={language}
            value={code}
            onChange={value => setCode(value ?? "")}
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: "on",
              automaticLayout: true,
            }}
          />
        </div>
        <div style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "10px",
          padding: "12px 20px",
          borderTop: "1px solid #eee",
          background: "#f8f9fa",
          flex: "0 0 auto",
        }}>
          <button
            className="btn btn-secondary"
            onClick={onClose}
            type="button"
          >
            Отмена
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            type="button"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
};

export default MonacoCodeEditorPopup;

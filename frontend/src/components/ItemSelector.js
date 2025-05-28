import { useEffect, useRef, useState } from "react";

// Utility function (assumed to exist in your codebase)
function stripCaretDotPrefixes(str) {
  // Placeholder: replace with actual implementation if needed
  return str ? str.replace(/^[\^\.]+/, "") : "";
}

const ItemSelector = ({
  label,
  name,
  value,
  options,
  onChange,
  disabled,
  onLinkClick,
  onCreate,
  linkEnabled = true, // New prop with default true
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  // Always show the value if present, even if not in options, but preprocess for display
  const currentLabel = value ? stripCaretDotPrefixes(value) : "";

  const handleSelect = (selectedValue) => {
    setOpen(false);
    if (selectedValue === "__create_new__") {
      if (typeof onCreate === "function") {
        onCreate();
      }
    } else {
      onChange({ target: { name, value: selectedValue } });
    }
  };

  const handleLinkClick = (e) => {
    e.preventDefault();
    if (onLinkClick && !disabled && linkEnabled) {
      onLinkClick(name, value);
    }
    // Do NOT open dropdown
  };

  const handleArrowClick = (e) => {
    e.preventDefault();
    if (!disabled) setOpen((prev) => !prev);
  };

  // Determine link style and clickability
  const isLinkActive = !disabled && linkEnabled;

  return (
    <div className="mb-3" ref={ref} style={{ position: "relative" }}>
      <label className="form-label text-capitalize">{label}</label>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          minWidth: "180px",
          border: "1px solid #ced4da",
          borderRadius: "4px",
          background: "#fff",
          padding: 0,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {/* Link zone */}
        <a
          href="#"
          className="form-link"
          style={{
            color: isLinkActive ? "#0d6efd" : "#6c757d",
            textDecoration: isLinkActive ? "underline" : "none",
            cursor: isLinkActive ? "pointer" : "not-allowed",
            flex: 1,
            padding: "6px 12px",
            background: "transparent",
            border: "none",
            outline: "none",
            userSelect: "text",
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          onClick={isLinkActive ? handleLinkClick : (e) => e.preventDefault()}
          tabIndex={0}
          aria-disabled={!isLinkActive}
        >
          {currentLabel || <span className="text-muted">Выбрать...</span>}
        </a>
        {/* Divider */}
        <div
          style={{
            width: "1px",
            height: "28px",
            background: "#ced4da",
            margin: "0 2px",
          }}
        />
        {/* Arrow zone */}
        <button
          type="button"
          aria-label="Show options"
          style={{
            border: "none",
            background: "transparent",
            padding: "0 12px",
            cursor: disabled ? "not-allowed" : "pointer",
            height: "100%",
            display: "flex",
            alignItems: "center",
            fontSize: "18px",
            color: "#495057",
          }}
          disabled={disabled}
          onClick={handleArrowClick}
          tabIndex={0}
        >
          <span style={{ display: "inline-block", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
            ▼
          </span>
        </button>
      </div>
      {open && !disabled && (
        <div
          className="dropdown-menu show"
          style={{
            position: "absolute",
            zIndex: 1000,
            minWidth: "180px",
            background: "#fff",
            border: "1px solid #ced4da",
            borderRadius: "4px",
            marginTop: "2px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            maxHeight: "200px",
            overflowY: "auto",
          }}
        >
          {Object.entries(options).map(([optValue, id]) => (
            <button
              type="button"
              className="dropdown-item"
              style={{
                width: "100%",
                textAlign: "left",
                background: optValue === value ? "#e9ecef" : "#fff",
                color: "#212529",
                border: "none",
                padding: "8px 16px",
                cursor: "pointer",
              }}
              key={optValue}
              onClick={() => handleSelect(optValue)}
            >
              {stripCaretDotPrefixes(optValue)}
            </button>
          ))}
          <div style={{ borderTop: "1px solid #eee", margin: "4px 0" }} />
          <button
            type="button"
            className="dropdown-item"
            style={{
              width: "100%",
              textAlign: "left",
              color: "#198754",
              fontWeight: "bold",
              border: "none",
              background: "#fff",
              padding: "8px 16px",
              cursor: "pointer",
            }}
            onClick={() => handleSelect("__create_new__")}
          >
            + Создать новый
          </button>
        </div>
      )}
    </div>
  );
};

export default ItemSelector;

import React, { useEffect, useState, useRef } from "react";
import MonacoCodeEditorPopup from "./MonacoCodeEditorPopup"; // Import the popup

const COMPONENTS = ["indexer", "retriever", "augmenter", "generator"];

const parseContent = (content) => {
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
};

const buildContent = (form) => {
  // Build config JSON from component selectors
  const configJson = {};
  COMPONENTS.forEach((c) => {
    configJson[c] = {
      path: form[c],
      settings: {}, // settings ignored for now
    };
  });
  return JSON.stringify(configJson, null, 2);
};

// Helper to strip all leading "^." from a path string
function stripCaretDotPrefixes(path) {
  if (typeof path !== "string") return path;
  // Remove all leading "^." (one or more)
  return path.replace(/^(?:\^\.)+/, "");
}

/**
 * Custom dropdown for component selection with separate clickable link and dropdown arrow.
 */
const ComponentSelector = ({
  label,
  name,
  value,
  options,
  onChange,
  disabled,
  defaultValue,
  setComponentContent,
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
  const currentLabel = value
    ? stripCaretDotPrefixes(value)
    : "";

  const handleSelect = (path) => {
    setOpen(false);
    if (path === "__create_new__") {
      // Debug message for create new
      console.log(`[DEBUG] Create new selected for ${name}`);
      // Set to default value if provided
      if (defaultValue) {
        onChange({ target: { name, value: defaultValue } });
      }
    } else {
      onChange({ target: { name, value: path } });
    }
  };

  const handleLinkClick = (e) => {
    e.preventDefault();
    setComponentContent([name, value])
    // Do NOT open dropdown
  };

  const handleArrowClick = (e) => {
    e.preventDefault();
    if (!disabled) setOpen((prev) => !prev);
  };

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
            color: "#0d6efd",
            textDecoration: "underline",
            cursor: disabled ? "not-allowed" : "pointer",
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
          onClick={disabled ? undefined : handleLinkClick}
          tabIndex={0}
        >
          {currentLabel || <span className="text-muted">Select...</span>}
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
            {Object.entries(options).map(([path, id]) => (
              <button
                type="button"
                className="dropdown-item"
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: path === value ? "#e9ecef" : "#fff",
                  color: "#212529",
                  border: "none",
                  padding: "8px 16px",
                  cursor: "pointer",
                }}
                key={id}
                onClick={() => handleSelect(path)}
              >
                {stripCaretDotPrefixes(path)}
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
              + Create new
            </button>
          </div>
        )}
    </div>
  );
};

const ConfigCreateForm = ({
  ws,
  onClose,
  onCreated,
  mode = "create", // "create" or "edit"
  config,          // for edit: { id, name, content }
  onUpdated,       // for edit: callback after update
  autoSave = false,
  onAutoSave,
  onConfigsChanged
}) => {
  const [loading, setLoading] = useState(true);
  const [registry, setRegistry] = useState({});
  const [defaults, setDefaults] = useState({});
  const [form, setForm] = useState({
    name: "",
    content: "",
    indexer: "",
    retriever: "",
    augmenter: "",
    generator: "",
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [componentContent, setComponentContent] = useState(null);
  const [editorPopup, setEditorPopup] = useState({ open: false, code: "", compName: "", compPath: "" });
  
  // Track if we should skip the next auto-save (on initial config load in edit mode)
  const skipNextAutoSaveRef = useRef(false);

  const didSend = useRef(false);

  // Only run on mount or when mode/ws changes
  useEffect(() => {
    if (!ws) return;
    if (mode !== "create" && mode !== "edit") return;
    
    // Store current config reference to use inside effect
    const currentConfig = mode === "edit" ? config : null;
    
    setLoading(true);
    const sendCreationInfo = () => {
      if (ws.readyState === WebSocket.OPEN && !didSend.current) {
        didSend.current = true;
        ws.send(JSON.stringify({ command: "config_creation_info", args: [] }));
      }
    };
    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === "ok" && data.registry && data.default_config) {
          setRegistry(data.registry);
          setDefaults(data.default_config);
          // For create: set defaults; for edit: ignore defaults, use config values
          setForm((prev) => {
            if (mode === "edit" && currentConfig) {
              // Parse content JSON to get component paths
              const parsed = parseContent(currentConfig.content);
              // Set skipNextAutoSaveRef to true before setting form
              skipNextAutoSaveRef.current = true;
              return {
                ...prev,
                name: currentConfig.name,
                content: currentConfig.content,
                ...Object.fromEntries(
                  COMPONENTS.map((c) => [c, parsed[c]?.path || ""])
                ),
              };
            } else {
              return {
                ...prev,
                ...Object.fromEntries(
                  COMPONENTS.map((c) => [c, data.default_config[c]?.path || ""])
                ),
              };
            }
          });
        }
        setLoading(false);
      } catch (e) {
        console.error("[DEBUG] Error handling message:", e);
      }
    };
    if (ws.readyState === WebSocket.OPEN) {
      sendCreationInfo();
    } else if (ws.readyState === WebSocket.CONNECTING) {
      ws.addEventListener("open", sendCreationInfo, { once: true });
    }
    ws.addEventListener("message", handleMessage);
    return () => {
      if (!didSend.current && ws.readyState === WebSocket.CONNECTING) {
        ws.removeEventListener("open", sendCreationInfo, { once: true });
      }
      ws.removeEventListener("message", handleMessage);
    };
    // Only depend on ws and mode, not config
  }, [ws, mode]);

  // If config prop changes in edit mode, update form
  useEffect(() => {
    if (mode === "edit" && config) {
      const parsed = parseContent(config.content);
      // Set skipNextAutoSaveRef to true before setting form
      skipNextAutoSaveRef.current = true;
      setForm((prev) => ({
        ...prev,
        name: config.name,
        content: config.content,
        ...Object.fromEntries(
          COMPONENTS.map((c) => [c, parsed[c]?.path || ""])
        ),
      }));
    }
  }, [mode, config]);

  // Show MonacoCodeEditorPopup when componentContent is set
  useEffect(() => {
    if (mode === "edit" && config && componentContent) {
      const [compName, compPath] = componentContent;
      if (
        compName &&
        compPath &&
        registry[compName] &&
        registry[compName][compPath]
      ) {
        const code = registry[compName][compPath][0];
        setEditorPopup({
          open: true,
          lines: code,
          compName,
          compPath,
        });
      }
      setComponentContent(null); // Reset trigger
    }
  }, [componentContent, mode, config, registry]);

  // Instant auto-save on every change in edit+autoSave mode, but not on initial load
  useEffect(() => {
    if (
      mode === "edit" &&
      autoSave &&
      typeof ws !== "undefined" &&
      config &&
      (form.name || form.indexer || form.retriever || form.augmenter || form.generator)
    ) {
      if (skipNextAutoSaveRef.current) {
        // Skip this auto-save, reset the flag
        skipNextAutoSaveRef.current = false;
        return;
      }
      
      // Build content from selectors
      const content = buildContent(form);
      const message = {
        command: "update_config",
        args: [
          config.id,
          form.name,
          content,
        ],
      };
      ws.send(JSON.stringify(message));
      if (typeof onAutoSave === "function") {
        onAutoSave(form);
      }
      if (typeof onConfigsChanged === "function") {
        onConfigsChanged();
      }
    }
  }, [form.name, form.indexer, form.retriever, form.augmenter, form.generator, mode, autoSave, ws, config]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // "To defaults" button for edit mode
  const handleToDefaults = () => {
    if (defaults) {
      setForm((prev) => ({
        ...prev,
        // keep name as is
        ...Object.fromEntries(
          COMPONENTS.map((c) => [c, defaults[c]?.path || ""])
        ),
      }));
    }
  };

  // Handlers for MonacoCodeEditorPopup
  const handleEditorSave = (newLines) => {
    console.log(`[DEBUG] Saved code for ${editorPopup.compName} (${editorPopup.compPath}):\n${newLines}`);
    setEditorPopup({ open: false, code: "", compName: "", compPath: "" });
  };

  const handleEditorClose = () => {
    console.log(`[DEBUG] Editor closed without saving. Component: ${editorPopup.compName} (${editorPopup.compPath})`);
    setEditorPopup({ open: false, code: "", compName: "", compPath: "" });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (mode === "create") {
      // Build config JSON from component selectors
      const configJson = {};
      COMPONENTS.forEach((c) => {
        configJson[c] = {
          path: form[c],
          settings: {}, // settings ignored for now
        };
      });
      const message = {
        command: "config",
        args: [
          form.name,
          "calculation",
          JSON.stringify(configJson),
        ],
      };
      const handleResponse = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.status === "ok") {
            ws.removeEventListener("message", handleResponse);
            setSubmitting(false);
            onCreated && onCreated();
            onClose && onClose();
          } else if (data.status === "error") {
            setError(data.message || "Error creating config");
            setSubmitting(false);
          }
        } catch (e) {}
      };
      ws.addEventListener("message", handleResponse);
      ws.send(JSON.stringify(message));
    } else if (mode === "edit" && config) {
      // Build content from selectors
      const content = buildContent(form);
      const message = {
        command: "update_config",
        args: [
          config.id,
          form.name,
          content,
        ],
      };
      const handleResponse = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.status === "ok" && data.updated_id === config.id) {
            ws.removeEventListener("message", handleResponse);
            setSubmitting(false);
            onUpdated && onUpdated();
            onClose && onClose();
          } else if (data.status === "error") {
            setError(data.message || "Error updating config");
            setSubmitting(false);
          }
        } catch (e) {}
      };
      ws.addEventListener("message", handleResponse);
      ws.send(JSON.stringify(message));
    }
  };

  if (loading) {
    return (
      <div className="p-3">
        <div className="text-secondary">Loading form...</div>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="p-3">
      <h5>{mode === "edit" ? "(editable)" : "Create New Config"}</h5>
      <div className="mb-3">
        <label className="form-label">Name</label>
        <input
          className="form-control"
          name="name"
          value={form.name}
          onChange={handleChange}
          required
          disabled={submitting}
        />
      </div>
      {COMPONENTS.map((comp) => (
        <ComponentSelector
          key={comp}
          label={comp}
          name={comp}
          value={form[comp]}
          options={registry[comp] || {}}
          onChange={handleChange}
          disabled={submitting}
          defaultValue={defaults[comp]?.path || ""}
          setComponentContent={setComponentContent}
        />
      ))}
      {mode === "edit" && defaults && (
        <button
          type="button"
          className="btn btn-outline-secondary mb-3"
          onClick={handleToDefaults}
          disabled={submitting}
        >
          To defaults
        </button>
      )}
      {error && <div className="alert alert-danger">{error}</div>}
      {!(mode === "edit" && autoSave) && (
        <div className="d-flex justify-content-end">
          <button
            type="button"
            className="btn btn-secondary me-2"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting
              ? mode === "edit"
                ? "Saving..."
                : "Creating..."
              : mode === "edit"
              ? "Save"
              : "Create"}
          </button>
        </div>
      )}
      </form>
      {editorPopup.open && (
        <MonacoCodeEditorPopup
          lines={editorPopup.lines || []}
          onSave={handleEditorSave}
          onClose={handleEditorClose}
          language="python"
          title={`${editorPopup.compName}: ${stripCaretDotPrefixes(editorPopup.compPath)}`}
        />
      )}
    </>
  );
};

export default ConfigCreateForm;

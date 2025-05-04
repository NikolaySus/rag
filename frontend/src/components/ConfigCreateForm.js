import React, { useEffect, useState, useRef } from "react";

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
  
  // Track if we should skip the next auto-save (on initial config load in edit mode)
  const skipNextAutoSaveRef = useRef(false);

  const didSend = useRef(false);

  // Always fetch registry/defaults on mount
  useEffect(() => {
    if (!ws) return;
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
            if (mode === "edit" && config) {
              // Parse content JSON to get component paths
              const parsed = parseContent(config.content);
              // Set skipNextAutoSaveRef to true before setting form
              skipNextAutoSaveRef.current = true;
              return {
                ...prev,
                name: config.name,
                content: config.content,
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
      } catch (e) {}
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
    // eslint-disable-next-line
  }, [ws, mode, config]);

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
    // eslint-disable-next-line
  }, [form, mode, autoSave, ws, config]);

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
        <div className="mb-3" key={comp}>
          <label className="form-label text-capitalize">{comp}</label>
          <select
            className="form-select"
            name={comp}
            value={form[comp]}
            onChange={handleChange}
            required
            disabled={submitting}
          >
            {Object.entries(registry[comp] || {}).map(([path, id]) => (
              <option value={path} key={id}>
                {path}
              </option>
            ))}
          </select>
        </div>
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
  );
};

export default ConfigCreateForm;
